# Their Words

Verbatim quote database for The Expedition, with a private web dashboard for
**browsing the canon** and **reviewing candidates** (approve / edit context /
kill) — no terminal needed for review.

- **Canon:** `their-words.md` (human-readable) + `their-words.json` (what the
  viewer reads). Regenerated together on every approval; append-only TW-ids.
- **Review happens in the dashboard** (see `DECISIONS.md` A1 for how this
  amends the original spec while keeping its privacy rules).
- **Ingest happens on the Mac** — that's where transcripts and the roster
  live, and they never leave it.

## The flow

```
Zoom call → audioprocessor writes manifest.json (upstream, already built)
   → `npm run ingest` on the Mac
       · matches call-level tags against config.yaml ingest_tags
       · ONE Claude API call extracts verbatim quotes + proposed tags
       · anonymizes (roster initials, [K—] redactions) BEFORE writing anything
       · commits candidates/<slug>.json and pushes
   → open the dashboard → Review → password → approve / edit / kill
       · approvals commit to GitHub (next TW-id, both canon files regenerated)
       · Vercel auto-redeploys; the viewer also reads live via /api/canon
```

## One-time setup

### 1. Mac (pipeline)

```sh
git clone <this repo> && cd their-words
npm install
echo 'ANTHROPIC_API_KEY=sk-ant-…' > .env   # gitignored
```

`roster.yaml` (full name → initials) is created interactively on first ingest
and stays local forever. Run the pipeline with:

```sh
npm run ingest
```

### 2. Vercel (dashboard)

1. Import this GitHub repo into Vercel. Framework preset: **Other**. Leave the
   root directory as the repo root (`vercel.json` handles build + output).
2. Add three **environment variables**:
   - `ADMIN_PASSWORD` — the review password you'll type into the dashboard.
   - `GITHUB_TOKEN` — a fine-grained PAT for this repo with
     **Contents: Read and write** (this is how approvals commit).
   - `GITHUB_REPO` — `isaiahjunglebook/their-words`.
     (Optional: `GITHUB_BRANCH` — defaults to the branch the deployment was
     built from, then `main`.)
3. **Enable Deployment Protection** (Settings → Deployment Protection →
   Vercel Authentication, for all deployments including production). The
   password gate protects the review API; platform protection protects the
   whole site. Both, not either.
4. **Acceptance test (mandatory):** open the production URL in an incognito
   window — you must hit Vercel's auth wall, never the quotes.

### 3. Try it

The repo ships with one obviously-fake sample candidate batch
(`candidates/0000-00-00-sample-call-DELETE-ME.json`). Open the dashboard →
Review → unlock → **Kill** both sample quotes to test the flow without
polluting the canon. (If you approve one, it permanently consumes a TW-id —
fine while the canon is empty, just delete the entries before real data.)

## Privacy rules (unchanged from the spec)

- Raw transcripts, `roster.yaml`, `state/`, and `.env` never leave the Mac —
  enforced by `.gitignore`.
- The canon and candidates use **initials only**; third-party names inside
  quotes are visibly bracket-redacted (`[K—]`).
- Quotes are verbatim. The only permitted edits at review time are trimming
  the context window and bracketed redactions.
- Nothing enters the canon without the owner's explicit approval.
- Named attribution outside the squad only with that man's recorded yes.

## Repo map

```
their-words.md / their-words.json   the canon (committed, regenerated together)
tags.md / TAXONOMY-CHANGELOG.md     tag registry + audit trail
candidates/                          anonymized pending quotes (the review queue)
config.yaml                          pipeline config (no secrets)
tools/ingest.mjs                     Mac-side ingest (the one Claude API call)
lib/                                 shared canon model, GitHub client, auth
api/                                 dashboard endpoints (candidates, review, add-text, canon)
public/                              static viewer + review dashboard
DECISIONS.md                         documented spec amendments
```
