import { createLibraryStorage } from './libraryStorage.js';
import { emptyLibrary } from './library.js';
import { SecurityError } from './securityErrors.js';

// Writes must be queued per account because an earlier account session can still be
// in flight while the user switches, hydrates, or clears the library. The WeakMap
// keeps each storage backend isolated instead of sharing a single global queue.
const queues = new WeakMap();

export const createEncryptedLibraryStorage = ({ storage, keyStorage, crypto, assertActive = () => {} }, accountId) => {
  if (typeof accountId !== 'string' || !accountId || accountId.length > 256) {
    throw new SecurityError('STORAGE');
  }

  const root = `@tldr/accounts/${encodeURIComponent(accountId)}/`;
  const legacyPrefix = root + 'library-v1/';
  const prefix = root + 'library-v2/';
  const deleting = root + 'deleting';
  let loadedKey = null;

  // SecureStore accepts only alphanumeric, '.', '-' and '_' keys, so we derive a
  // safe storage name from the account identifier rather than using raw user data.
  const keyName = 'tldr.library-key.' + [...new TextEncoder().encode(accountId)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (!queues.has(storage)) {
    queues.set(storage, new Map());
  }

  const accountQueues = queues.get(storage);

  const serialize = (work) => {
    const result = (accountQueues.get(accountId) || Promise.resolve()).then(work);
    const settled = result.catch(() => {});

    accountQueues.set(accountId, settled);
    settled.finally(() => {
      if (accountQueues.get(accountId) === settled) {
        accountQueues.delete(accountId);
      }
    });

    return result;
  };

  const removeLegacy = async () => {
    const keys = (await storage.getAllKeys()).filter((key) => key.startsWith(legacyPrefix));
    if (keys.length) {
      await storage.multiRemove(keys);
    }
  };

  const repository = (key) =>
    createLibraryStorage(
      {
        async getItem(oldName) {
          const name = prefix + oldName.slice(legacyPrefix.length);
          const raw = await storage.getItem(name);

          if (raw === null) {
            return null;
          }

          const envelope = JSON.parse(raw);
          if (envelope.version !== 2 || typeof envelope.sealed !== 'string') {
            throw new SecurityError('STORAGE');
          }

          return crypto.decrypt(key, envelope.sealed, name);
        },
        async setItem(oldName, value) {
          assertActive();

          const name = prefix + oldName.slice(legacyPrefix.length);
          const sealed = await crypto.encrypt(key, value, name);

          assertActive();
          await storage.setItem(name, JSON.stringify({ version: 2, sealed }));
        },
      },
      accountId
    );

  const open = async () => {
    assertActive();

    if (await storage.getItem(deleting)) {
      throw new SecurityError('STORAGE');
    }

    const keys = await storage.getAllKeys();
    const needsMigration = !keys.includes(prefix + 'index');
    let original;

    if (needsMigration) {
      const hasLegacyIndex = keys.includes(legacyPrefix + 'index');
      const hasRecords = keys.some((name) => name.startsWith(legacyPrefix) || name.startsWith(prefix));

      // Validate the source before creating a key or writing any destination.
      // Orphaned records may belong to an interrupted save; preserve them for
      // recovery instead of committing an empty index and deleting the source.
      if (!hasLegacyIndex && hasRecords) {
        throw new SecurityError('STORAGE');
      }

      original = hasLegacyIndex ? await createLibraryStorage(storage, accountId).load() : emptyLibrary();
      const hasLegacyEditions = keys.some((name) => name.startsWith(legacyPrefix + 'edition/'));

      if (original.newsletters.length === 0 && hasLegacyEditions) {
        throw new SecurityError('STORAGE');
      }
    }

    let key = await keyStorage.getItem(keyName);

    if (!key) {
      // Never overwrite a lost key when encrypted content already exists: a
      // partial or stale key rotation would make the library unreadable.
      if (keys.some((name) => name.startsWith(prefix))) {
        throw new SecurityError('STORAGE');
      }

      key = await crypto.generateKey();
      assertActive();
      await keyStorage.setItem(keyName, key);

      if ((await keyStorage.getItem(keyName)) !== key) {
        throw new SecurityError('STORAGE');
      }
    }

    const encrypted = repository(key);

    if (needsMigration) {
      // Earlier versions could import newsletters from arbitrary senders. We keep
      // their summaries, but only a newly verified Gmail import is allowed to
      // restore trust for link opening and article verification.
      const migrated = {
        ...original,
        newsletters: original.newsletters.map((edition) => ({
          ...edition,
          verification: null,
        })),
      };

      await encrypted.save(migrated, emptyLibrary());
    }

    // Load the encrypted library only after migration is complete, then purge the
    // plaintext legacy namespace before finishing startup.
    const library = await encrypted.load();
    assertActive();
    await removeLegacy();
    loadedKey = key;

    return { encrypted, library };
  };

  return {
    load: () => serialize(async () => (await open()).library),
    save: (next, previous) =>
      serialize(async () => {
        // Hydrate and migrate once, then serialize later bookmark updates against
        // the same account key. We still verify the tombstone and
        // key match before each save in case a concurrent clear occurred.
        if (!loadedKey) {
          await open();
        }

        assertActive();

        if (
          (await storage.getItem(deleting)) ||
          (await keyStorage.getItem(keyName)) !== loadedKey ||
          !(await storage.getItem(prefix + 'index'))
        ) {
          throw new SecurityError('STORAGE');
        }

        await repository(loadedKey).save(next, previous);
        assertActive();
      }),
    clear: () =>
      serialize(async () => {
        assertActive();

        // An interrupted erase must not leave behind a partially deleted library on
        // restart; the tombstone ensures the app refuses to reopen a mid-clear state.
        await storage.setItem(deleting, '1');

        const keys = (await storage.getAllKeys()).filter(
          (name) => name.startsWith(prefix) || name.startsWith(legacyPrefix)
        );

        if (keys.length) {
          await storage.multiRemove(keys);
        }

        await keyStorage.removeItem(keyName);
        await storage.removeItem(deleting);
        loadedKey = null;
      }),
  };
};
