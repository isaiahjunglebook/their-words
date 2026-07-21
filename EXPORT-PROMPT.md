# Their Words — Integration Prompt

> **How to use this file.** Open a new Claude Code session **inside your other
> repo** and paste everything below the `─── PASTE BELOW ───` line as your first
> message. It tells that session exactly what Their Words is, how it's built,
> and how to fold it into the repo it's now sitting in. It is written to be
> self-contained: it does not assume the new session can see the original
> `isaiahjunglebook/their-words` repo, but it tells the session how to pull the
> exact source if it can.

---

─── PASTE BELOW ───

## What you're building

You are integrating a subsystem called **Their Words** into this repository.

Their Words is a **verbatim quote database** with a **private web dashboard**.
It captures exact quotes from men's-circle coaching calls ("The Expedition"),
anonymizes them, and lets the owner browse an approved "canon" and review
pending "candidate" quotes (approve / edit context / kill) from a password-gated
web page — no terminal needed for review.

It has three moving parts:

1. **Ingest (runs locally, on the owner's Mac).** After a call is transcribed,
   one script makes **a single Claude API call** to extract verbatim quotes +
   proposed tags, **anonymizes them before writing anything**, and commits the
   anonymized candidates to the repo.
2. **Review API (serverless, on Vercel).** Password-gated endpoints that read
   the candidate queue and, on approval, append an entry to the canon and
   commit both canon files back to GitHub in one atomic commit.
3. **Viewer + review dashboard (static front-end).** A single password-gated
   page that browses the canon and runs the review queue.

### The single most important thing: privacy rules

These are non-negotiable. Preserve every one of them when you integrate:

- **Raw transcripts, the roster (full name → label map), local state, and
  `.env` NEVER leave the machine.** They are gitignored and only exist on the
  owner's Mac. Do not add features that upload them. Do not commit them.
- **Anonymization happens at ingest time, before anything is written to disk or
  committed.** Nothing containing a real full name is ever committed or
  uploaded. Candidates are already anonymized by the time they reach the repo.
- **Display labels are "first name + last initial"** (e.g. `Ludi V`, `Scott S`)
  — never a full surname. The full-name → label map lives only in the local
  `roster.yaml`.
- **Third-party names inside a quote are bracket-redacted** (`[K—]` style) at
  extraction time.
- **Quotes are verbatim.** The only edits ever permitted are (a) trimming the
  surrounding context window and (b) adding bracketed redactions. Never
  paraphrase, clean up, or rewrite a quote.
- **Nothing enters the canon without the owner's explicit approval.** Every
  approval is one deliberate human action in the dashboard.
- **The owner/facilitator's own words are never extracted** as quotes.
- **Anything generated FROM the canon for outside use** (marketing, a book, a
  site) strips identifying detail; named attribution requires that man's
  explicit recorded "yes".
- The whole site is **password-gated** and marked `noindex, nofollow`. An
  unauthenticated visitor must see only a lock screen — never a quote.

If any integration decision would weaken one of these, stop and ask the human
first.

---

## Getting the source

There are two ways to bring the code in. Prefer **Option A** if this session can
reach the original repo; otherwise use **Option B** (rebuild from the full spec
in this prompt).

### Option A — copy from the original repo (if reachable)

The reference implementation lives at **`isaiahjunglebook/their-words`**
(private). If you have GitHub access to it from this session:

```
# add it to the session if your harness supports it, e.g.
#   add_repo isaiahjunglebook/their-words
# or clone it somewhere scratch:
git clone https://github.com/isaiahjunglebook/their-words /tmp/their-words-src
```

Then copy the files into this repo following the "Where things go" section
below, adapting paths to this repo's conventions. Copy these **verbatim** (they
are load-bearing and correct as written):

- `lib/canon.mjs` — the canon model (id allocation, validation, JSON+Markdown
  rendering). This is the heart; do not reinvent it.
- `lib/github.mjs` — minimal GitHub Git Data API client (atomic multi-file
  commits).
- `lib/auth.mjs` — constant-time password check.
- `api/*.js` — the five serverless endpoints.
- `tools/ingest.mjs`, `tools/build-viewer.mjs`, `tools/install-watcher.sh`.
- `public/index.html`, `public/app.js`, `public/style.css` — the front-end.
- `config.yaml`, `tags.md`, `TAXONOMY-CHANGELOG.md`, `vercel.json`,
  `.gitignore`, `DECISIONS.md`, `README.md`, the `test/` suite, and the sample
  candidate `candidates/0000-00-00-sample-call-DELETE-ME.json`.

