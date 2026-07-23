#!/usr/bin/env node
// One-off backfill: synthesize manifest.json for calls that were transcribed
// BEFORE the upstream audioprocessor started writing manifests. Their Words
// triggers on manifest.json (spec §2a), so pre-manifest calls are invisible to
// it even though their transcript.md is right there. This reads the existing
// transcript.md and writes a minimal-but-valid manifest.json — NO
// re-transcription, no API calls.
//
// Safe + idempotent: only touches a folder that has transcript.md AND lacks
// manifest.json. Run it, then `npm run ingest` (or let the watcher pick it up).
//
// Optional: pass a directory to scan instead of config.upstream_output_dir,
// e.g. `node tools/backfill-manifests.mjs /some/output`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const expand = (p) => p.replace(/^~(?=$|\/)/, os.homedir());
const config = yaml.load(fs.readFileSync(path.join(repoRoot, 'config.yaml'), 'utf8'));
const outputDir = expand(process.argv[2] || config.upstream_output_dir);

// Keyword -> tag map, mirroring the upstream audioprocessor's config defaults.
// The important outcome: intro/expedition/where-we-dropping calls all resolve
// to the "expedition" tag, which is in Their Words' ingest set.
const TAG_KEYWORDS = {
  expedition: ['expedition', 'where we dropping', 'intro call', 'intro', 'onboarding'],
  squad: ['squad'],
  'one-on-one': ['1:1', 'one on one'],
};

function deriveTags(text) {
  const hay = text.toLowerCase();
  return Object.entries(TAG_KEYWORDS)
    .filter(([, kws]) => kws.some((k) => hay.includes(k)))
    .map(([tag]) => tag);
}

// Pull call_name / date / participants straight out of the transcript header
// written by the upstream render_transcript().
function parseTranscript(md) {
  const title = (md.match(/^#\s+(.+)$/m) || [])[1]?.trim() || '';
  const date = (md.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
  const partLine = (md.match(/\*\*Participants:\*\*\s*(.+)$/m) || [])[1] || '';
  const participants = partLine.split(',').map((s) => s.trim()).filter(Boolean);
  return { title, date, participants };
}

if (!fs.existsSync(outputDir)) {
  console.error(`Output dir not found: ${outputDir}`);
  process.exit(1);
}

let made = 0;
let skipped = 0;
for (const slug of fs.readdirSync(outputDir).sort()) {
  const dir = path.join(outputDir, slug);
  if (!fs.statSync(dir).isDirectory()) continue;

  const manifestPath = path.join(dir, 'manifest.json');
  const transcriptPath = path.join(dir, 'transcript.md');

  if (fs.existsSync(manifestPath)) continue; // already has one — leave it alone
  if (!fs.existsSync(transcriptPath)) {
    console.log(`~ ${slug}: no transcript.md — skipping`);
    skipped++;
    continue;
  }

  const md = fs.readFileSync(transcriptPath, 'utf8');
  const { title, date, participants } = parseTranscript(md);
  const callName = title || slug;
  const tags = deriveTags(`${callName} ${slug}`);

  const manifest = {
    schema_version: 1,
    call_name: callName,
    zoom_topic: null,
    date: date || slug.slice(0, 10),
    time: null,
    participants,
    owner: config.owner_name || 'Isaiah',
    tags,
    classification: null, // Their Words falls back to call_name/tags for context
    source_folder: null,
    source_files: [],
    artifacts: {
      transcript: path.resolve(transcriptPath),
      summary: null,
      reflections: {},
      manifest: path.resolve(manifestPath),
    },
    profiles_updated: [],
    emailed_to: [],
    backfilled: true, // marker: this manifest was synthesized from the transcript
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `✅ ${slug}\n     tags: ${tags.join(', ') || '(none — will NOT ingest)'}\n     people: ${participants.join(', ') || '(none found)'}`
  );
  made++;
}

console.log(`\nDone. ${made} manifest(s) created, ${skipped} skipped.`);
if (made) console.log('Next:  npm run ingest');
