import { safeMessage } from './securityErrors.js';

export const emptyEditionResult = () => ({
  store: null, key: null, attempt: null, editions: [], loading: false, error: null,
});

// Retain bodies only when both their revision and source verification still match.
// Filtering at render time also closes the gap before an effect sees new metadata.
const matchingEditions = (editions, key) => {
  const byId = new Map(editions.map((edition) => [edition.id, edition]));
  const selected = new Map();
  for (const entry of JSON.parse(key)) {
    const edition = byId.get(entry[0]);
    if (edition && JSON.stringify([edition.id, edition.bodyRef, edition.verification]) === JSON.stringify(entry)) {
      selected.set(edition.id, edition);
    }
  }
  return [...selected.values()];
};

export const editionResultView = (result, { store, key, attempt = 0, incremental = false, focused = true }) => {
  const sameStore = result.store === store;
  const current = sameStore && result.key === key && result.attempt === attempt;
  return {
    editions: focused && sameStore && (current || incremental) ? matchingEditions(result.editions, key) : [],
    loading: focused && (!current || result.loading),
    error: focused && current ? result.error : null,
  };
};

/** One cancellable, screen-owned body request. Incremental requests read only the
 * missing revisions and keep valid previous bodies available if the read fails.
 */
export const startEditionRead = ({
  store, key, attempt = 0, incremental = false, pin = false, previous = emptyEditionResult(), onChange,
}) => {
  let active = true;
  const requested = [...new Set(JSON.parse(key).map(([id]) => id))];
  const editions = incremental && previous.store === store ? matchingEditions(previous.editions, key) : [];
  const loadedIds = new Set(editions.map(({ id }) => id));
  const missing = requested.filter((id) => !loadedIds.has(id));
  const base = { store, key, attempt, editions, error: null };
  const release = store.retainBodies(requested);
  const unpin = pin ? requested.map(store.pinEdition) : [];
  onChange({ ...base, loading: true });
  const completion = Promise.resolve().then(() => active && missing.length ? store.readEditions(missing) : []).then(
    (loaded) => {
      if (active) onChange({ ...base, editions: matchingEditions([...editions, ...loaded], key), loading: false });
    },
    (error) => {
      if (active) onChange({ ...base, loading: false, error: safeMessage(error, 'STORAGE') });
    }
  );
  return {
    completion,
    cancel: () => {
      if (!active) return;
      active = false;
      release();
      unpin.forEach((done) => done());
    },
  };
};
