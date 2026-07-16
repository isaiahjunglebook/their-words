// Exercises the /api/review handler end-to-end with a mocked GitHub API:
// approve moves a quote into both canon files and updates the candidate file
// in a single commit; kill only touches the candidate file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderJson } from '../lib/canon.mjs';

process.env.ADMIN_PASSWORD = 'test-pw';
process.env.GITHUB_TOKEN = 'fake';
process.env.GITHUB_REPO = 'owner/repo';
process.env.GITHUB_BRANCH = 'main';

const handler = (await import('../api/review.js')).default;

const batch = {
  slug: 'call-1',
  call_name: 'Turbo Squad: Call 1',
  date: '2026-08-01',
  context_label: 'Squad call 1',
  quotes: [
    { id: 'c1', man: 'SS', timestamp: '00:14:22', quote: 'It never slows down.', tags: ['deferral'] },
    { id: 'c2', man: 'AD', timestamp: '00:20:00', quote: 'That is me.', tags: ['founder-story-resonance'] },
  ],
};

function mockGitHub(files) {
  const commits = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const p = u.pathname;
    const json = (data, status = 200) => ({
      ok: status < 400, status,
      json: async () => data, text: async () => JSON.stringify(data),
    });
    if (p.includes('/contents/')) {
      const filePath = decodeURIComponent(p.split('/contents/')[1]);
      if (!(filePath in files)) return json(null, 404);
      return json({ content: Buffer.from(files[filePath]).toString('base64') });
    }
    if (p.endsWith('/git/ref/heads/main')) return json({ object: { sha: 'head' } });
    if (p.includes('/git/commits/head')) return json({ tree: { sha: 'tree0' } });
    if (p.endsWith('/git/trees')) {
      commits.push(JSON.parse(opts.body).tree);
      return json({ sha: 'tree1' });
    }
    if (p.endsWith('/git/commits')) return json({ sha: 'commit1' });
    if (p.includes('/git/refs/heads/')) return json({ ok: true });
    return json({ error: `unmocked ${p}` }, 500);
  };
  return commits;
}

function makeRes() {
  const res = { code: 0, body: null };
  res.status = (c) => ((res.code = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = () => res;
  res.send = (b) => ((res.body = b), res);
  return res;
}

const authedReq = (body) => ({
  method: 'POST',
  headers: { authorization: 'Bearer test-pw' },
  body,
});

test('approve appends a TW entry and rewrites canon + candidate in one commit', async () => {
  const commits = mockGitHub({
    'candidates/call-1.json': JSON.stringify(batch),
    'their-words.json': renderJson([]),
  });
  const res = makeRes();
  await handler(authedReq({ action: 'approve', slug: 'call-1', quoteId: 'c1', tags: ['deferral', 'the-lie'] }), res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.entry.id, 'TW-0001');
  assert.deepEqual(res.body.entry.tags, ['deferral', 'the-lie']);
  assert.equal(res.body.remaining, 1);

  const tree = commits[0];
  const paths = tree.map((t) => t.path).sort();
  assert.deepEqual(paths, ['candidates/call-1.json', 'their-words.json', 'their-words.md']);
  const canon = JSON.parse(tree.find((t) => t.path === 'their-words.json').content);
  assert.equal(canon.entries[0].quote, 'It never slows down.');
  const cand = JSON.parse(tree.find((t) => t.path === 'candidates/call-1.json').content);
  assert.equal(cand.quotes.length, 1);
});

test('kill on the last quote deletes the candidate file', async () => {
  const oneLeft = { ...batch, quotes: [batch.quotes[1]] };
  const commits = mockGitHub({ 'candidates/call-1.json': JSON.stringify(oneLeft) });
  const res = makeRes();
  await handler(authedReq({ action: 'kill', slug: 'call-1', quoteId: 'c2' }), res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(commits[0].length, 1);
  assert.equal(commits[0][0].sha, null); // deletion
});

test('wrong password is rejected', async () => {
  mockGitHub({});
  const res = makeRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer nope' }, body: {} }, res);
  assert.equal(res.code, 401);
});

test('unknown quote id 404s without committing', async () => {
  const commits = mockGitHub({ 'candidates/call-1.json': JSON.stringify(batch) });
  const res = makeRes();
  await handler(authedReq({ action: 'approve', slug: 'call-1', quoteId: 'c99' }), res);
  assert.equal(res.code, 404);
  assert.equal(commits.length, 0);
});
