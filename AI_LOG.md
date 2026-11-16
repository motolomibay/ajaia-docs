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
