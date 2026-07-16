#!/usr/bin/env node
// Ingest (spec §5.1–5.3, amended per DECISIONS.md A1): runs LOCALLY on the
// Mac, where transcripts and the roster live. For each fully-processed call
// (manifest.json present — the one and only trigger, spec §2a) whose
// call-level tags intersect the configured ingest set:
//   1. read the transcript in place (never copied into this repo),
//   2. extract candidate quotes + proposed tags via one Claude API call,
//   3. ANONYMIZE (roster initials, third-party names bracket-redacted)
//      before anything is written,
//   4. write candidates/<slug>.json, mark the slug ingested, commit + push
//      so the dashboard review queue picks it up.
// The owner's turns are excluded from candidates; his words never enter the
// canon (spec §5.3).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import Anthropic from '@anthropic-ai/sdk';
import { contextFromManifest } from '../lib/canon.mjs';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const expand = (p) => p.replace(/^~(?=$|\/)/, os.homedir());

function loadConfig() {
  return yaml.load(fs.readFileSync(path.join(repoRoot, 'config.yaml'), 'utf8'));
}

function loadState() {
  const p = path.join(repoRoot, 'state', 'ingested.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { slugs: [] };
  }
}

function saveState(state) {
  const dir = path.join(repoRoot, 'state');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ingested.json'), JSON.stringify(state, null, 2) + '\n');
}

function loadRoster() {
  const p = path.join(repoRoot, 'roster.yaml');
  try {
    return yaml.load(fs.readFileSync(p, 'utf8')) || {};
  } catch {
    return {};
  }
}

function saveRoster(roster) {
  fs.writeFileSync(
    path.join(repoRoot, 'roster.yaml'),
    '# Full name -> canonical initials. LOCAL ONLY — gitignored, never pushed.\n' +
      yaml.dump(roster)
  );
}

function suggestInitials(name, taken) {
  const base = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10; i++) if (!taken.has(base + i)) return base + i;
  return base + Math.floor(Math.random() * 100);
}

// Ensure every participant (except unknown strays) has stable initials.
async function resolveRoster(participants, roster, rl) {
  const taken = new Set(Object.values(roster));
  for (const name of participants) {
    if (roster[name]) continue;
    const suggestion = suggestInitials(name, taken);
    const answer = (
      await rl.question(`New participant "${name}" — initials [${suggestion}]: `)
    ).trim().toUpperCase();
    const initials = answer || suggestion;
    if (taken.has(initials)) {
      console.log(`  "${initials}" is taken; using ${suggestion} instead.`);
      roster[name] = suggestion;
    } else {
      roster[name] = initials;
    }
    taken.add(roster[name]);
  }
  return roster;
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    quotes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string', description: 'Speaker full name exactly as labeled in the transcript' },
          timestamp: { type: 'string', description: 'HH:MM:SS timestamp of the first turn of the quote' },
          quote: {
            type: 'string',
            description:
              'VERBATIM quote, character-for-character from the transcript, with enough surrounding sentences to prevent misreading. Never paraphrase, never clean up. The single permitted alteration: replace any third-party name (wife, child, coworker) with a bracketed initial like [K—].',
          },
          tags: { type: 'array', items: { type: 'string' } },
          tag_note: { type: 'string', description: 'e.g. for deferral: verb tense (present = live need, future = deferral). Empty string if none.' },
          proposed_new_tag: {
            type: ['object', 'null'],
            properties: {
              name: { type: 'string' },
              definition: { type: 'string' },
            },
            required: ['name', 'definition'],
            additionalProperties: false,
          },
          why: { type: 'string', description: 'One line on why this quote earns its tags' },
        },
        required: ['speaker', 'timestamp', 'quote', 'tags', 'tag_note', 'proposed_new_tag', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['quotes'],
  additionalProperties: false,
};

