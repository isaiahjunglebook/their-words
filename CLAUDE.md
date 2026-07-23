# Their Words / Verbatim Library — project guide

## What this is
Two local Mac tools on a conveyor belt:
1. **audioprocessor** (`~/Documents/audioprocessor`) — Zoom per-participant audio → local Whisper transcript. Free, no API.
2. **their-words** (this repo) — turns transcripts into a reviewed **Verbatim Library** + a private review dashboard.

## Cost rule (important)
Prefer the **Max subscription over the paid API.** The LLM steps (summary, quote
extraction, advisor review) run in a **Claude Project** ("Verbatim Library —
Extractor") or **Claude Code logged in with Max** — not the metered API. The
API auto-ingest watcher is intentionally OFF.

## The extraction flow
- Transcript → the Extractor (Project or Claude Code) → one candidate JSON with:
  a plain summary, verbatim quotes, and **two advisor verdicts per quote**.
- Advisors: **Hormozi** (`mozi-master.md`) + **Brunson**
  (`dotcom-secrets-brunson.md`, `expert-secrets-brunson.md`,
  `traffic-secrets-brunson.md`). The standing instruction set is
  `VERBATIM-EXTRACTOR-PROJECT.md`.
- Candidate JSON → repo (`main`) → dashboard review → **approve / kill**.

## Privacy rules (never break)
- Quotes are **verbatim**. Display labels/initials only — never full surnames.
- Third-party names inside quotes are bracket-redacted (`[K—]`).
- **Isaiah (owner) is excluded** from the squad library. `roster.yaml` is
  **local only** (gitignored, never pushed).
- Nothing enters the canon without explicit approval in the dashboard.

## Dashboard
Deployed on Vercel; reads candidates + canon from the **`main`** branch.
Candidate files must land on `main` to show up for review.

## Open items
- Consolidate all work onto `main` (dashboard + Claude Code both expect it).
- Add an advisor-notes panel to the dashboard review screen.
- Build the **personal/counselor** verbatim tab (separate rules — may include
  the owner's own words).