### Option B — rebuild from spec (if the original repo isn't reachable)

Reconstruct the files from the contracts below. Every data shape, endpoint, and
rule you need is specified. When in doubt, match the contracts exactly — the
front-end and tests depend on them.

---

## Architecture & data flow

```
Zoom call → (upstream) transcription writes  <output>/<slug>/manifest.json + transcript
   → `npm run ingest` on the Mac
       · pick calls whose call-level tags (or meeting name / Zoom topic)
         match config.yaml `ingest_tags`
       · ONE Claude API call extracts verbatim quotes + proposed tags
       · anonymize (roster labels, [K—] redactions) BEFORE writing anything
       · exclude the owner's own turns
       · write candidates/<slug>.json, record the slug as ingested, commit + push
   → open the dashboard → Review → enter password → approve / edit context / kill
       · approve  → allocate next TW-id, append to canon, regenerate BOTH canon
         files, remove the quote from its candidate file, all in ONE commit
       · kill     → remove the quote from its candidate file, commit
   → Vercel auto-redeploys; the viewer also reads live via /api/canon so freshly
     approved entries appear without waiting for a redeploy
```

### The canon model (`lib/canon.mjs`) — the core

One in-memory list of entries renders to **two files that are always
regenerated together** so they can't drift:

- `their-words.json` — the machine mirror the viewer reads.
- `their-words.md` — human-readable canon with a regenerated tag index at top.

**Canon entry shape:**

```jsonc
{
  "id": "TW-0001",           // sequential, zero-padded, NEVER reused or renumbered
  "date": "YYYY-MM-DD",
  "man": "Ludi V",           // display label only (first name + last initial)
  "context": "Squad call 4", // or "Intro call" | "1:1" | "Text"
  "quote": "verbatim text",  // untouched except visible bracket redactions
  "tags": ["deferral"],      // >= 1 tag
  "source": { "slug": "…", "timestamp": "HH:MM:SS" }  // null for text entries
}
```

Functions to preserve exactly:
- `nextId(entries)` → scans existing ids, returns `TW-` + zero-padded (max+1).
  **Append-only; ids are never reused even after a kill.**
- `validateEntry(e)` → returns an array of problems; enforces id/date format,
  non-empty `man` label (≤ 24 chars, never a full surname), non-empty context,
  non-empty quote, ≥ 1 tag.
- `renderJson(entries)` → `{ generated, count, entries }` pretty-printed.
- `parseJson(text)` → tolerates a bare array or `{entries}`.
- `renderMarkdown(entries)` → header + regenerated tag index + one block per
  entry.
- `contextFromManifest(manifest)` → derives the human context label
  ("Squad call N", "1:1", "Intro call", …) from the upstream manifest.

### Candidate batch shape (`candidates/<slug>.json`)

Already anonymized when written. This is the review queue.

```jsonc
{
  "slug": "2026-07-16-squad-4",
  "call_name": "…",             // anonymized
  "date": "YYYY-MM-DD",
  "context_label": "Squad call 4",
  "quotes": [
    {
      "id": "c1",               // batch-local id
      "man": "Ludi V",          // display label
      "timestamp": "00:14:22",
      "quote": "verbatim, third-party names already [K—] redacted",
      "tags": ["deferral"],
      "tag_note": "future tense = deferral",   // "" if none
      "proposed_new_tag": { "name": "…", "definition": "…" } | null,
      "why": "one line on why this quote earns its tags"
    }
  ]
}
```

### The serverless API (five endpoints)

All are password-gated via `Authorization: Bearer <password>` (see auth below).
They read/write GitHub live via the Git Data API — the deployed bundle holds no
quote data.

| Endpoint            | Method | Purpose |
|---------------------|--------|---------|
| `/api/auth`         | POST   | Password check only (so the lock screen works even if GitHub config is broken). |
| `/api/canon`        | GET    | Serves `their-words.json` live from the repo head. Password-gated. |
| `/api/candidates`   | GET    | Lists all pending candidate batches, read live from GitHub. |
| `/api/review`       | POST   | `{action:"approve"\|"kill", slug, quoteId, quote?, tags?}`. Approve = allocate next TW-id, append to canon, regenerate both canon files, drop the quote from its candidate file (delete the file when it empties) — **one atomic commit**. Kill = drop the quote, commit. |
| `/api/add-text`     | POST   | `{date, man, quote, tags}` → adds a `context:"Text"`, `source:null` entry (text-message quotes the owner types in; approved by definition). |

