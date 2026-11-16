# AI Log

Summary of crucial changes per stage, not the full chat. Tool: Claude Code (CLI agent) for planning, code, tests and
deployment; I approve every step before it is accepted.

## Entry 1: Planning
Prompt:    Turn the assignment brief into a plan: scope, architecture, spec, test plan. Challenge my choices; show
           diagrams so I can critique before anything is written.
AI did:    Proposed product slice and MUST/NICE/CUT scope; Express + SQLite + React + TipTap stack in one process
           behind Caddy; data model, API, access logic and flow diagrams; wrote ARCHITECTURE.md, SPEC.md, TEST.md.
I changed: - Regrouped scope by the brief's four feature areas; moved "Product & Engineering Quality" out of the
             feature list (docs go to write-ups; AI pushed back that validation + tests stay inside each lap, I agreed).
           - Asked for all diagrams in chat first so I could critique them before approving the file.
           - Autosave: required no race conditions with last-write-wins. AI designed a one-save-in-flight queue per tab.
           - Added version history (was CUT): keep a few recent saves and allow revert. AI pushed back that
             snapshotting every autosave fills 10 slots in seconds; agreed on last 10 versions, snapshot at most every
             60 s, and always snapshot before a restore so it can be undone.
           - Asked for the stack rationale with alternatives (Next.js, Quill/Lexical, Postgres/Supabase, Render/Vercel).
           - Sharing: owner assigns a role when sharing (Can edit / Can view), moved from NICE to MUST; viewers
             cannot see history. Added a "Can view history" checkbox for viewers as a low-priority NICE.
           - Asked for strict and stress tests in TEST.md; AI added a permission-matrix sweep, IDOR, XSS, SQL
             injection, autosave race tests and a stress suite (load, same-doc race, version cap, upload abuse,
             restart under load), and pushed back that "flawless" isn't achievable: stress runs in the hardening lap,
             and accepted limits are listed openly.
           - AI changed content storage from TipTap JSON to sanitized HTML (one format for editor, import and
             history; no server-side DOM dependency); I approved it.
Failed:    none
Result:    ARCHITECTURE.md, SPEC.md, TEST.md approved. Build order: skeleton → documents + editor → sharing with
           roles → upload → version history → hardening.

## Lap 1: Skeleton
Prompt:    Build the skeleton only: DB + seeded users, pick-user login, empty dashboard, one automated test; deploy live.
AI did:    Express 5 + SQLite (better-sqlite3) server with signed-cookie mocked login; React + Vite client (user
           picker, top bar with "Switch user", empty "My documents" / "Shared with me"); JSON error handler, nosniff,
           2 MB body limit; server refuses to start in production without SESSION_SECRET. 8 tests (L1-A1..A7, X-1/X-7),
           including a forged-cookie test. Deployed as systemd service `ajaia-docs` (:4540) behind Caddy (HTTPS).
I changed: Approved as proposed; approved the Caddy + systemd changes (Caddyfile backed up, block appended only).
Failed:    - Planned a Playwright browser smoke test, but Playwright isn't installed on the VPS → used curl against the
             production build instead; visual check done by me on the live URL.
           - systemd unit pointed at /usr/bin/node, an old system Node, instead of Node 22 (/usr/local/bin/node) →
             first health check returned nothing; fixed the ExecStart path and restarted.
           - Port 4520 was taken by another service → app uses 4540.
Result:    live ✅ https://ajaia.169-58-1-250.sslip.io (HTTPS valid, API responding, other sites unaffected)

## Loop A: Write path (documents + editor + autosave + version history)
Prompt:    Regroup the remaining laps into 3 loops of features that belong together; build Loop A: create, list, open,
           rename, rich-text editor, autosave queue and version history.
AI did:    Server: documents + document_versions tables; routes for create/list/get/patch, versions list/restore;
           validate.js (title 1–200, content ≤ 1 MB, ids), access.js requireRole guard, sanitize.js allowlist
           (p, h1–h3, strong, em, u, ul, ol, li, br); snapshot ≤ 1 per 60 s, keep newest 10, snapshot+update in one
           transaction; restore snapshots first so it can be undone. Client: TipTap with only the allowed formats,
           toolbar with active states, saveQueue (800 ms debounce, one save in flight, retry, permanent-error stop,
           flush), title rename with validation, History panel. Injected clock so history tests don't wait 60 s.
           32 tests (API, sanitizer, autosave queue) + browser checks with a scratch Playwright script.
