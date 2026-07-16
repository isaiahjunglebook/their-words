import { checkAuth } from '../lib/auth.mjs';
import { readFile, commitFiles } from '../lib/github.mjs';
import { nextId, validateEntry, renderJson, renderMarkdown, parseJson } from '../lib/canon.mjs';

// The human gate, dashboard edition. One decision per quote:
//   { action: "approve", slug, quoteId, quote, tags }  → next TW id, append to
//     canon, regenerate both canon files, remove the quote from its candidate
//     file (delete the file when it empties) — all in ONE commit.
//   { action: "kill", slug, quoteId } → remove the quote, commit.
// The `quote` on approve is the owner's final context-window selection /
// bracket redaction of the verbatim text captured at ingest. Nothing
// auto-approves; every call here is an explicit owner decision.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkAuth(req, res)) return;

  const { action, slug, quoteId, quote, tags } = req.body || {};
  if (!['approve', 'kill'].includes(action)) return res.status(400).json({ error: 'bad action' });
  if (!slug || !quoteId) return res.status(400).json({ error: 'slug and quoteId required' });
  if (!/^[\w.-]+$/.test(slug)) return res.status(400).json({ error: 'bad slug' });

  try {
    const candPath = `candidates/${slug}.json`;
    const candText = await readFile(candPath);
    if (!candText) return res.status(404).json({ error: `no candidate file for ${slug}` });
    const batch = JSON.parse(candText);
    const idx = (batch.quotes || []).findIndex((q) => q.id === quoteId);
    if (idx === -1) return res.status(404).json({ error: `quote ${quoteId} not found (already decided?)` });
    const cand = batch.quotes[idx];

    batch.quotes.splice(idx, 1);
    const candChange = batch.quotes.length
      ? { path: candPath, content: JSON.stringify(batch, null, 2) + '\n' }
      : { path: candPath, delete: true };

    if (action === 'kill') {
      const sha = await commitFiles(`${batch.date || 'review'}: kill 1 candidate from ${batch.call_name || slug}`, [candChange]);
      return res.status(200).json({ ok: true, action: 'kill', remaining: batch.quotes.length, commit: sha });
    }

    // approve
    const canonText = (await readFile('their-words.json')) || renderJson([]);
    const entries = parseJson(canonText);
    const entry = {
      id: nextId(entries),
      date: batch.date,
      man: cand.man,
      context: batch.context_label || 'Call',
      quote: (quote && quote.trim()) || cand.quote,
      tags: Array.isArray(tags) && tags.length ? tags : cand.tags || [],
      source: { slug: batch.slug || slug, timestamp: cand.timestamp || null },
    };
    const problems = validateEntry(entry);
    if (problems.length) return res.status(400).json({ error: `invalid entry: ${problems.join('; ')}` });

    entries.push(entry);
    const sha = await commitFiles(
      `${entry.date}: +1 entry (${entry.id}) from ${batch.call_name || slug}`,
      [
        { path: 'their-words.json', content: renderJson(entries) },
        { path: 'their-words.md', content: renderMarkdown(entries) },
        candChange,
      ]
    );
    res.status(200).json({ ok: true, action: 'approve', entry, remaining: batch.quotes.length, commit: sha });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
