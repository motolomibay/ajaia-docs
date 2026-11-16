# AI Workflow Note

How I used AI on this project, where it helped, what I changed or rejected, and how I verified the result.
The lap-by-lap record is in [AI_LOG.md](AI_LOG.md).

## Tools

| Tool | Used for |
|---|---|
| **Claude Code** (CLI agent, running on my VPS) | Planning documents, code, tests, deployment scripts, browser checks, write-ups |
| **Headless Chrome** (scripted by the agent) | End-to-end checks on local builds and on the live site, plus screenshots |
| **My own phone and desktop browsers** | Manual testing on the live URL after every deploy |

## How I worked with it

I set a written working agreement before starting: **I make the decisions; the AI proposes, explains and builds;
nothing is accepted until I approve it.** Every change went through the same loop:

```
plan → build one loop → AI explains what changed and what could break → I approve or push back
     → npm test (no commit with a failing test) → commit → deploy from GitHub → I test on the live site → log
```

- **Plan first, in diagrams.** Before any code, I had it draft scope, architecture, data model, API and flows,
  and show the diagrams in chat so I could critique them before anything was written to a file.
- **Decompose by shared code.** After the skeleton I regrouped the remaining work into three loops of features
  that touch the same code (write path; access & intake; hardening) instead of one feature per lap.
- **"Done when" before building.** TEST.md defined the criteria and test IDs for each loop up front; every
  automated test maps to one of them.
- **Real usage as the prompt.** Most fixes started from me using the live app on my phone or desktop and pasting
  exactly what I saw.

## Where AI materially sped things up

- **Planning artifacts in minutes:** SPEC, ARCHITECTURE with diagrams, and a test plan with 60+ named cases.
- **Breadth of tests I wouldn't have written by hand under time pressure:** every cell of the permission matrix,
  an IDOR sweep over every document route, XSS cases, a crash-safety test for the version transaction, an autosave
  queue test with random latency and 10% failures, and a load / race / hard-kill stress suite.
- **Root-causing from symptoms:** for each bug I reported, it read the stored data or reproduced the case in a
  browser before changing code (see below).
- **Verification I couldn't do quickly by hand:** scripted three-user browser sessions, two-tab session tests,
  phone-size layout checks, and CSP-violation checks on the live site.

## What I changed or rejected

| AI proposal | What I did | Why |
|---|---|---|
| Scope grouped as a flat list, with "Product & Engineering Quality" as a feature | Regrouped by the brief's four feature areas; moved docs to write-ups | Clearer mapping to how we're evaluated. (It pushed back that validation and tests must stay inside each lap; I agreed.) |
| Shared users can simply edit | Required **roles chosen at share time** (Can edit / Can view), viewers can't see history; "Can view history" checkbox as a NICE | A real product needs read-only sharing |
| Version history CUT | **Added it**, with a few recent restore points | Safety net for last-write-wins. It pushed back on snapshotting every autosave (10 slots fill in seconds); we agreed on ≤ 1 per minute, keep 10, snapshot before restore |
| One feature per lap | **Three loops** of related features | Same code touched once; fewer, deeper reviews |
| First UI | Rejected the login flash, rough top bar, and pushed for mobile polish | Found by testing on my phone |
| Content as TipTap JSON | Accepted its own reversal to sanitized HTML | One format for editor, upload and history; no server-side DOM needed |

## Where the AI got it wrong, and how it was caught

| Problem | Caught by | Fix |
|---|---|---|
| **"New document" did nothing for every user.** Production served files from the working folder, so a local build went live against the old backend | Me, on my phone | Fixed the *process*: production runs from its own checkout; deploys only pushed, tested commits |
| Editor was **34 px wide on phones** (invisible) | AI's own phone-size browser check | One-line CSS fix |
| Selecting one line and pressing H2 changed **two lines** | Me, manual test | AI inspected stored HTML (one paragraph joined by a soft break); split lines before block formats. Its first fix still failed my exact case; caught in the browser re-test |
| Spacing changed after heading → normal | Me, manual test | Docs-like paragraph spacing; measured equal gaps (26 px) |
| Two tabs: "Not saved: Please log in" | Me, manual test | AI found the worse case: the tab could have saved **as another user**. Added the X-Expect-User guard, tab sync and a recovery banner |
| Stress tests that passed **too easily** (memory measured in the wrong process; writes continued after the "crash") | AI reviewing its own results | Tightened both before accepting them |
| Non-English upload names garbled (`Résumé` → `RÃ©sumÃ©`) | AI's review probe | Decode UTF-8; test added |
| Access-lost banner **flickered** away on the next keystroke; then a change that could have disabled autosave | AI's browser re-test, then its own review before testing | Latched state; split `destroy()` from `stop()` with a test |

## How I verified correctness, UX and reliability

- **Correctness:** `npm test` (61 tests) runs before every commit and again on the server before every restart.
- **Security:** server-side role checks on every route (403 sweep), sanitizer allowlist (XSS tests), CSP headers
  with zero violations in real browser runs, parameterized SQL, session-mismatch guard.
- **Reliability:** `npm run stress`: 50-connection load at p99 ≈ 140 ms with 0 errors, same-document races without
  corruption, 60 parallel 1 MB uploads with memory plateauing, a hard kill mid-write losing no acknowledged save.
- **UX:** I tested every loop on the live site on phone and desktop with a written checklist; the AI also scripted
  the same flows in headless Chrome against the live URL (throwaway documents, deleted afterwards).

## What I'd do differently

Set up the separate production checkout **before** the first deploy, not after the first incident, and add a
Playwright suite to CI so the browser checks run on every commit instead of on demand.