I changed: - Grouped laps into 3 loops (A write path, B access & intake, C hardening) instead of one feature per lap.
           - Tested the build on my phone and reported: "New document" did nothing for every user, the login screen
             flashed empty before users appeared, and the top bar looked rough. Asked for a smoother, cleaner UI.
Failed:    - Root cause of "New document did nothing": production served client/dist from the working folder, so my
             local rebuild went live without approval: new frontend calling an old (Lap 1) backend → 404. Fixed the
             process, not just the symptom: production now runs from its own checkout (/opt/ajaia-docs, data in
             /var/lib/ajaia-docs) and deploy/deploy.sh deploys only pushed commits (npm ci → npm test → build →
             restart → health check).
           - Login flash: card rendered before the user list loaded → load session + users together; switch is instant.
           - Found in my own phone-size browser check: editor was 34 px wide on mobile (flex column with
             align-items: flex-start) → invisible text area; fixed with align-items: stretch. Title truncated on
             mobile → header wraps.
           - Sanitizer writes <br> as <br /> → test fixture uses the normalized form (equivalent HTML, not data loss).
           - Dashboard stayed on "Loading…" when the API failed → shows the error with Retry.
Result:    live ✅ deployed 742235a via deploy.sh (tests ran on the server first); live smoke: create, save,
           sanitize (<script> stripped), versions, deep link all OK. Awaiting my manual checklist on phone + desktop.

### Loop A fix: heading applied to two lines
Prompt:    "I highlighted one line and pressed H2 but it made both lines H2" (from my manual test).
AI did:    Inspected the stored HTML: the two lines were ONE paragraph joined by a soft break (<h3>…<br />…</h3>), so a
           block format changed both. Added splitLines.js: before H1–H3 / lists, soft breaks in the selected
           paragraph become real paragraph splits, so formats apply per line.
Failed:    First fix still failed my exact case in the browser check: the selection ended right after the break, so
           after splitting it reached the start of line two → also trim a selection that ends at the start of a line.
           Verified with 4 keyboard cases + a real mouse drag on my exact content; 32 tests still green.
Result:    live ✅

### Loop A fix: spacing changed after heading → normal
Prompt:    "When I turn a line to H1/H2 and back to normal, the space is wider than before" (manual test).
AI did:    Inspected stored HTML: lines joined by a soft break (<br>) sat tight, separate paragraphs had a 1em gap, so
           any format that split them changed the spacing. Switched to Docs-like spacing: paragraphs one line apart,
           headings and lists keep their own margins, empty paragraphs keep height (Enter twice = blank line). CSS only.
Failed:    none. Measured in the browser: paragraph gap = soft-break gap = 26 px.
Result:    live ✅

### Loop A fix: "Not saved: Please log in" with two tabs open
Prompt:    Two tabs open; one was logged out, the other was editing → "Not saved: Please log in" (manual test).
AI did:    Root cause: all tabs share one login cookie, so logout/switch user in one tab silently changes the others.
           Worse case found while analysing: if the other tab picked Bob, Alice's tab would have saved AS BOB.
           Fix: every request sends X-Expect-User; server refuses with 401 SESSION_CHANGED if the cookie's user differs
           (never runs as the wrong user); tabs announce login/logout via BroadcastChannel (focus re-check fallback);
           a banner offers "Continue as <user>" (re-login + save pending edits, nothing lost) or "Go to login".
           4 new server tests (36 total); two-tab browser test of logout, switch-to-Bob, continue, and data check.
I changed: Approved. Known limit, documented: one browser = one login; use a normal + incognito window to demo sharing.
Failed:    none
Result:    live ✅

### Loop A: edge-case run on the live site (by AI, at my request)
Prompt:    Run checks 13–19 (empty title, paste from web, close tab, offline, no access, bad ids) on the VPS.
AI did:    Scripted them in a real browser against the live URL in a throwaway "E2E check" doc, then deleted it.
Result:    8/8 passed. Gap found: after the "leave page?" warning, confirming lost the last <800 ms of typing →
           fixed in Loop B (keepalive save on page close).

