# Submission: Ajaia Docs

**Candidate:** Motolomi Feleke
**Role:** AI-Native Full Stack Developer

| | |
|---|---|
| **Live app** | https://ajaia.169-58-1-250.sslip.io |
| **Source code** | https://github.com/motolomibay/ajaia-docs |
| **Walkthrough video** | see `VIDEO_LINK.txt` |
| **Test accounts** | Alice, Bob, Carol. Pick one on the login screen; no passwords |

> To see two users at once, use a normal window and a private/incognito window (one login per browser).

## What's included

| Item | Location |
|---|---|
| Source code | the repository (`server/`, `client/`, `scripts/`, `deploy/`) |
| Setup and run instructions | [README.md](README.md) |
| Architecture note | [ARCHITECTURE.md](ARCHITECTURE.md) |
| AI workflow note | [AI_WORKFLOW.md](AI_WORKFLOW.md) |
| This file | [SUBMISSION.md](SUBMISSION.md) |
| Walkthrough video link | [VIDEO_LINK.txt](VIDEO_LINK.txt) |
| Screenshots | [docs/screenshots/](docs/screenshots) |
| Scope, test plan, AI log | [SPEC.md](SPEC.md), [TEST.md](TEST.md), [AI_LOG.md](AI_LOG.md) |
| Sample upload files | [samples/](samples) |

## What works end to end

- **Documents:** create, rename, edit, reopen, delete (owner only; shared users see it disappear); *My documents* vs
  *Shared with me*.
- **Rich text:** bold, italic, underline, H1–H3, bulleted and numbered lists, undo/redo; formatting survives
  refresh and restarts.
- **Autosave:** one save in flight per tab, retry while offline, save on tab close, clear status text.
- **Version history:** last 10 versions, restore, undo a restore.
- **Upload:** `.txt` / `.md` → new formatted document; type, size and encoding errors shown clearly.
- **Sharing:** owner shares as *Can edit* or *Can view*, changes roles, revokes; viewers get a read-only page;
  every rule enforced on the server.
- **Robustness:** session guard across tabs, editor locks if access is revoked mid-edit, security headers.
- **Quality:** 61 automated tests + 6 stress checks; deploys run the tests first.

## What I intentionally deprioritized

| Cut | Why |
|---|---|
| Real-time co-editing / presence | CRDT or websocket sync is a large build; last-write-wins plus version history covers recovery |
| Comments / suggestion mode | Depth over breadth |
| Real authentication | The brief allows mocked users; time went into editing and sharing |
| `.docx` import, export to Markdown | NICE items; core quality first |
| Viewer "Can view history" option | Low priority; not needed to prove the role model |

## Known limitations

- **Simultaneous edits** to the same document by two people: the last save wins; the other's latest changes can be
  overwritten (history keeps a restore point at most a minute old).
- **One login per browser** (shared cookie). Other tabs are protected and offer "Continue as …".
- **Upload:** only `.txt` and `.md`, max 1 MB; Markdown links, images and tables become plain text.
- **Save-on-close** uses a keepalive request, which browsers cap at about 64 KB; larger documents rely on normal
  autosave having finished.
- **Version history** restores without a preview.
- Mocked login means anyone can pick any account; the demo is not for private data.

## Next steps (2–4 hours)

1. Export to Markdown.
2. `.docx` import through the same sanitizer.
3. Conflict warning: reject a save that's based on an outdated version and show what changed.
4. Version preview, and the viewer "Can view history" option.
5. Real authentication and Postgres if it moved beyond a demo.
