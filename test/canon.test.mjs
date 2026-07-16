import test from 'node:test';
import assert from 'node:assert/strict';
import { nextId, validateEntry, renderJson, parseJson, renderMarkdown, contextFromManifest } from '../lib/canon.mjs';

const sample = (over = {}) => ({
  id: 'TW-0001',
  date: '2026-08-01',
  man: 'SS',
  context: 'Squad call 4',
  quote: 'I keep telling myself I\'ll be more present when work slows down. It never slows down.',
  tags: ['deferral'],
  source: { slug: '2026-08-01-turbo-squad-call-4', timestamp: '00:14:22' },
  ...over,
});

test('ids are sequential and zero-padded', () => {
  assert.equal(nextId([]), 'TW-0001');
  assert.equal(nextId([sample()]), 'TW-0002');
  assert.equal(nextId([sample({ id: 'TW-0099' })]), 'TW-0100');
});

test('json round-trip preserves entries exactly', () => {
  const entries = [sample(), sample({ id: 'TW-0002', man: 'AD', context: 'Text', source: null })];
  assert.deepEqual(parseJson(renderJson(entries)), entries);
});

test('markdown contains tag index, entry, and provenance', () => {
  const md = renderMarkdown([sample()]);
  assert.match(md, /## Tag index/);
  assert.match(md, /\*\*deferral\*\* \(1\): TW-0001/);
  assert.match(md, /> I keep telling myself/);
  assert.match(md, /2026-08-01-turbo-squad-call-4 @ \[00:14:22\]/);
});

test('validation rejects bad entries', () => {
  assert.equal(validateEntry(sample()).length, 0);
  assert.ok(validateEntry(sample({ tags: [] })).length > 0);
  assert.ok(validateEntry(sample({ quote: '  ' })).length > 0);
  assert.equal(validateEntry(sample({ man: 'Ludi V' })).length, 0); // first name + last initial is fine
  assert.ok(validateEntry(sample({ man: '' })).length > 0);
  assert.ok(validateEntry(sample({ man: 'A'.repeat(30) })).length > 0);
  assert.ok(validateEntry(sample({ date: '8/1/26' })).length > 0);
});

test('context derivation from manifest classification with fallback', () => {
  assert.equal(
    contextFromManifest({ classification: { call_type: 'squad', call_number: 4 } }),
    'Squad call 4'
  );
  assert.equal(contextFromManifest({ classification: { call_type: 'one_on_one' } }), '1:1');
  assert.equal(contextFromManifest({ classification: null, call_name: 'Intro Call — Adam' }), 'Intro call');
  assert.equal(contextFromManifest({ classification: null, call_name: 'Weekly', tags: ['squad'] }), 'Squad call');
});
