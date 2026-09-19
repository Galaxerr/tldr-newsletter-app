import { createLibraryStorage, loadLegacyLibrary, readRecord } from './libraryStorage.js';
import { emptyLibrary, editionMetadata } from './library.js';
import { SecurityError } from './securityErrors.js';

// Serialize across repository instances too, so switching back to an account cannot race a write.
const queues = new WeakMap();
export const createEncryptedLibraryStorage = ({ storage, keyStorage, crypto, assertActive = () => {} }, accountId) => {
  if (typeof accountId !== 'string' || !accountId || accountId.length > 256) throw new SecurityError('STORAGE');
  const root = `@tldr/accounts/${encodeURIComponent(accountId)}/`;
  const legacyPrefix = root + 'library-v1/';
  const prefix = root + 'library-v2/';
  const deleting = root + 'deleting';
  const migration = prefix + 'migration';
  const keyName = 'tldr.library-key.' + [...new TextEncoder().encode(accountId)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  let key = null;
  let cipher = null;
  let repository = null;
  let disposed = false;
  const check = () => {
    assertActive();
    if (disposed) throw new SecurityError('SESSION');
  };
  if (!queues.has(storage)) queues.set(storage, new Map());
  const accountQueues = queues.get(storage);
  const serialize = (work) => {
    const result = (accountQueues.get(accountId) || Promise.resolve()).then(() => { check(); return work(); });
    const settled = result.catch(() => {});
    accountQueues.set(accountId, settled);
    settled.finally(() => { if (accountQueues.get(accountId) === settled) accountQueues.delete(accountId); });
    return result;
  };
  const decrypt = async (name, raw) => {
    check();
    if (raw === null) return null;
    const envelope = readRecord(raw);
    if (!envelope || envelope.version !== 2 || typeof envelope.sealed !== 'string') throw new SecurityError('STORAGE');
    const value = await cipher.decrypt(envelope.sealed, name);
    check();
    return value;
  };
  const encrypt = async (name, value) => {
    check();
    const sealed = await cipher.encrypt(value, name);
    check();
    return JSON.stringify({ version: 2, sealed });
  };
  const encrypted = {
    getItem: async (name) => decrypt(name, await storage.getItem(name)),
    async setItem(name, value) {
      const raw = await encrypt(name, value);
      check();
      await storage.setItem(name, raw);
    },
    async multiGet(names) {
      const values = await storage.multiGet(names);
      return Promise.all(values.map(async ([name, raw]) => [name, await decrypt(name, raw)]));
    },
    async multiSet(values) {
      // Limit simultaneous native crypto calls even during a large one-time migration.
      for (let i = 0; i < values.length; i += 6) {
        const batch = await Promise.all(values.slice(i, i + 6).map(async ([name, value]) => [name, await encrypt(name, value)]));
        check();
        await storage.multiSet(batch);
      }
    },
    getAllKeys: () => storage.getAllKeys(),
    multiRemove: async (names) => { check(); await storage.multiRemove(names); },
  };
  const open = async () => {
    check();
    if (await storage.getItem(deleting)) throw new SecurityError('STORAGE');
    const raw = await storage.getItem(prefix + 'index');
    key = await keyStorage.getItem(keyName);
    let validatedLegacy = null;
    if (!key) {
      const keys = await storage.getAllKeys();
      if (keys.some((name) => name.startsWith(prefix))) throw new SecurityError('STORAGE');
      const source = await storage.getItem(legacyPrefix + 'index');
      if (source) validatedLegacy = await loadLegacyLibrary(storage, legacyPrefix, source);
      if ((!source || !validatedLegacy.newsletters.length) && keys.some((name) => name.startsWith(legacyPrefix + 'edition/'))) {
        throw new SecurityError('STORAGE');
      }
      key = await crypto.generateKey();
      check();
      await keyStorage.setItem(keyName, key);
      if (await keyStorage.getItem(keyName) !== key) throw new SecurityError('STORAGE');
    }
    check();
    cipher?.dispose?.();
    cipher = crypto.createSession ? crypto.createSession(key) : {
      encrypt: (value, name) => crypto.encrypt(key, value, name),
      decrypt: (value, name) => crypto.decrypt(key, value, name),
    };
    repository = createLibraryStorage(encrypted, prefix, {
      revision: crypto.revision || (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`),
      assertActive: check,
    });
    const decoded = raw === null ? null : await decrypt(prefix + 'index', raw);
    const index = decoded === null ? null : readRecord(decoded);
    if (index?.version !== 3) {
      const legacyRaw = index ? null : await storage.getItem(legacyPrefix + 'index');
      const keys = await storage.getAllKeys();
      if (!index && !legacyRaw && keys.some((name) => name.startsWith(prefix) || name.startsWith(legacyPrefix))) {
        throw new SecurityError('STORAGE');
      }
      const original = index
        ? await loadLegacyLibrary(encrypted, prefix, decoded)
        : legacyRaw ? validatedLegacy || await loadLegacyLibrary(storage, legacyPrefix, legacyRaw) : emptyLibrary();
      if (!original.newsletters.length && keys.some((name) => name.startsWith(legacyPrefix + 'edition/'))) {
        throw new SecurityError('STORAGE');
      }
      const editions = original.newsletters.map((edition) => index ? edition : { ...edition, verification: null });
      // Preserve a recoverable source index until every newly encrypted body has been read back.
      await encrypted.setItem(migration, JSON.stringify({ sourceIndex: decoded || legacyRaw }));
      const next = await repository.commit({
        index: { ...emptyLibrary(), articleState: original.articleState, lastSyncedAt: original.lastSyncedAt,
          newsletters: editions.map(editionMetadata) },
        editions,
      });
      await repository.readEditions(next.newsletters);
      check();
      await storage.removeItem(migration);
    } else if (await storage.getItem(migration)) {
      // A previous run committed the new index but stopped during read-back validation.
      await repository.readEditions(index.newsletters);
      check();
      await storage.removeItem(migration);
    }
    // Index validation precedes all garbage collection; corruption never authorizes a reset.
    const result = await repository.loadIndex(index?.version === 3 ? index : undefined);
    const legacyKeys = (await storage.getAllKeys()).filter((name) => name.startsWith(legacyPrefix));
    if (legacyKeys.length) {
      check();
      await storage.multiRemove(legacyKeys);
    }
    check();
    return result;
  };
  return {
    loadIndex: () => serialize(open),
    readEditions: (metadata) => serialize(async () => {
      if (!repository) await open();
      const editions = await repository.readEditions(metadata);
      check();
      return editions;
    }),
    commit: (changes) => serialize(async () => {
      if (!repository) await open();
      // A clear from a different repository instance invalidates this key and all queued writes.
      if (await storage.getItem(deleting) || await keyStorage.getItem(keyName) !== key ||
        !await storage.getItem(prefix + 'index')) throw new SecurityError('STORAGE');
      const result = await repository.commit(changes);
      check();
      return result;
    }),
    clear: () => serialize(async () => {
      await storage.setItem(deleting, '1');
      const keys = (await storage.getAllKeys()).filter((name) => name.startsWith(prefix) || name.startsWith(legacyPrefix));
      check();
      if (keys.length) await storage.multiRemove(keys);
      await keyStorage.removeItem(keyName);
      await storage.removeItem(deleting);
      cipher?.dispose?.();
      key = null;
      cipher = null;
      repository = null;
    }),
    dispose() {
      disposed = true;
      cipher?.dispose?.();
      cipher = null;
      key = null;
      repository = null;
    },
  };
};
