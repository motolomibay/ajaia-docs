# Test Plan

How every lap is proven done. Three layers:

| Layer | Tool | When it runs | Gate |
|---|---|---|---|
| **Automated (strict)** | Vitest + Supertest, in-memory SQLite | `npm test` before every commit | **No commit with a failing test** |
| **Manual (live)** | Browser on the live URL | After every deploy | Lap is not done until it passes live |
| **Stress / robustness** | `npm run stress` (Node script, `autocannon` + scripted races) | Lap 6 (hardening), and re-run before submission | Thresholds in §8 |

**Manual pattern for every feature:** Alice does it → Bob/Carol sees the right result → refresh → one bad input.

Test IDs (`L2-A3`) are used in commits and AI_LOG.md.

---

## Lap 1: Skeleton

**Done when:** live URL loads over HTTPS; user picker shows Alice, Bob, Carol; picking one shows an empty dashboard
with their name; refresh keeps them logged in; logout returns to picker; `npm test` green.

**Automated**
| ID | Test |
|---|---|
| L1-A1 | `GET /api/users` → 200, exactly the 3 seeded users, no extra fields |
| L1-A2 | `POST /api/login {username:"alice"}` → 200 + `Set-Cookie` (HttpOnly, SameSite=Lax) |
| L1-A3 | `GET /api/me` with cookie → alice; without cookie → 401 |
| L1-A4 | Login with unknown user, empty body, `username: 123`, `username: "  "` → 400 |
| L1-A5 | **Tampered cookie** (edited user id, bad signature) → 401, never another user |
| L1-A6 | Seeding is idempotent: start twice → still exactly 3 users |
| L1-A7 | Unknown `/api/*` route → 404 JSON; unknown non-API path → SPA `index.html` |

**Manual (live)**
1. Open URL → picker. Pick Alice → "Alice" dashboard, empty state message.
2. Refresh → still Alice. Logout → picker. Pick Bob → Bob.
3. Bad input: delete the cookie in devtools, refresh → back to picker, no crash.

---

## Lap 2: Documents + editor

**Done when:** Alice creates a doc, renames it, applies bold, italic, underline, H1–H3, bullet and numbered lists;
status shows "Saving…" then "Saved"; refresh and server restart preserve title and all formatting; doc appears in
"My documents" newest-updated first.

**Automated**
| ID | Test |
|---|---|
| L2-A1 | `POST /api/documents` → 201, owner = caller, default title "Untitled document" |
| L2-A2 | `GET /api/documents` → doc in `owned`, not in `shared`; other users don't see it |
| L2-A3 | `PATCH` title + content → 200; `GET` returns the same values; `updated_at` advances |
| L2-A4 | Title validation: `""`, whitespace only, > 200 chars, non-string → 400; title is trimmed |
| L2-A5 | Content > 1 MB → 413; non-string content → 400 |
| L2-A6 | **Sanitizer keeps** `p h1 h2 h3 strong em u ul ol li br` exactly (round-trip equality) |
| L2-A7 | **Sanitizer strips** `<script>`, `<img onerror>`, `<a href="javascript:">`, `<iframe>`, `style=`, `on*=` attributes, `<svg>` |
| L2-A8 | `GET/PATCH /api/documents/abc`, `/-1`, `/99999` → 400 / 404, never 500 |
| L2-A9 | Unknown fields in PATCH body (`owner_id`, `id`) are ignored: owner cannot be changed |
| L2-A10 | Malformed JSON body → 400 JSON error, not an HTML stack trace |

**Unit (client save queue, `useAutosave`)**
| ID | Test |
|---|---|
| L2-U1 | 10 rapid edits within debounce → exactly 1 request |
| L2-U2 | Edit while a save is in flight → no second concurrent request; one follow-up save after it returns |
| L2-U3 | The **last** content typed is the content that ends up saved (no out-of-order overwrite) |
| L2-U4 | Failed save → status "Save failed – retrying", content is not lost, retry succeeds |

**Manual (live)**
1. Alice: New doc → rename "Q3 Plan" → type text using every toolbar button → see "Saved".
2. Refresh → identical formatting. Back to dashboard → "Q3 Plan" at top.
3. Bad input: clear the title → error shown, previous title kept. Paste a block of HTML with a `<script>` from a web page → no alert, script gone after refresh.

---

## Lap 3: Sharing with roles

