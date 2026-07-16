import { checkAuth } from '../lib/auth.mjs';
import { listDir, readFile } from '../lib/github.mjs';

// List all pending candidate batches (anonymized at ingest time on the Mac —
// see DECISIONS.md A1). Always read live from GitHub, never from the deploy
// bundle, so the queue is current the moment ingest pushes.
export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  try {
    const files = await listDir('candidates');
    const batches = [];
    for (const f of files) {
      if (f.type !== 'file' || !f.name.endsWith('.json')) continue;
      const text = await readFile(`candidates/${f.name}`);
      if (!text) continue;
      try {
        batches.push(JSON.parse(text));
      } catch {
        batches.push({ slug: f.name, error: 'unparseable candidate file' });
      }
    }
    batches.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({ batches });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
