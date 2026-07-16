import { readFile } from '../lib/github.mjs';

// Live canon straight from the repo head, so freshly approved entries show up
// in the viewer without waiting for a redeploy. The viewer falls back to the
// static /their-words.json bundled at deploy time if this endpoint fails.
export default async function handler(req, res) {
  try {
    const text = await readFile('their-words.json');
    if (!text) return res.status(404).json({ error: 'canon not found' });
    res.setHeader('cache-control', 'no-store');
    res.status(200).send(text);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
