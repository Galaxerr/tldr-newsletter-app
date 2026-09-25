import assert from 'node:assert/strict';
import test from 'node:test';
import { editionRequestKey, indexEditions } from '../src/services/editionSelection.js';

test('edition lookup preserves request order, missing IDs and duplicate requests', () => {
  const metadata = [{ id: 'a', bodyRef: 'revision-a', verification: { version: 1, status: 'verified' } },
    { id: 'b', bodyRef: 'revision-b', verification: null }];
  assert.deepEqual(JSON.parse(editionRequestKey(['b', 'missing', 'a', 'a'], indexEditions(metadata))), [
    ['b', 'revision-b', null], ['missing', null, null],
    ['a', 'revision-a', { version: 1, status: 'verified' }], ['a', 'revision-a', { version: 1, status: 'verified' }],
  ]);
});

test('body revision and verification changes invalidate selection but bookmarks do not', () => {
  const edition = { id: 'a', bodyRef: 'revision-1', verification: { version: 1, status: 'verified' } };
  const key = (value) => editionRequestKey(['a'], indexEditions([value]));
  assert.notEqual(key({ ...edition, bodyRef: 'revision-2' }), key(edition));
  assert.notEqual(key({ ...edition, verification: null }), key(edition));
  assert.notEqual(key({ ...edition, verification: { version: 2, status: 'verified' } }), key(edition));
  assert.equal(key({ ...edition, bookmarked: true }), key(edition));
  assert.notEqual(editionRequestKey(['a'], indexEditions([])), key(edition));
});