**Done when:** Alice shares "Q3 Plan" with Bob as *Can edit* and Carol as *Can view*; Bob sees it under "Shared with
me" (owner Alice, Can edit) and can edit; Carol sees it read-only with no toolbar and no history; Alice changes Carol
to editor and back; Alice revokes Bob and it disappears from his dashboard.

**Automated: full permission matrix** (every cell in SPEC §2 is a test)
| ID | Test |
|---|---|
| L3-A1 | Owner shares `{username:"bob", role:"editor"}` → 201; Bob's `GET /api/documents` lists it in `shared` with owner name + role |
| L3-A2 | Editor: GET 200, PATCH 200, shares 403, delete 403 |
| L3-A3 | Viewer: GET 200 (role "viewer"), PATCH title 403, PATCH content 403, versions 403, restore 403, shares 403 |
| L3-A4 | No access (Carol before sharing): GET, PATCH, shares, versions → 403, never 200 |
| L3-A5 | Sharing again with same user **updates** role, does not duplicate (one row) |
| L3-A6 | `PATCH /shares/:userId {role:"viewer"}` downgrades; next PATCH by that user → 403 immediately |
| L3-A7 | Revoke → user's next GET → 403; doc gone from their dashboard |
| L3-A8 | Validation: share with self, unknown user, role `"admin"`, missing role → 400 |
| L3-A9 | Owner never appears in `shared`; shared user never appears in `owned` |
| L3-A10 | **IDOR sweep:** for every route with `:id`, Carol with a valid cookie gets 403 on Alice's private doc |

**Manual (live)**
1. Alice: Share → Bob "Can edit", Carol "Can view".
2. Switch to Bob → "Shared with me: Q3 Plan · Alice · Can edit" → edit → Saved. Switch to Alice → refresh → sees Bob's edit.
3. Switch to Carol → read-only, no toolbar, no History button, typing does nothing.
4. Refresh all three → same state. Bad input: Carol pastes Alice's doc URL after revoke → 403 page with "Back to dashboard".

---

## Lap 4: Upload `.txt` / `.md`

**Done when:** UI states "Supported: .txt, .md · max 1 MB"; uploading a `.md` with headings, bold, lists creates a new
doc owned by the uploader with that formatting; `.txt` creates paragraphs; wrong type and oversize show clear errors.

**Automated**
| ID | Test |
|---|---|
| L4-A1 | `.md` with `#`, `##`, `**b**`, `*i*`, `-` list, `1.` list → doc HTML has `h1 h2 strong em ul ol` |
| L4-A2 | `.txt` with blank-line paragraphs → `<p>` per paragraph; `<` and `&` are escaped, not interpreted |
| L4-A3 | Title = filename without extension, trimmed to 200 chars |
| L4-A4 | `.pdf`, `.png`, no extension, `.md.exe` → 415 |
| L4-A5 | > 1 MB → 413; empty file → 400; no file field → 400 |
| L4-A6 | **Malicious `.md`**: raw `<script>`, `[x](javascript:alert(1))`, `<img onerror>` → all stripped |
| L4-A7 | Uploaded doc: owner = uploader, not visible to others until shared |
| L4-A8 | Non-UTF-8 / binary renamed to `.txt` → 400 or safely escaped text, never 500 |

**Manual (live)**
1. Alice uploads `sample.md` → opens in editor formatted; appears in "My documents".
2. Share with Bob → Bob sees formatting. Refresh → intact.
3. Bad input: upload a `.pdf` → "Only .txt and .md files are supported"; a 2 MB `.txt` → "File must be 1 MB or smaller".

---

## Lap 5: Version history

**Done when:** after editing over > 60 s, History lists versions (time + author); Restore brings back older content
and title; the pre-restore state appears as a new version so restore can be undone; never more than 10 versions.