async function extractQuotes(client, model, transcript, tagRegistry, ownerName) {
  const system = `You extract VERBATIM quotes from men's-circle call transcripts for a quote database called Their Words.

Non-negotiable rules:
- Verbatim or nothing. Copy the man's exact words character-for-character. No paraphrase, no cleanup, no smoothing, ever.
- ${ownerName} is the program owner/facilitator. NEVER extract his words as a quote. The one exception context: when a man responds to ${ownerName}'s story and it lands (tag founder-story-resonance), capture the MAN's words only.
- Include enough surrounding sentences that the quote cannot be misread out of context.
- Replace any third-party name mentioned inside a quote (wife, child, boss, another member) with a bracketed initial, e.g. "my wife [K—]". This is the only permitted alteration, and it must be visibly bracketed.
- Propose one or more tags per quote from the registry below. If a strong quote fits no existing tag, set proposed_new_tag with a name and definition.
- Quality over quantity: extract only quotes with real reuse value for session themes, marketing copy, sales pages, or a book.

Tag registry:
${tagRegistry}`;

  const stream = client.messages.stream({
    model,
    max_tokens: 32000,
    system,
    output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Extract candidate quotes from this transcript:\n\n${transcript}`,
      },
    ],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new Error('Extraction request was refused by the API');
  }
  const text = message.content.find((b) => b.type === 'text')?.text || '{"quotes":[]}';
  return JSON.parse(text).quotes || [];
}

// Replace every rostered full name (and bare first name, word-bounded) with initials.
function anonymize(text, roster) {
  let out = text;
  const names = Object.keys(roster).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const initials = roster[name];
    out = out.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), initials);
    const first = name.split(/\s+/)[0];
    if (first.length > 2) {
      out = out.replace(new RegExp(`\\b${first}\\b`, 'g'), initials);
    }
  }
  return out;
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

async function main() {
  const config = loadConfig();
  const state = loadState();
  const outputDir = expand(config.upstream_output_dir);
  const ingestTags = new Set(config.ingest_tags || []);
  const ownerName = config.owner_name || 'Isaiah';

  if (!fs.existsSync(outputDir)) {
    console.error(`Upstream output dir not found: ${outputDir}`);
    process.exit(1);
  }

  const client = new Anthropic(); // ANTHROPIC_API_KEY from .env/environment
  const tagRegistry = fs.readFileSync(path.join(repoRoot, 'tags.md'), 'utf8');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const roster = loadRoster();
  const written = [];

  for (const slug of fs.readdirSync(outputDir)) {
    const manifestPath = path.join(outputDir, slug, 'manifest.json');
    // Trigger rule (§2a): a complete manifest.json is the ONLY "done" signal.
    if (!fs.existsSync(manifestPath)) continue;
    if (state.slugs.includes(slug)) continue;

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      console.log(`~ ${slug}: manifest unreadable, skipping`);
      continue;
    }

    // A call is ingested when EITHER the upstream's call-level tags match the
    // ingest set OR an ingest keyword appears in the meeting name / Zoom
    // topic — so titling a meeting "… — Expedition" is always sufficient.
    const callTags = manifest.tags || [];
    const nameText = `${manifest.call_name || ''} ${manifest.zoom_topic || ''}`.toLowerCase();
    const matches =
      callTags.some((t) => ingestTags.has(t)) ||
      [...ingestTags].some((t) => nameText.includes(t));
    if (!matches) {
      console.log(`- ${slug}: tags [${callTags.join(', ')}] don't match ingest set, skipping`);
      state.slugs.push(slug); // decided: not ours; don't re-evaluate every run
      continue;
    }

    const transcriptPath = manifest.artifacts?.transcript || path.join(outputDir, slug, 'transcript.md');
    if (!fs.existsSync(transcriptPath)) {
      console.log(`~ ${slug}: transcript missing, will retry next run`);
      continue;
    }

    console.log(`\n=== Ingesting ${slug} (${manifest.call_name || 'unnamed'}) ===`);
    await resolveRoster(manifest.participants || [], roster, rl);
    saveRoster(roster);

    const transcript = fs.readFileSync(transcriptPath, 'utf8');
    const raw = await extractQuotes(client, config.model, transcript, tagRegistry, ownerName);

    // Hard owner-exclusion backstop, then anonymize BEFORE writing anything.
    const ownerInitialsSet = new Set(
      Object.entries(roster)
        .filter(([name]) => name.toLowerCase().includes(ownerName.toLowerCase()))
        .map(([, ini]) => ini)
    );
    const quotes = raw
      .filter((q) => !q.speaker.toLowerCase().includes(ownerName.toLowerCase()))
      .map((q, i) => ({
        id: `c${i + 1}`,
        man: roster[q.speaker] || suggestInitials(q.speaker, new Set(Object.values(roster))),
        timestamp: q.timestamp,
        quote: anonymize(q.quote, roster),
        tags: q.tags,
        tag_note: q.tag_note || '',
        proposed_new_tag: q.proposed_new_tag || null,
        why: anonymize(q.why || '', roster),
      }))
      .filter((q) => !ownerInitialsSet.has(q.man));

    const batch = {
      slug,
      call_name: anonymize(manifest.call_name || slug, roster),
      date: manifest.date,
      context_label: contextFromManifest(manifest),
      quotes,
    };

    const candDir = path.join(repoRoot, 'candidates');
    fs.mkdirSync(candDir, { recursive: true });
    fs.writeFileSync(path.join(candDir, `${slug}.json`), JSON.stringify(batch, null, 2) + '\n');
    // Mark ingested only after the candidate file is written (spec §5.1).
    state.slugs.push(slug);
    saveState(state);
    written.push({ slug, count: quotes.length });
    console.log(`  ${quotes.length} candidate quote(s) written.`);
  }

  rl.close();

  if (written.length) {
    const desc = written.map((w) => `${w.slug} (${w.count})`).join(', ');
    git(['add', 'candidates']);
    git(['commit', '-m', `ingest: candidates from ${desc}`]);
    try {
      git(['push']);
      console.log('\nPushed. Open the dashboard to review.');
    } catch {
      console.log('\nCommitted locally; push failed — run `git push` to publish the review queue.');
    }
  } else {
    console.log('\nNothing new to ingest.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
