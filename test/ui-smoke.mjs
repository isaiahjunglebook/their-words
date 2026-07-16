// Browser-level smoke test of the dashboard: serves public/ locally with
// stubbed API endpoints and drives the real page in headless Chromium.
// Exists because a server-side test cannot catch "the server said unlocked
// but the lock screen stayed visible" — only looking at the rendered page can.
//
// Run:  npm run test:ui   (requires `npm i --no-save playwright` once;
//        Chromium itself is expected preinstalled or via playwright install)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PASSWORD = 'test-pw';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

const sampleBatch = {
  slug: 'smoke-call',
  call_name: 'Smoke Test Call',
  date: '2026-07-16',
  context_label: 'Squad call 1',
  quotes: [{ id: 'c1', man: 'Test T', timestamp: '00:01:00', quote: 'A smoke-test quote.', tags: ['deferral'], tag_note: '', proposed_new_tag: null, why: '' }],
};

function authed(req) {
  return (req.headers['authorization'] || '') === `Bearer ${PASSWORD}`;
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const json = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (url === '/api/auth') return authed(req) ? json(200, { ok: true }) : json(401, { error: 'Wrong password' });
  if (url === '/api/canon') return authed(req) ? json(200, { count: 0, entries: [] }) : json(401, { error: 'Wrong password' });
  if (url === '/api/candidates') return authed(req) ? json(200, { batches: [sampleBatch] }) : json(401, { error: 'Wrong password' });
  const file = path.join(root, 'public', url === '/' ? 'index.html' : url);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'text/plain' });
    return res.end(fs.readFileSync(file));
  }
  res.writeHead(404).end('not found');
});

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };
const pass = (msg) => console.log(`ok - ${msg}`);

await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
await page.goto(base);

// 1. Locked on load: gate visible, content not.
(await page.locator('#gate').isVisible()) ? pass('gate visible on load') : fail('gate not visible on load');
(await page.locator('.site-header').isVisible()) ? fail('header visible while locked') : pass('header hidden while locked');

// 2. Wrong password: error shows, still locked.
await page.fill('#gate-input', 'nope');
await page.click('#gate-form button');
await page.waitForSelector('#gate-error:not([hidden])');
pass('wrong password shows error');
(await page.locator('#gate').isVisible()) ? pass('still locked after wrong password') : fail('unlocked by wrong password');

// 3. Right password: gate VISUALLY gone, content visible.
await page.fill('#gate-input', PASSWORD);
await page.click('#gate-form button');
await page.waitForSelector('.site-header:not([hidden])');
(await page.locator('#gate').isVisible()) ? fail('gate still visible after unlock — the exact bug this test exists for') : pass('gate visually gone after unlock');
(await page.locator('.site-header').isVisible()) ? pass('header visible after unlock') : fail('header not visible after unlock');
(await page.locator('#empty').textContent()).includes('canon is empty') ? pass('empty-canon message shown') : fail('empty-canon message missing');

// 4. Review queue renders candidates.
await page.click('#review-toggle');
await page.waitForSelector('.cand');
(await page.locator('.batch-title').first().textContent()).includes('Smoke Test Call') ? pass('review queue renders candidate batch') : fail('review queue missing batch');

await browser.close();
server.close();
console.log(process.exitCode ? '\nUI SMOKE FAILED' : '\nUI SMOKE PASSED');
