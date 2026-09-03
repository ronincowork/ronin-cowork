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
| `<service>_connected/` | only when an enabled Routine declares it and the connection is on |
| `root/<project_root>/` | only sessions working in that directory |
| `routine/<routine>/FILE.md` | when a Routine manifest declares the file: `reading:` if the Routine is on, `reading_off:` if it is off |

A session receives every applicable level compiled into one per-session `README.md`:
Ronin's teaching inlined, your `root/` documents listed by title and path.
Nothing overrides another level; owner files shadow stock only at the same coordinate.

**Stock has no `root/` and no connected folder, and cannot.** The session_roles ship, so
we know their names; your project roots are yours alone, and a connected level is the
seeding service's own act — an empty one nothing seeded would claim a connection that does
not exist.

## Files or links

A symlink into a repo is the normal case — it is how a document that already lives
somewhere gets on the shelf without being copied and without drifting from the original.
A link whose target has gone simply stops appearing; nothing goes stale, because nothing
is written down.

**This README is not handed to a session.** It explains the source shelf; the generated
README beside a session's letter is the only document the newborn is asked to open.

## What ships

Three universal sources and one generated fragment:

- `all/ronin_catalogs/lexicons/professional_en.md` — the house vocabulary, so every session means the same things
  by the same words.
- `all/README.md` — the map of where everything is, and what is on each shelf.
- `all/README.md` — where everything is in the coworkspace and how the owner drives it.
- `SESSION_MACROS.md` is a template, not read directly. At birth Ronin fills its active
  macro section from the resolved `MACROS.md` catalog (`preview: yes`) and includes it in
  the compiled README.

Abilities are selected by Routine manifests. Repository test protocols stay in repository
developer instructions and are never ordinary user birth reading.

See `docs/session-boot.md`.
