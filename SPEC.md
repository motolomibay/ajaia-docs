# Spec

## 1. Product slice

A lightweight Docs-style editor where a user creates, formats and imports documents, then shares them with a teammate
as an **editor** or **viewer**, who sees them under "Shared with me". Version history lets anyone with edit rights
roll back.

## 2. Users and roles

**Accounts.** Three seeded users: `alice`, `bob`, `carol`. Login is mocked: pick a user, and a signed cookie
remembers them. There is one kind of account; a user's **role is decided per document**.

| Role | Definition |
|---|---|
| **Owner** | The user who created (or imported) the document. Exactly one per document. |
| **Editor** | A user the owner shared the document with as **"Can edit"**. |
| **Viewer** | A user the owner shared the document with as **"Can view"**. Read-only. |
| **No access** | Everyone else. Gets 403 on any request for the document. |

### Permission matrix

| Action | Owner | Editor | Viewer | No access |
|---|:-:|:-:|:-:|:-:|
| See it on dashboard | ✅ My documents | ✅ Shared with me | ✅ Shared with me | ❌ |
| Open / read | ✅ | ✅ | ✅ read-only | ❌ 403 |
| Edit content, format | ✅ | ✅ | ❌ 403 | ❌ |
| Rename | ✅ | ✅ | ❌ 403 | ❌ |
| View history | ✅ | ✅ | ❌ 403 (NICE: ✅ read-only if owner ticks "Can view history") | ❌ |
| Restore a version | ✅ | ✅ | ❌ 403 | ❌ |
| Share / change role / revoke | ✅ | ❌ 403 | ❌ 403 | ❌ |
| Delete (NICE) | ✅ | ❌ 403 | ❌ 403 | ❌ |

All rules are enforced on the **backend**; the UI hides controls but is not trusted.

```
              Doc 7 "Q3 Plan"
                   │
     ┌─────────────┼──────────────┬──────────────┐
   alice          bob           carol         (anyone else)
   OWNER       EDITOR          VIEWER          NO ACCESS
              "Can edit"      "Can view"        403
```

## 3. Features: MUST / NICE / CUT

### 3.1 Document creation and editing
| Feature | Bucket | Reason |
|---|---|---|
| Create a new document | MUST | Required |
| Rename a document | MUST | Required |
| Edit content in the browser (TipTap) | MUST | Required |
| Bold, italic, underline | MUST | Required |
| Headings H1–H3 | MUST | Required |
| Bulleted and numbered lists | MUST | Required |
| Autosave with "Saving… / Saved", one save in flight per tab | MUST | Save without thinking; no out-of-order saves |
| Version history: last 10 versions, snapshot at most every 60 s, restore (snapshot before restore) | MUST | Safety net for last-write-wins; listed stretch, chosen deliberately |
| Delete a document (owner) | NICE | Expected but not required |
| Export to Markdown | NICE | Listed stretch |
| Comments / suggestion mode | CUT | Depth over breadth |
| Real-time co-editing, presence | CUT | CRDT/websockets is a large cost; last-write-wins is documented |

### 3.2 File upload
| Feature | Bucket | Reason |
|---|---|---|
| Upload `.txt` / `.md` → new editable document (owner = uploader) | MUST | Required, cheap, preserves structure |
| Supported types and 1 MB limit stated in the UI | MUST | Brief asks for clear limits |
| Clear errors for wrong type (415) and too large (413) | MUST | Basic validation |
| `.docx` import | NICE | One library (mammoth), but a risk to the core |
| Attachments on existing documents | CUT | Import-as-new-doc is more product-relevant |

### 3.3 Sharing
| Feature | Bucket | Reason |
|---|---|---|
| Seeded users + pick-a-user login, switch user | MUST | Brief allows mocked auth; needed to demo sharing |
| Every document has an owner | MUST | Required |
| Owner shares by user **with a role** (Can edit / Can view) | MUST | Required + clear intent |
| Owner changes a role or revokes access | MUST | Completes the share dialog |
| Dashboard: "My documents" vs "Shared with me" (owner name + role shown) | MUST | Required visible distinction |
| Viewer sees read-only editor (no toolbar, no history) | MUST | Role must be visible, not just enforced |
| "Can view history" checkbox per viewer: owner lets a viewer see past versions (read-only, never restore) | NICE | Useful for reviewers/auditors, but not needed to prove the role model; low priority |
| Real auth, teams, link sharing | CUT | Brief allows mocked auth |

### 3.4 Persistence
| Feature | Bucket | Reason |
|---|---|---|
| SQLite storage: users, documents, shares, versions | MUST | Required; zero setup |
| Content stored as sanitized HTML | MUST | Formatting survives refresh; one format for editor, import, history |
| Docs, roles and history survive refresh and server restart | MUST | Required |
| Postgres / hosted DB | CUT | Unneeded for this scope |

### 3.5 Cross-cutting (built inside every lap, not separate features)
- Input validation and JSON errors (`400, 401, 403, 404, 413, 415`) with readable UI messages.
- Automated API tests for each lap's feature; no commit with a failing test.

## 4. User flows

### 4.1 Main flow (demo path)
```
Pick user (Alice)
     │
     ▼
Dashboard ── My documents ─────────── Shared with me
     │                                    │
 ┌───┴──────────┐                         │
 ▼              ▼                         ▼
New doc     Upload .txt/.md           open shared doc
 │              │                         │
 └──────┬───────┘                         │
        ▼                                 ▼
     Editor: rename · format · autosave ("Saved")
        │
        ├── History → Restore an older version
        └── Share → Bob "Can edit", Carol "Can view"
                │
                ▼
Switch to Bob   → Shared with me → opens → edits → Saved
Switch to Carol → Shared with me → opens → read-only, no toolbar
                │
                ▼
Refresh → content, formatting, roles, history all persisted
```

### 4.2 Error paths
| Situation | Result |
|---|---|
| Empty or >200-char title | 400, message under the title |
| Upload `.pdf` / `.png` | 415, "Only .txt and .md files are supported" |
| Upload > 1 MB | 413, "File must be 1 MB or smaller" |
| Carol opens a doc not shared with her (URL) | 403 page with "Back to dashboard" |
| Viewer tries to save (API) | 403 |
| Editor tries to share (API) | 403 |
| Not logged in | 401 → redirected to login |
| Share with yourself or unknown user | 400 |

## 5. Build order (laps)

| Lap | Feature | Done when (details in TEST.md) |
|---|---|---|
| 1 | **Skeleton**: DB + seed, pick-user login, empty dashboard, one test | Live URL works; Alice can log in |
| 2 | **Documents + editor**: create, list, open, rename, formatting, autosave queue | Formatted doc survives refresh |
| 3 | **Sharing with roles**: share dialog, owned vs shared lists, viewer read-only, change role, revoke | Bob edits, Carol read-only, Carol 403 on save |
| 4 | **Upload** `.txt` / `.md` → new doc | `.md` headings/lists arrive formatted; bad file rejected |
| 5 | **Version history**: snapshots, list, restore | Restore brings back older content; restore is undoable |
| 6 | **Hardening**: bug fixes, whole-project review; NICE items only if time remains | All tests green, live demo path passes |

NICE items, in priority order if time remains: delete document → `.docx` import → export to Markdown →
viewer "Can view history" checkbox.
