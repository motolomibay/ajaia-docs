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