**Auth (`lib/auth.mjs`):** compare `Authorization: Bearer <supplied>` to
`ADMIN_PASSWORD` using a **constant-time** comparison (hash both with SHA-256,
`crypto.timingSafeEqual`). Return 401 on mismatch, 503 if `ADMIN_PASSWORD` is
unset. No session state.

**GitHub client (`lib/github.mjs`):** `readFile(path)`, `listDir(path)`,
`commitFiles(message, changes)` where `changes` is
`[{path, content}]` (write) or `[{path, delete:true}]` (remove). Writes all
changed files in ONE commit (blobs inline in a tree, deletions via `sha:null`).
Reads repo/branch/token from env (`GITHUB_REPO`, `GITHUB_BRANCH`,
`GITHUB_TOKEN`, with Vercel `VERCEL_GIT_*` fallbacks).

### Ingest (`tools/ingest.mjs`) — runs on the Mac only

For each call with a `manifest.json` (the one "done" signal) whose call-level
tags — or meeting name / Zoom topic — match `config.yaml`'s `ingest_tags`, and
that hasn't been ingested yet:

1. Read the transcript **in place** (never copied into the repo).
2. Resolve every participant to a stable display label via `roster.yaml`
   (interactive on first run; `--auto`/non-TTY auto-assigns "First L" labels).
3. **One Claude API call** with a JSON-schema-constrained output extracts
   verbatim quotes, tags, tag notes, and optional proposed new tags. The system
   prompt hard-codes the verbatim rule, the owner-exclusion rule, and the
   third-party bracket-redaction rule.
4. Drop the owner's turns, **anonymize** every quote against the roster, write
   `candidates/<slug>.json`, record the slug in local `state/ingested.json`,
   then `git add candidates && git commit && git push`.

The extraction Claude call:
- Uses the model from `config.yaml` (`model: claude-sonnet-5` currently).
- Sends `system` = the rules + the current `tags.md` registry; `user` = the
  transcript.
- Constrains output with a JSON schema (`quotes[]` with `speaker, timestamp,
  quote, tags, tag_note, proposed_new_tag, why`).
- Uses the `@anthropic-ai/sdk`; API key from a gitignored local `.env`
  (`ANTHROPIC_API_KEY`). **Before writing any Claude/Anthropic SDK code, load
  the `claude-api` skill (or check current docs) — model ids and SDK params
  change; do not trust memory.**

Optional: `tools/install-watcher.sh` registers a macOS LaunchAgent so ingest
runs automatically when the upstream processor writes new output.

### Front-end (`public/`)

- `index.html` — lock screen + header + review panel + canon viewer, all
  `hidden` until unlocked. `noindex, nofollow`.
- `app.js` — stores the password client-side and sends it as
  `Authorization: Bearer <password>` on every call. Flow: `/api/auth` to unlock
  → `/api/canon` to render cards (search + tag/man filter chips) →
  `/api/candidates` to fill the review queue → `/api/review` per decision →
  `/api/add-text` for manual text quotes.
- `style.css` — styling.

### Build & deploy

- `tools/build-viewer.mjs` is the Vercel `buildCommand`. It **removes any stray
  `their-words.json` from `public/`** so the static bundle ships **no quote
  data** — the canon is served only through the authenticated `/api/canon`.
- `vercel.json`: `buildCommand: node tools/build-viewer.mjs`,
  `outputDirectory: public`, plus an `X-Robots-Tag: noindex, nofollow` header on
  everything.

---

## Where things go (integration plan)

Do this in stages and confirm the privacy invariants after each.

1. **Decide the home.** Default: land Their Words as a **self-contained module**
   in a subdirectory (e.g. `their-words/` or `apps/their-words/`) so it's easy
   to reason about and remove. If this repo already has serverless routes, a
   front-end, and an auth story, you may instead **weave it in**: map the five
   endpoints onto this repo's routing, reuse its styling, and adopt its env-var
   conventions — but keep the canon model (`lib/canon.mjs`) and the privacy
   rules byte-for-byte.

