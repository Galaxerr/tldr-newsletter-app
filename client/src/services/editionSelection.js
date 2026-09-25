// Metadata references are immutable across revisions; bookmark-only updates reuse them.
export const indexEditions = (newsletters) => new Map(newsletters.map((edition) => [edition.id, edition]));

// Preserve order, missing IDs, and verification changes in the body-effect dependency.
export const editionRequestKey = (ids, byId) => JSON.stringify(ids.map((id) => {
  const metadata = byId.get(id);
  return [id, metadata?.bodyRef, metadata?.verification];
}));
