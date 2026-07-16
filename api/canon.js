import { checkAuth } from '../lib/auth.mjs';
import { readFile } from '../lib/github.mjs';

// Live canon straight from the repo head. Password-gated: the entire site is
// behind ADMIN_PASSWORD (owner decision — Vercel's all-deployments protection
// is plan-gated), so no quote data is served without it. The static bundle
// contains no canon copy (see tools/build-viewer.mjs).
export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  try {
    const text = await readFile('their-words.json');
    if (!text) return res.status(404).json({ error: 'canon not found' });
    res.setHeader('cache-control', 'no-store');
    res.status(200).send(text);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