2. **Copy the core untouched:** `lib/canon.mjs`, `lib/github.mjs`,
   `lib/auth.mjs`, the five `api/*` handlers, `tools/ingest.mjs`,
   `tools/build-viewer.mjs`. Adapt only import paths and the serverless handler
   signature if this repo's framework differs (e.g. Next.js route handlers vs.
   bare Vercel functions — the logic is identical, only the request/response
   wrapper changes).

3. **Front-end:** drop `public/` in, or port `index.html`/`app.js`/`style.css`
   into this repo's front-end. The only hard contract is the endpoint paths and
   the `Bearer <password>` header — keep those.

4. **Config & data files at the module root:** `config.yaml`, `tags.md`,
   `TAXONOMY-CHANGELOG.md`, and the canon files `their-words.md` +
   `their-words.json` (seed the JSON as `{ "generated": "...", "count": 0,
   "entries": [] }`). Ship the sample candidate
   `candidates/0000-00-00-sample-call-DELETE-ME.json` so the review flow can be
   tested, then killed.

5. **`.gitignore` — critical.** Ensure these are ignored and never committed:
   `roster.yaml`, `state/`, `transcripts/`, `.env`, `.env.*`,
   `public/their-words.json` (the build strips it), plus `node_modules/`.
   **Note:** `candidates/` IS committed (it's anonymized). Do not gitignore it.

6. **Dependencies:** add `@anthropic-ai/sdk` and `js-yaml`. Add scripts:
   `ingest` → `node tools/ingest.mjs`, `build` → `node tools/build-viewer.mjs`,
   `test` → `node --test test/*.test.mjs`.

7. **Environment variables** (set in Vercel, and locally in a gitignored
   `.env`):
   - `ANTHROPIC_API_KEY` — for ingest (Mac only; not needed by the deployed
     site).
   - `ADMIN_PASSWORD` — the review/site password.
   - `GITHUB_TOKEN` — fine-grained PAT for **this** repo, Contents: Read+Write
     (this is how approvals commit).
   - `GITHUB_REPO` — `owner/thisrepo`. Optional `GITHUB_BRANCH`.
   - If integrating into an existing app, **namespace** these
     (e.g. `THEIRWORDS_ADMIN_PASSWORD`) to avoid colliding with the host app's
     own vars, and update `lib/auth.mjs` / `lib/github.mjs` to read the
     namespaced names.

8. **Watch for collisions when weaving in:** route paths (`/api/auth`,
   `/api/canon`, …), env-var names, the global `X-Robots-Tag` header (you likely
   do NOT want `noindex` on the whole host site — scope it to the Their Words
   routes), and CSS class names. Resolve each explicitly rather than letting the
   host app and the module fight.

9. **Tests:** port `test/` (`canon.test.mjs`, `review.integration.test.mjs`,
   `ui-smoke.mjs`) and get them green before calling it done.

---

## Setup & acceptance (do these, report results)

1. `npm install`; run `npm test` → all green.
2. Deploy to Vercel with the env vars above. Framework preset **Other** if this
   is a standalone module.
3. **Mandatory acceptance test:** open the production URL in an incognito
   window. You must hit the **lock screen** (or Vercel auth), **never a quote**.
   If any quote data is reachable unauthenticated, the integration is wrong —
   fix before shipping.
4. Open the dashboard → Review → unlock → **Kill** both sample quotes to
   exercise the flow without polluting the canon. (Approving one permanently
   consumes a TW-id.)
5. On the Mac, set `ANTHROPIC_API_KEY` in a local `.env`, point
   `config.yaml`'s `upstream_output_dir` at the transcription output, and run
   `npm run ingest` against a real call. Confirm the committed candidate is
   fully anonymized (labels only, `[K—]` redactions, no owner turns) BEFORE it
   ever reaches the dashboard.

## Definition of done

- The five endpoints work behind the password; the site is fully gated.
- The canon renders to `.md` + `.json` together and never drifts.
- Approvals commit atomically with monotonic, never-reused TW-ids.
- Ingest anonymizes before writing; roster/transcripts/state/.env stay local
  and gitignored; `candidates/` is committed and clean.
- Incognito acceptance test passes.
- Tests green.

Read `DECISIONS.md` from the source repo for the documented spec amendments
(A1–A6) — they explain *why* review moved to the web, why candidates are
committed, why the whole site is password-gated, and the display-label rule.
Follow them; they encode owner decisions.
