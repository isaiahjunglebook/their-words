import { checkAuth } from '../lib/auth.mjs';
import { readFile, commitFiles } from '../lib/github.mjs';
import { nextId, validateEntry, renderJson, renderMarkdown, parseJson } from '../lib/canon.mjs';

// Manually add a text-message quote (spec §5.6): same schema, context "Text",
// same commit flow. The owner types it in, so it is approved by definition.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkAuth(req, res)) return;

  const { date, man, quote, tags } = req.body || {};
  try {
    const canonText = (await readFile('their-words.json')) || renderJson([]);
    const entries = parseJson(canonText);
    const entry = {
      id: nextId(entries),
      date,
      man: (man || '').trim(),
      context: 'Text',
      quote: (quote || '').trim(),
      tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
      source: null,
    };
    const problems = validateEntry(entry);
    if (problems.length) return res.status(400).json({ error: `invalid entry: ${problems.join('; ')}` });

    entries.push(entry);
    const sha = await commitFiles(`${entry.date}: +1 text entry (${entry.id}) from ${entry.man}`, [
      { path: 'their-words.json', content: renderJson(entries) },
      { path: 'their-words.md', content: renderMarkdown(entries) },
    ]);
    res.status(200).json({ ok: true, entry, commit: sha });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
