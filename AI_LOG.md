# AI Log

A decision log, not a chat transcript: what I asked for, what the AI produced, where I overruled or redirected it,
what broke, and how each fix was verified.

**Tool:** Claude Code (CLI agent on my VPS) for planning, code, tests, deployment and scripted browser checks.
**Operating rule:** I own the decisions; the AI proposes, builds and explains; nothing ships without my approval,
a green test suite, and my own check on the live site.

**Principles I held throughout**
- **Plan before code, critique in diagrams.** Cheap to change a box on a diagram; expensive to change a schema.
- **Ship a live skeleton first**, then grow it: every loop ended deployed and tested on a real phone and desktop.
- **Fix the process, not just the symptom.** When something broke, I asked *why it was possible*, not only *what broke*.
- **The server is the security boundary.** UI restrictions are a convenience; every rule is enforced in the API.
- **Name the limits.** Accepted trade-offs are written down with a reason, not discovered by reviewers.

---

## Entry 1: Planning
**Prompt:** Turn the brief into a plan (scope, architecture, spec, test plan); challenge my choices; show every
diagram in chat so I can critique it before anything is written.
**AI did:** Product slice and MUST / NICE / CUT scope; Express + SQLite + React + TipTap in one process behind
Caddy; data model, API, access-logic and flow diagrams; ARCHITECTURE.md, SPEC.md, TEST.md.
**My decisions:**
- **Scope mapped to how we're evaluated:** regrouped by the brief's four feature areas and moved "Product &
  Engineering Quality" out of the feature list. The AI pushed back that validation and tests must live *inside*
  every lap, not at the end; I agreed, and it became a rule for every loop.
- **Autosave without races:** last-write-wins across users is acceptable, but a single tab must never overwrite its
  own newer content. The AI designed a one-save-in-flight queue per tab.
- **Version history promoted from CUT to MUST** as the safety net for last-write-wins. The AI pushed back that a
  snapshot per autosave fills 10 slots in seconds; we settled on 10 versions, at most one per minute, and a
  snapshot *before* every restore so a restore is itself undoable.
- **Sharing must carry intent:** the owner picks a role at share time (Can edit / Can view), promoted to MUST;
  viewers can't see history. A per-viewer "Can view history" option was parked as low-priority NICE.
- **Stack justified against alternatives** (Next.js, Quill / Lexical, Postgres / Supabase, Vercel / Render) before
  committing.
- **Testing designed up front:** I asked for strict and stress tests; the AI added a permission-matrix sweep, IDOR,
  XSS, SQL injection, autosave-race and load / race / restart tests, and pushed back that "flawless" isn't a real
  target. We agreed stress runs in the hardening loop and known limits are listed openly.
- **Accepted an AI reversal:** content stored as sanitized HTML instead of TipTap JSON (one format for editor,
  import and history; no server-side DOM dependency).
**Result:** ARCHITECTURE.md, SPEC.md, TEST.md approved. Build order: skeleton → documents + editor → sharing with
roles → upload → version history → hardening.

