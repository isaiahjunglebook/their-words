# Verbatim Library — setup & operating guide

Two things this doc answers:
1. **How do the men's words get into the library?** (the transcript → quote workflow)
2. **How do I rename everything to "Verbatim Library" so it's all in alignment?**

---

## 1. Getting quotes in — the workflow

The website (on Vercel) is only the **review + reading room**. The actual
quote-pulling happens **on your Mac**, because that's the only place your private
transcripts and your Claude key are allowed to live. Nothing is typed into this
repo by hand.

### The path a quote travels

```
Zoom call (recorded)
   │
   ▼
audio processor  (on your Mac)  →  writes transcript + manifest.json to:
   ~/Documents/audioprocessor/output/<call-name>/
   │
   ▼
Verbatim ingest  (on your Mac)  →  reads that folder, uses Claude to pull the
   men's best verbatim lines, strips names, and pushes them as "candidates"
   │
   ▼
Review tab  (this website)      →  you Approve or Kill each candidate
   │
   ▼
The library fills                →  approved quotes show on the main page
```

### What you actually do

- **You do NOT drop transcripts into this repo.** The ingest reads them from your
  audio processor's output folder (`~/Documents/audioprocessor/output`, set in
  `config.yaml`). Just make sure your calls are processed there first.
- **To pull quotes from new calls:** on your Mac, in this repo, run:
  ```
  npm install        # first time only
  npm run ingest     # reads new calls, extracts + anonymizes, pushes candidates
  ```
  You can also do this by opening a Claude session **in this repo on your Mac** and
  saying "run the ingest" — same thing, it just runs that command for you.
- **Then come to the website → Review tab** and Approve/Kill each candidate. Approved
  ones get a TW-number and appear on the main page.

### What the ingest needs on your Mac (one-time)
- A `.env` file in this repo with `ANTHROPIC_API_KEY=...` (your Claude key — **Mac
  only, never committed**; the `.gitignore` already blocks it).
- Your calls processed into `~/Documents/audioprocessor/output/` with a
  `manifest.json` tagged `squad` or `expedition` (those tags trigger ingestion —
  see `config.yaml`).
- The ingest asks you, once per new person, for their short label (e.g. "Ludi V").
  That name→label map lives only on your Mac (`roster.yaml`, never committed).

> The 2 "SAMPLE — …" candidates in the Review tab right now are fake test data.
> Kill them once you've pulled your first real call.

---

## 2. Renaming everything to "Verbatim Library"

Right now the repo, the Vercel project, and the URL still say **their-words**. To
get them all in alignment under **verbatim-library**, do these in order. None of it
touches the code — it's all settings.

> Heads up: do this in one sitting, because Steps 1–3 are linked. After it's done,
> tell me the new URL and I'll do Step 4 (30 seconds).

### Step 1 — Rename the GitHub repo
GitHub → the `their-words` repo → **Settings → General → Repository name** →
change to `verbatim-library` → Rename.
(GitHub auto-forwards the old name, so nothing breaks in the moment.)

### Step 2 — Fix the Vercel connection
1. Vercel → your project → **Settings → General → Project Name** → rename to
   `verbatim-library`. This changes the site URL to
   `https://verbatim-library.vercel.app`.
2. Vercel → **Settings → Environment Variables** → change `GITHUB_REPO` from
   `isaiahjunglebook/their-words` to `isaiahjunglebook/verbatim-library`.
   **This one matters** — it's how the site saves your approvals. If it's wrong,
   approving a quote will fail.
3. Redeploy (Vercel → Deployments → ⋯ → Redeploy) so the new env var takes effect.

### Step 3 — Check the GitHub key still points at the repo
GitHub → **Settings → Developer settings → Fine-grained tokens** → open the token
you made → confirm the renamed repo (`verbatim-library`) is the one it can access.
If it doesn't show, edit the token's repository access to the renamed repo.

### Step 4 — I update the dashboard tab (tell me the new URL)
Once the new URL is live, tell me — I'll change the Verbatim tab in the Command Deck
to point at `https://verbatim-library.vercel.app`, push it, and republish the board.
(You could also do it yourself: it's the `VERBATIM_URL` line in
`fieldguide/dashboard/index.html`.)

### What you can leave alone
The internal file names (`their-words.json`, `their-words.md`) and this repo's code
comments can stay — you never see them, and renaming them risks nothing gained. The
things you *see* — repo, project, URL, and the site title — are what get aligned to
**Verbatim Library**. (The site already **shows** "Verbatim Library" at the top.)

---

## Security reminders (don't undo these)
- The password is the **only** lock on the site — keep it long and private.
- Keep the Command Deck dashboard Artifact **unshared** — its Verbatim tab reveals
  this library's address.
- `.env`, `roster.yaml`, `state/`, `transcripts/` never leave your Mac (the
  `.gitignore` enforces it — don't add folder prefixes to those lines).
- Before approving any real quote, eyeball it for a missed real name (first names
  are fine; surnames and third-party names are not).
