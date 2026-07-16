# Design Decisions & Spec Amendments

Documented choices where this implementation departs from or fills gaps in
`THEIRWORDSBUILDSPEC.md`. The privacy intent of the original spec (§9) is
preserved in every amendment.

## A1 — Review moved from local CLI to the web dashboard (owner request, 2026-07-16)

The original spec put approve/edit/kill in a local terminal CLI and forbade
web-based approval (§12), because candidates contained **real names** and were
never allowed off the machine. The owner requested dashboard-based review
instead of a terminal workflow. To make that possible **without** shipping
real names to the cloud, the following compensating changes were made:

1. **Anonymization moved earlier.** The ingest step (which still runs on the
   Mac, where transcripts and the roster live) converts every name to roster
   initials *before* writing a candidate. Third-party names inside quote text
   are bracket-redacted (`[K—]` style) at extraction time and double-checked
   by the owner during review. Nothing containing a real name is ever
   committed or uploaded.
2. **Candidates are now committed** to the private repo (they are anonymized,
   so they carry the same sensitivity level as the canon itself — just not
   yet approved). `candidates/` was removed from `.gitignore` accordingly.
3. **The write path is a serverless API** (`api/`) that commits approvals to
   GitHub via a fine-grained PAT stored as a Vercel env var. It is gated by
   `ADMIN_PASSWORD` (constant-time comparison) and should additionally sit
   behind Vercel Deployment Protection.

Still true, unchanged from the spec: raw transcripts, `roster.yaml`,
`state/`, and `.env` never leave the machine; the canon is initials-only;
nothing enters the canon without the owner's explicit approval; quotes are
verbatim (the only permitted edits are context-window trimming and visible
bracket redactions).

## A2 — Candidate files are JSON, not Markdown

Spec §3 suggested `candidates/<slug>.md`. Because the dashboard consumes
candidates programmatically, they are stored as `candidates/<slug>.json`.

## A3 — Canon JSON is copied into `public/` at deploy time

The source of truth stays at the repo root (`their-words.md` +
`their-words.json`, regenerated together from one in-memory model). The
Vercel build step copies `their-words.json` into `public/` so the static
viewer can fetch it. The viewer also tries `/api/canon` first (live from
GitHub) so freshly approved entries appear without waiting for a redeploy.

## A4 — Entry schema carries a `source` field

In addition to the spec's six fields, each entry stores
`source: {slug, timestamp}` as structured provenance (the spec asked for the
timestamp + slug inside the quote block; structured is equivalent and easier
to render). `context: Text` entries have `source: null`.

## A5 — Password gate is app-level and covers the whole site (amended 2026-07-16)

The owner asked for a simple password. `ADMIN_PASSWORD` (Vercel env var,
compared with `crypto.timingSafeEqual`) originally gated only the review API;
Vercel Authentication was to cover page views. Vercel's "All Deployments"
protection level turned out to be plan-gated on the owner's account, so per
owner decision the same password now gates **everything**: the page shows a
lock screen until the password verifies server-side (`/api/auth`), the canon
is served only through the authenticated `/api/canon` endpoint, and the
static deploy bundle contains no quote data at all (`tools/build-viewer.mjs`
enforces this). Vercel's free Standard Protection still covers preview URLs.
The incognito acceptance test from spec §7 still applies: an unauthenticated
visitor must see only the lock screen, never a quote.

## A6 — Display names are "first name + last initial", not initials (owner decision, 2026-07-16)

The owner chose readable labels ("Ludi V", "Scott S") over strict initials,
since the entire dashboard now sits behind the password. Rules preserved:
full surnames never appear anywhere off-machine; the roster (full name →
label) stays local-only; labels are stable forever once assigned; spec §9.4
still applies unchanged — anything generated FROM the canon for external use
(marketing, site, book) strips identifying detail, and named attribution
requires that man's explicit recorded yes.