## Lap 1: Skeleton, live before features
**Prompt:** Skeleton only (DB + seeded users, pick-user login, empty dashboard, one automated test), deployed live.
**AI did:** Express 5 + better-sqlite3 with signed-cookie mocked login; React + Vite client (user picker, "Switch
user", empty *My documents* / *Shared with me*); JSON error handler, `nosniff`, 2 MB body limit; server refuses to
start in production without `SESSION_SECRET`. 8 tests incl. a forged-cookie test. systemd service behind Caddy.
**My decisions:** Approved the shared-server changes only with safeguards: Caddyfile backed up, new block appended,
existing sites verified unaffected.
**Failed → fixed:**
- No Playwright on the VPS → curl smoke test against the production build; I did the visual check live.
- systemd pointed at an old system Node (`/usr/bin/node`) → empty health check → pinned Node 22.
- Port 4520 taken by another service → app on 4540.
**Result:** live ✅ https://ajaia.169-58-1-250.sslip.io (valid HTTPS, other sites unaffected).

## Loop A: Write path (documents, editor, autosave, version history)
**Prompt:** Regroup the remaining laps into 3 loops of features that share code; build the write path.
**AI did:** `documents` + `document_versions`; create / list / get / patch, versions list / restore; validation
(title 1–200, content ≤ 1 MB, ids), `requireRole` guard, sanitizer allowlist (`p h1–h3 strong em u ul ol li br`);
snapshot ≤ 1 per 60 s, keep 10, snapshot + update in **one transaction**; restore snapshots first. Client: TipTap
limited to the allowed formats, toolbar with active states, save queue (800 ms debounce, one in flight, retry,
stop on permanent errors, flush), title validation, History panel. Injected clock so history tests don't wait 60 s.
32 tests + scripted browser checks.
**My decisions:**
- **3 loops instead of 5 laps:** editor, autosave and history all sit on the same save path, so build and review
  them once.
- **Tested on my phone**, not just desktop, and rejected the first UI: "New document" did nothing, the login screen
  flashed empty, and the top bar looked unfinished.
**Failed → fixed:**
- **"New document did nothing" for every user.** Root cause: production served `client/dist` from the working
  folder, so a local build went live *without approval*: new frontend against the old backend → 404.
  **I treated it as a process failure:** production now runs from its own checkout (`/opt/ajaia-docs`, data in
  `/var/lib/ajaia-docs`), and `deploy.sh` ships only pushed commits: `npm ci → npm test → build → restart →
  health check`. Nothing untested can reach the live site again.
- Login flash → load session and user list together; switching user is instant.
- Editor **34 px wide on phones** (flex column + `align-items: flex-start`), found by the AI's phone-size check →
  `align-items: stretch`; the header wraps on small screens.
- Sanitizer normalizes `<br>` to `<br />` → test fixture uses the normalized form (equivalent HTML, no data loss).
- Dashboard stuck on "Loading…" when the API failed → error shown with Retry.
**Result:** live ✅ `742235a` via deploy.sh; live smoke test (create, save, `<script>` stripped, versions, deep link).

## Loop A fix: a heading applied to two lines
**Prompt:** "I highlighted one line and pressed H2, but both lines became H2."
**AI did:** Read the stored HTML before touching code: the lines were one paragraph joined by a soft break
(`<h3>…<br />…</h3>`), so a block format hit both. Added `splitLines.js`: before H1–H3 or lists, soft breaks in the
selection become real paragraph splits, so formats apply per line.
**Failed → fixed:** The first fix still failed *my exact case* in the browser re-test: the selection ended just
after the break and reached into line two → also trim selections that end at the start of a line. Verified with
4 keyboard cases and a real mouse drag on my stored content.
**Result:** live ✅

## Loop A fix: spacing changed after heading → normal
**Prompt:** "Turning a line into a heading and back makes the spacing wider than before."
**AI did:** Diagnosed from stored HTML: soft-broken lines sat tight while separate paragraphs had a 1em gap, so any
split changed the spacing. Switched to Docs-like spacing (paragraphs one line apart; headings and lists keep their
margins; Enter twice = blank line). CSS only, no data change.
**Verified:** measured in the browser: paragraph gap = soft-break gap = 26 px. **Result:** live ✅

## Loop A fix: "Not saved: Please log in" with two tabs open
**Prompt:** One tab logged out while another was editing → "Not saved: Please log in."
**AI did:** Root cause: all tabs share one login cookie. While analysing, it found a **worse latent bug**: if the
other tab had picked Bob, Alice's tab would have **saved as Bob**. Fix: every request carries `X-Expect-User`; the
server refuses with `401 SESSION_CHANGED` on a mismatch (never runs as the wrong user); tabs announce login /
logout via BroadcastChannel (focus re-check fallback); a banner offers "Continue as …" (re-login, pending edits
saved, nothing lost) or "Go to login". 4 server tests (36 total) + a two-tab browser test.
**My decisions:** Approved; documented the honest limit (one browser = one login; demo with a normal + incognito
window) rather than hiding it.
**Result:** live ✅

## Loop A: edge cases on the live site
**Prompt:** Run checks 13–19 (empty title, paste from the web, close tab, offline, no access, bad ids) on the VPS.
**AI did:** Scripted them in a real browser against production in a throwaway doc, then deleted it.
**Result:** 8/8 passed. **Gap found:** confirming "leave page" lost the last < 800 ms of typing → scheduled the fix
(keepalive save on close) into Loop B rather than patching mid-loop.

## Loop B: Access & intake (sharing with roles + upload)
**Prompt:** Build role-based sharing and `.txt` / `.md` upload; include the close-tab fix.
**AI did:** `shares` (editor / viewer, upsert, cascade); `getRole` → owner / editor / viewer; per-route allowed
roles (read: all; edit / history / restore: owner + editor; share: owner); share routes with validation;
`POST /documents/import` (≤ 1 MB, `.txt` / `.md`, 415 / 413 / 400, UTF-8 and binary checks; `.md` via marked →
sanitizer, `.txt` escaped into paragraphs). Client: Share dialog, owner names and role badges, read-only viewer
mode, Upload button with stated limits, keepalive save on page hide. 19 new tests (55) incl. an **IDOR sweep over
every `:id` route**; 3-user browser test 12/12.
**Review catch:** replaced a `window` global used for the upload header with a proper accessor.
**Result:** live ✅

## Loop B: edge cases on the live site
**Prompt:** Run 20–22 on the VPS with screenshots (close-tab save, revoked while editing, viewer can't sneak edits).
**AI did:** Real-browser run against production; the viewer check also fired **direct API calls** from Carol's
browser (list versions, restore, edit, share-to-self).
**Result:** 3/3; every viewer API attempt 403, document unchanged. **Noted:** after a revoke, Bob kept the editor UI
until refresh (data safe, UX misleading) → queued for Loop C.

## Loop C: Hardening (stress suite + whole-project review)
**Prompt:** Build the stress suite, review the whole project, fix what it finds, including the revoke UX.
**AI did:** `npm run stress` (own server, throwaway DB): 50 connections / 20 s with 0 errors and p99 140 ms;
same-document race without corruption; 900 KB document; upload abuse over 3 rounds; share churn; **hard kill
mid-write**. Autosave burst (random latency + 10% failures) and the 1,000-save version cap run in Vitest.
Review fixes: UTF-8 upload filenames; CSP / X-Frame-Options / Referrer-Policy (0 violations across all browser
regressions); editor locks with an "access changed" banner on 403.
**Failed → fixed (the AI auditing its own work):**
- **Two stress tests passed too easily.** Memory was measured in the test process, not the server; the writer kept
  writing after the kill, so "stored ≥ acknowledged" was trivially true. Tightened before accepting: memory must
  plateau across 3 rounds; writes stop at the kill and the stored value must **equal** the last acknowledged save.
- A probe found `Résumé 计划.txt` titled `RÃ©sumÃ© è®¡å` (multer reads names as Latin-1) → decode UTF-8, test added.
- The first access-lost banner flickered (derived from save status) → latched state.
- Then a self-caught risk: making `destroy()` permanent could disable autosave during React cleanup → split into
  `destroy()` (timers) and `stop()` (permanent), with a test.
**Result:** live ✅, 58 tests + 6/6 stress.

## Write-ups
**Prompt:** README, final ARCHITECTURE, AI_WORKFLOW, SUBMISSION, video-link file; make the repo public.
**AI did:** Verified the README from a **fresh clone** (install → tests → build → start; dev mode proxies the API);
screenshots from a demo-seeded throwaway server; `samples/` for reviewers; final results recorded in TEST.md;
**scanned every file and the full git history for secrets** before publishing.
**Result:** docs complete; repo public.

## NICE: Delete document (owner only)
**Prompt:** "There's no delete. Add it, and only the owner can do it."
**AI did:** `DELETE /api/documents/:id`, owner only (editor / viewer 403); shares and history cascade. Delete in the
editor and on owned dashboard rows, with an explicit confirmation; autosave stopped first so it can't race the
delete. A collaborator who still has the doc open gets a locked editor and a "deleted by its owner" banner.
3 tests (61 total); browser test 9/9; docs updated.
**My decisions:** Added only after every MUST was live and hardened; core quality first.
**Result:** live ✅

## Packaging
**Prompt:** Both videos recorded (Loom demo + architecture explanation); package for submission.
**AI did:** Video links in VIDEO_LINK.txt and SUBMISSION.md; Drive checklist and submission-form text.
**Result:** repo public and complete; Drive upload and form submission done by me.

---

## What this log shows

| Pattern | Examples |
|---|---|
| **I overruled or redirected the AI** | Scope regrouping, version history added, roles at share time, 3 loops, UI rejected after phone testing |
| **The AI pushed back and I agreed** | Tests inside every lap, snapshot frequency, "flawless" isn't a target |
| **Root cause before code** | Stored-HTML inspection for the heading and spacing bugs; cookie analysis for the two-tab bug |
| **Process fixes, not patches** | GitHub-only, test-gated deploys after the untested-build incident |
| **Verification I didn't take on trust** | Live-site browser runs, direct API attacks as a viewer, tightened stress tests, fresh-clone README check |
