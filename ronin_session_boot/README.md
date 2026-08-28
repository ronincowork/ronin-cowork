# ronin_session_boot — what a NEW SESSION reads before anything else

**test_protocols:** ordinary dev work does not run BYOIN — not at a commit, not at a hand-in; the one full repository BYOIN is the lead's team promotion at `team → dev` — `docs/test-protocols.md` is the contract.

Named for booting a **session**, never the application: nothing here runs when Ronin
starts. It is read once, when a session is born.

**This half is stock** — it ships, and an upgrade replaces it wholesale. Your own half
lives in a store outside every repo: `ronin-store session_boot`. A file of yours with the
same name replaces ours whole; a new name sits beside it.

## The levels, and they add up

| | read by |
|---|---|
| `all/` | every session, always |
| `<service>_connected/` | only sessions launched with MCP on — a connected service makes and seeds its own signed level (gbrain's setup makes `gbrain_connected/`) |
| `root/<project_root>/` | only sessions working in that directory |
| `role/<session_role>/` | only sessions doing that kind of work — **re-delivered when the session_role changes** |
| `team_role/<team_role>/` | only sessions born onto a team whose roster names that team_role — the team's build brief, read once (R35: a later join is not re-briefed) |
| `assignment/` | only sessions whose launch resolved repo desks — the desk contract, `DESK_CONTRACT.md`. A launch given no desk reads nothing here |

A session cutting `CutCode` on a `development` team in `ronin_cowork` reads all of its
levels. Nothing overrides anything — *where* the work happens, *what* it is doing now and
*whose team* it is on are independent questions.

**A blank axis omits only its own level.** A launch with no session_role reads no role
level, a rōnin launch reads no team_role level, and everything else exactly as before.
Root never omits its level, because root is required.

**Stock has no `root/` and no connected folder, and cannot.** The session_roles ship, so
we know their names; your project roots are yours alone, and a connected level is the
seeding service's own act — an empty one nothing seeded would claim a connection that does
not exist.

## Files or links

A symlink into a repo is the normal case — it is how a document that already lives
somewhere gets on the shelf without being copied and without drifting from the original.
A link whose target has gone simply stops appearing; nothing goes stale, because nothing
is written down.

**This README is not read by anyone.** Only `all/`, `assignment/`, `root/*`, `role/*` and
`team_role/*` are scanned, one level deep, so an explainer at the shelf root is never
handed to a session.

## What ships

Four universal readings, screened in one at a time:

- `all/KOTOBA_GLOSSARY.md` — the house vocabulary, so every session means the same things
  by the same words.
- `all/SHELVES.md` — the map of where everything is, and what is on each shelf.
- `all/REQUIRED_ABILITIES.md` — the abilities every session uses: session macros, other
  sessions, measuring this machine.
- `SESSION_MACROS.md` is a template, not read directly. At birth Ronin fills its active
  macro section from the resolved `MACROS.md` catalog (`preview: yes`) and hands the
  generated document to every assisted session.

See `docs/session-boot.md`.