## Loop B: Access & intake (sharing with roles + upload)
Prompt:    Build sharing with roles and .txt/.md upload; include the close-tab fix.
AI did:    Server: shares table (editor/viewer, upsert, cascade), getRole → owner/editor/viewer, per-route allowed
           roles (read: all; edit/history/restore: owner+editor; share: owner), share routes (list/grant/change/
           revoke with validation); POST /documents/import (multer, ≤ 1 MB, .txt/.md, 415/413/400, UTF-8 and binary
           checks; .md via marked + sanitizer, .txt escaped into paragraphs). Client: Share dialog, role badges and
           owner names on the dashboard, viewer read-only editor (no toolbar/history/share + note), Upload button
           with stated limits; pagehide keepalive save. 19 new tests (55 total) incl. an IDOR sweep over every :id
           route; 3-user browser test 12/12.
I changed: Approved as proposed.
Failed:    none during build (one cleanup in review: replaced a window global for the upload header with getExpectedUser()).
Result:    live ✅

### Loop B: edge-case run on the live site (by AI, at my request)
Prompt:    Run 20–22 on the VPS with screenshots (close-tab save, revoked while editing, viewer can't sneak edits).
AI did:    Scripted in a real browser against the live URL; viewer check also fired direct API calls (versions,
           restore, edit, share-to-self) from Carol's browser. Throwaway doc deleted afterwards.
Result:    3/3 passed; all viewer API attempts 403, doc unchanged. Noted: after revoke Bob keeps the editor UI until
           refresh (data is safe) → candidate fix in Loop C.

## Loop C: Hardening (stress suite + whole-project review)
Prompt:    Build the stress suite from TEST.md §8, review the whole project, fix what it finds (incl. the revoke UX).
AI did:    scripts/stress.mjs (`npm run stress`, own server + throwaway DB): S-1 load 50 conns/20 s (0 errors, p99 140 ms),
           S-2 same-doc race, S-5 900 KB doc, S-6 upload abuse ×3 rounds, S-7 share churn, S-8 hard kill mid-writes.
           S-3 autosave burst (random latency + 10% failures) and S-4 1,000-save version cap in Vitest. 6/6 + 58 tests.
           Review fixes: UTF-8 upload filenames; CSP / X-Frame-Options / Referrer-Policy headers (0 CSP violations
           across all browser regressions); editor locks with a "your access changed — Reload" banner on 403.
I changed: Approved.
Failed:    - AI's first S-6/S-8 passed too easily (GC called in the test process, not the server; writer kept going
             after the kill so "stored ≥ acked" was trivial) → AI tightened them itself: 3 upload rounds must plateau;
             writes stop at the kill and stored must equal the last acknowledged save. Both still pass.
           - Review probe found `Résumé 计划.txt` titled "RÃ©sumÃ© è®¡å" (multer reads names as Latin-1) → decode UTF-8.
           - First access-lost fix flickered: derived from save status, so the next keystroke cleared it → latched state.
           - Then AI caught its own risk: making destroy() permanent could kill autosave during React cleanup → split
             into destroy() (timers only) and stop() (permanent), with a test.
Result:    live ✅

## Write-ups
Prompt:    Write README, final ARCHITECTURE, AI_WORKFLOW, SUBMISSION, video-link file; make the repo public.
AI did:    Verified the README steps from a fresh clone (install → 58 tests → build → start; dev mode proxies the API);
           generated screenshots from a demo-seeded throwaway server; added samples/ for upload testing; recorded
           final test and stress results in TEST.md; scanned files and history for secrets before publishing.
Result:    docs complete; video link to be added by me after recording.

## NICE: Delete document (owner only)
Prompt:    "There is no delete; add it, and only the owner can do that."
AI did:    DELETE /api/documents/:id guarded to owner (editor/viewer 403); shares + history cascade. Editor Delete button
           and dashboard Delete link (owned rows only) with an explicit confirm; autosave stopped before deleting.
           A shared user who still has the doc open gets a locked editor and "deleted by its owner" banner (404 latch).
           3 new tests (61 total); browser test 9/9; docs updated (README, ARCHITECTURE, SUBMISSION, SPEC, TEST).
I changed: Asked for it after the core was done; approved.
Failed:    none
Result:    live ✅

## Packaging
Prompt:    Videos recorded (Loom demo + architecture explanation); package everything for submission.
AI did:    Added video links to VIDEO_LINK.txt and SUBMISSION.md; prepared the Drive checklist and form text.
Result:    repo public and complete; Drive upload and form submission done by me.