**Automated** (clock injected so tests don't wait 60 s)
| ID | Test |
|---|---|
| L5-A1 | First PATCH creates a version of the previous state |
| L5-A2 | PATCHes within 60 s of newest version → no new version; after 60 s → one new version |
| L5-A3 | 25 snapshot-worthy PATCHes → exactly 10 versions kept, the newest 10 |
| L5-A4 | Restore → doc equals that version; a new version holds the pre-restore state; count still ≤ 10 |
| L5-A5 | Restore → undo the restore → original content back |
| L5-A6 | Restore a version from **another document** (`/documents/1/versions/<id of doc 2>/restore`) → 404 |
| L5-A7 | Viewer / no access: list 403, restore 403 |
| L5-A8 | Delete doc (if built) cascades its versions and shares |
| L5-A9 | Snapshot + update + prune happen in **one transaction** (forced failure mid-way leaves doc unchanged) |

**Manual (live)**
1. Alice edits, waits a minute, edits again → History shows ≥ 2 versions with author and time.
2. Restore the older one → content reverts. History now shows the pre-restore version → restore it → back.
3. Bob (editor) sees History; Carol (viewer) does not. Refresh → history persists.

---

## Lap 6: Hardening (whole project)

**Done when:** all automated tests green; stress suite meets §8 thresholds; full demo path (SPEC §4.1) passes on the
live URL in a fresh incognito window; every error path in SPEC §4.2 shows a readable message.

---

## 7. Cross-cutting strict tests (run every lap)

| ID | Area | Test |
|---|---|---|
| X-1 | Errors | Every 4xx/5xx is JSON `{error}`; no stack traces or SQL in responses |
| X-2 | Errors | Thrown error inside a route → 500 JSON, server keeps serving the next request |
| X-3 | Auth | Every `/api/documents*` route without a cookie → 401 (route list is generated, not hand-written) |
| X-4 | SQL | Titles/usernames like `'; DROP TABLE documents;--` are stored/rejected safely (parameterized queries only) |
| X-5 | Unicode | Emoji, RTL text, CJK in title and content round-trip exactly |
| X-6 | Persistence | Write → close DB → reopen file → data, roles, versions all present (restart simulation) |
| X-7 | Headers | Responses include `X-Content-Type-Options: nosniff`; cookie is HttpOnly |
| X-8 | Body limits | JSON body > 2 MB → 413, not a crash |

## 8. Stress and robustness (`npm run stress`, against a local production build)

| ID | Scenario | Pass threshold |
|---|---|---|
| S-1 | **Load**: 50 concurrent connections, 20 s, mixed `GET /api/documents` + `PATCH` | 0 errors / 5xx; p99 latency < 200 ms |
| S-2 | **Same-doc race**: 2 users × 100 interleaved PATCHes to one doc | No 5xx; final content equals one of the submitted payloads exactly (no corruption/mixing) |
| S-3 | **Autosave burst**: one tab, 500 edits in 10 s through the real save queue | ≤ 1 request in flight at any time; final saved content = last edit |
| S-4 | **Version cap under load**: 1,000 PATCHes with clock advanced each time | Exactly 10 versions; DB size stays bounded |
| S-5 | **Large doc**: ~900 KB of formatted content | Saves, loads and renders; editor stays responsive (typing lag not noticeable) |
| S-6 | **Upload abuse**: 20 parallel 1 MB uploads + 20 oversize uploads | Valid ones succeed, oversize get 413, memory returns to baseline, no 5xx |
| S-7 | **Share churn**: 200 share/role-change/revoke cycles, then permission check | Final permissions match the last operation exactly |
| S-8 | **Restart under use**: restart service during S-1 | Service back within 5 s; no data lost for acknowledged (200) saves |
| S-9 | **Slow/flaky network** (devtools "Slow 3G" / offline toggle) | "Saving…" persists, then "Saved"; offline shows "Save failed – retrying"; no lost content after reconnect |

## 9. Results (final run)

| Suite | Result |
|---|---|
| `npm test` | **58 / 58 passed** |
| `npm run stress` | **6 / 6 passed**: S-1 ~21k requests, 0 errors, p99 140 ms · S-2 final content is one whole payload · S-5 900 KB save 0.3 s / load 0.04 s · S-6 60/60 accepted, 60/60 rejected 413, memory plateaus · S-7 access matches last op · S-8 back in 0.7 s, stored = last acknowledged save |
| S-3, S-4 | In `npm test` (autosave burst with random latency + failures; 1,000 saves → exactly 10 versions) |
| S-9 and manual checks | Verified in headless Chrome against the live site and by hand on phone + desktop (Loop A 13–19, Loop B 20–22) |

## 10. Known limits (accepted, documented, not failures)
- Two users editing the **same doc at the same moment**: last write wins; the other's latest edit may be overwritten
  (history keeps a recovery point at most 60 s old).
- Mocked login: anyone can pick any user. Demo only.
- Single server + SQLite: not horizontally scalable.
