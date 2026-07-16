// The canon model: one in-memory representation, two rendered artifacts.
// their-words.json is the machine mirror the viewer reads; their-words.md is
// the human-readable canon with a regenerated tag index at the top. Both are
// always regenerated together from the same entry list so they cannot drift.

/**
 * Entry shape:
 * {
 *   id: "TW-0001",            // sequential, never reused, never renumbered
 *   date: "YYYY-MM-DD",
 *   man: "SS",                // roster initials only
 *   context: "Squad call 4",  // or "Intro call" / "1:1" / "Text"
 *   quote: "verbatim text",   // untouched except visible bracket redactions
 *   tags: ["deferral"],
 *   source: { slug, timestamp } | null   // null for texts
 * }
 */

export function nextId(entries) {
  let max = 0;
  for (const e of entries) {
    const n = parseInt(String(e.id).replace(/^TW-/, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return 'TW-' + String(max + 1).padStart(4, '0');
}

export function validateEntry(e) {
  const errors = [];
  if (!/^TW-\d{4,}$/.test(e.id || '')) errors.push('bad id');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) errors.push('bad date');
  // Display label: "Ludi V" style (first name + last initial) or initials.
  // Never a full surname — enforced at ingest via the roster.
  if (!e.man || typeof e.man !== 'string' || e.man.trim().length === 0 || e.man.length > 24) {
    errors.push('bad man label');
  }
  if (!e.context) errors.push('missing context');
  if (!e.quote || !e.quote.trim()) errors.push('empty quote');
  if (!Array.isArray(e.tags) || e.tags.length === 0) errors.push('needs at least one tag');
  return errors;
}

export function renderJson(entries) {
  return JSON.stringify(
    {
      generated: 'their-words.json is derived from the same model as their-words.md',
      count: entries.length,
      entries,
    },
    null,
    2
  ) + '\n';
}

export function parseJson(text) {
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : data.entries || [];
}

export function renderMarkdown(entries) {
  const byTag = new Map();
  for (const e of entries) {
    for (const t of e.tags) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t).push(e.id);
    }
  }
  const tags = [...byTag.keys()].sort();

  const lines = [];
  lines.push('# THEIR WORDS');
  lines.push('');
  lines.push('> Verbatim quotes only. Initials only. Nothing enters this file without');
  lines.push('> the owner’s explicit approval. Append-only — IDs are never reused.');
  lines.push('');
  lines.push(`Entries: **${entries.length}**`);
  lines.push('');
  lines.push('## Tag index');
  lines.push('');
  if (tags.length === 0) {
    lines.push('_No entries yet._');
  } else {
    for (const t of tags) {
      const ids = byTag.get(t);
      lines.push(`- **${t}** (${ids.length}): ${ids.join(', ')}`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  for (const e of entries) {
    lines.push(`## ${e.id}`);
    lines.push('');
    lines.push(`- **Date:** ${e.date}`);
    lines.push(`- **Man:** ${e.man}`);
    lines.push(`- **Context:** ${e.context}`);
    lines.push(`- **Tags:** ${e.tags.join(', ')}`);
    if (e.source) {
      lines.push(`- **Source:** ${e.source.slug} @ [${e.source.timestamp}]`);
    }
    lines.push('');
    for (const qline of e.quote.split('\n')) {
      lines.push(`> ${qline}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Derive the human context label from a manifest's classification block,
// falling back to call_name/tags when classification is null (spec §2b).
export function contextFromManifest(manifest) {
  const c = manifest.classification;
  if (c && c.call_type === 'squad') {
    return c.call_number != null ? `Squad call ${c.call_number}` : 'Squad call';
  }
  if (c && c.call_type === 'one_on_one') return '1:1';
  const name = (manifest.call_name || '').toLowerCase();
  if (name.includes('intro')) return 'Intro call';
  if ((manifest.tags || []).includes('squad')) return 'Squad call';
  return manifest.call_name || 'Call';
}
