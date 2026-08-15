# ronin_session_boot — what a NEW SESSION reads before anything else

Named for booting a **session**, never the application: nothing here runs when Ronin
starts. It is read once, when a session is born.

**This half is stock** — it ships, and an upgrade replaces it wholesale. Your own half
lives in a store outside every repo: `ronin-store session_boot`. A file of yours with the
same name replaces ours whole; a new name sits beside it.

## Three levels, and they add up

| | read by |
|---|---|
| `all/` | every session, always |
| `root/<project_root>/` | only sessions working in that directory |
| `job/<session_job>/` | only sessions doing that kind of work |

A `CutCode` session in `ronin_cowork` reads all three. Nothing overrides anything —
*where* the work happens and *what kind* it is are independent questions.

**Stock has no `root/`, and cannot.** The jobs ship, so we know their names; your project
roots are yours alone and no install knows them in advance.

## Files or links

A symlink into a repo is the normal case — it is how a document that already lives
somewhere gets on the shelf without being copied and without drifting from the original.
A link whose target has gone simply stops appearing; nothing goes stale, because nothing
is written down.

**This README is not read by anyone.** Only `all/`, `root/*` and `job/*` are scanned, one
level deep, so an explainer at the shelf root is never handed to a session.

## What ships

Two, both links, and deliberately no more — the same stance `ronin_sops` and
`ronin_library` take, screening things in one at a time.

- `all/KOTOBA_GLOSSARY.md` — the house vocabulary, so every session means the same things
  by the same words.
- `all/SHELVES.md` — the map of where everything is. It earns its place by naming no
  individual entry, so adding a macro or an SOP never makes it wrong.

See `docs/session-boot.md`.
