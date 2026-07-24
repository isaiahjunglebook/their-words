# Privacy & Consent — The Expedition Verbatim Library

Two parts: **(1) how the data is actually protected** (the technical reality
behind the promise), and **(2) what to tell the men before Week 1** (the promise
itself). The promise is only as good as Part 1, so Part 1 comes first.

---

## Part 1 — How the data is protected (the technical reality)

**The private stuff never leaves the machine.**
1. Zoom records a **separate audio file per participant**, locally.
2. Whisper transcribes it **on Isaiah's Mac** — no cloud, no API, offline.
3. **Raw audio and raw transcripts are gitignored** — they are never uploaded,
   pushed, or shared. They live on one machine.
4. The map from a real name to a label (`roster.yaml`) is **local-only,
   gitignored, never pushed.** The link between a quote and a real person exists
   on Isaiah's machine and nowhere else.

**Only anonymized fragments ever go online.**
5. Before anything leaves the machine it is **anonymized**: display initials
   only (never full surnames); any third-party name inside a quote is
   **bracket-redacted** (`[K—]`).
6. What's stored online is only the **anonymized candidate quotes + approved
   canon** — held in a **PRIVATE GitHub repo** and shown only in a
   **password-protected, search-engine-hidden dashboard** that only Isaiah
   opens.
7. The extraction runs in **Isaiah's own Claude workspace with model-training
   turned off** — the content isn't used to train anything and no third party
   reviews it.

**A human gate, and a way out.**
8. **Nothing enters the library without Isaiah's explicit approval** (the
   dashboard approve/kill step).
9. **No name, ever, without that man's specific yes.** External use (marketing,
   a book) is anonymized by default; attribution to a named man happens only
   with his recorded permission on that specific quote.
10. **Sensitive disclosures get individual sign-off** before any use outside the
    circle (e.g. anything naming a partner/child, or a raw personal admission).
11. **Removal on request, anytime.** A man can ask for anything to be deleted and
    it's removed — from candidates and canon.

### Must-do settings (these make Part 1 true, not aspirational)
- [ ] **GitHub repo set to PRIVATE.** Anonymized quotes must not sit in a public repo.
- [ ] **Vercel Deployment Protection ON** (Vercel Auth) **+** the dashboard review password set.
- [ ] **Claude data setting: "help improve Claude" / model-training turned OFF** in the workspace used for extraction.
- [ ] `roster.yaml`, raw transcripts, `.env`, and `state/` confirmed gitignored (they are by default).

---

## Part 2 — What to tell the men before Week 1

Say this plainly, out loud, before anyone shares anything real. Adapt the voice;
keep the substance.

> **Before we start, here's exactly what happens with your words — and how I protect you.**
>
> 1. **Our calls are recorded and transcribed** — privately, on my own machine —
>    so I can build from what we share here.
> 2. **I keep a library of powerful things men say** in this work. But it's
>    **anonymized**: initials only, never your full name — and any name you
>    mention (a partner, your kids, anyone) gets redacted.
> 3. **The recordings and full transcripts never leave my computer** and are
>    never shared with anyone.
> 4. **Nothing you say is ever published or tied to your name without your
>    explicit yes** — on that specific quote, not a blanket release.
> 5. **Anything especially personal, I come to you individually first** before it
>    is used anywhere outside this circle.
> 6. **You can tell me to delete anything, anytime** — no explanation needed.
> 7. **What's shared in the circle stays in the circle.**
>
> If any of that doesn't sit right, tell me now, and we'll adjust before we begin.

### Get it on the record
- A quick **verbal yes from each man on the call** (which is itself recorded), or
- A one-line **written acknowledgement** (text/email) that they've heard and
  agree to the above.
- Keep those acknowledgements with the roster (local, private).
