# ronin_session_boot — what a NEW SESSION reads before anything else

Named for booting a **session**, never the application: nothing here runs when Ronin
starts. It is read once, when a session is born.

**This half is stock** — it ships, and an upgrade replaces it wholesale. Your own half
lives in a store outside every repo: `ronin-store session_boot`. A file of yours with the
same name replaces ours whole; a new name sits beside it.

## The levels, and they add up

| | read by |
|---|---|
| `all/` | every session, always |
| `<service>_connected/` | only when a chosen behaviour declares it and the connection is on |
| `root/<project_root>/` | only sessions working in that directory |
| `routine/<name>/FILE.md` | when an installation's or a behaviour's definition declares the file: `reading:` if it is on, `reading_off:` if it is off |
| `ronin_catalogs/capabilities/<bundle>.md` | not a shelf: the source of the generated tool overview, one entry per bundle whose `requires:` hold for this birth |

A session receives every applicable level compiled into one per-session `AGENT_BIRTH_BRIEF.md`:
Ronin's teaching inlined, your `root/` documents listed by title and path.
Nothing overrides another level; owner files shadow stock only at the same coordinate.

**Stock has no `root/` and no connected folder, and cannot.** Your project roots are yours alone, and a connected level is the
seeding service's own act — an empty one nothing seeded would claim a connection that does
not exist.

## Files or links

A symlink into a repo is the normal case — it is how a document that already lives
somewhere gets on the shelf without being copied and without drifting from the original.
A link whose target has gone simply stops appearing; nothing goes stale, because nothing
is written down.

**This README is not handed to a session.** It explains the source shelf; the generated
birth brief beside a session's letter is the only document the newborn is asked to open.

## What ships

Two universal background sources and two generated fragments — the tool overview and the
glossary pointer `WORDS.md` — compiled in reading order and held to a
one-read budget by
`tests/session-boot.test.ts` (a 121 KB packet was born on 2026-09-03 when a UI string
table was shelved as vocabulary; nothing objected, because no test read the real shelf):

- `all/RONIN_UTILITY.md` — where everything is in the coworkspace and how the owner drives it.
- `all/KOTOBA_GLOSSARY.md` — the house names and the plain word to say for each; the packet carries a pointer to it, and `ronin-help <word>`
  prints it.
- `CAPABILITIES.md` has no template. At birth Ronin renders it from the capability documents
  the launch resolver selected (`ronin_catalogs/capabilities/`) — the priority tools that
  exist on this box, `--help`, and each full document's path — and includes it in the
  compiled birth brief.

Cowork-agent working guidance is applied from the Behavior floor. Other guidance is selected
by conditional and selected Behavior definitions. Repository test protocols stay in repository
developer instructions and are never ordinary user birth reading.

See `docs/architecture/session-boot.md`.
