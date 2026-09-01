# SESSION BOOT — what a new session reads before anything else

**Named for booting a session, never the application.** Nothing here runs when Ronin
starts. It is read once, when a session is born.

Put a file on the shelf and new sessions read it. That is the whole feature.

| put it in | and it reaches |
|---|---|
| `all/` | every session, always |
| `<service>_connected/` (e.g. `gbrain_connected/`) | only sessions launched with MCP on — how a connected session learns what it is connected to, signed by the service that seeded it |
| `root/<project_root>/` | only sessions working in that directory |
| `routine/<routine>/` | only sessions born with that effective Routine |
| `assignment/` | only sessions whose launch resolved repo desks — the desk contract (`DESK_CONTRACT.md`: commit → hand-in → team promotion → Git push). A launch given no desk reads nothing here; the level is a fact about the launch, not an axis a static shelf could guess |

The levels are **additive, not a hierarchy**. Root, connection, effective Routines and
desk assignment are independent launch facts; their files compile into one birth reading
and nothing overrides another level. Work-specific reading uses the separate
`behaviours` choice: each selected `ways:<book>` joins that same birth reading once.
There is no mutable role level and no live re-delivery observer.

The connected level makes the launch toggle govern both halves of a connection (owner's
ruling, 2026-08-17): a session launched with MCP off gets neither the tools nor the
reading list about them. Cowork ships **no** connected folder and matches the pattern
only — any `<service>_connected/` directory on the shelf is read by connected sessions.
A connected service makes and seeds its own (gbrain's setup makes `gbrain_connected/`),
so the name says whose reading it is (owner's ruling, 2026-08-20) while the free build
names no vendor. An empty connected folder nothing seeded would be a claim about a
connection that does not exist, which is why Ronin never pre-creates one.

## The two halves

The same split `ronin_sops` and `ronin_library` already use — this is the third instance of
a pattern, not a new idea.

| | where | what happens to it |
|---|---|---|
| **stock** | `ronin_session_boot/` in the install | ships; an upgrade replaces it wholesale |
| **yours** | `ronin-store session_boot` | survives upgrade **and** uninstall |

**Yours beats stock, file for file.** A file of yours named `SHELVES.md` in `all/` replaces
ours whole; a new name sits beside it.

**Stock has no per-root folder, and cannot.** The session jobs ship, so we know their names and can
put files under them. Your project roots are yours alone, and no install knows them in
advance.

## Files or links

**A symlink is the normal case.** It is how a document that already lives in a repo gets on
the shelf without being copied and without drifting from the original:

```bash
ln -s ~/code/thing/ARCHITECTURE.md "$(ronin-store session_boot)/root/thing/"
```

A link whose target has gone simply stops appearing. Nothing needs cleaning up, and nothing
goes stale — which is the entire point, and the reason `read:` is gone.

## What replaced `read:`, and why

A `project_root` used to carry `read:` — a comma-separated list of literal file paths,
pasted into every brief for that root. Four things were wrong with it, and only the first
is obvious:

- **a path goes stale in silence.** Delete the file and every future session in that root is
  told to read something that is not there. Nothing says so;
- **it lived in a catalog**, so changing what a session reads meant editing a catalog line
  rather than putting a file somewhere;
- **there was exactly one level.** Nothing could apply to every session, or to every session
  doing a particular kind of work;
- **the owner had nowhere of their own** to add to it.

A shelf answers all four by holding *files* rather than *names of files*. The brief is a
directory listing taken at the instant of the launch, so a removed shelf file simply stops
appearing. The one generated reading, `SESSION_MACROS.md`, is rebuilt from the live catalog
at that same instant rather than maintained as a second list.

`read:` is deleted, not deprecated. Existing entries were converted to links on their
root's shelf.

## Name collisions are real

The shelf is keyed by filename. A file replaces one of the same name at the same level —
that is the shadow, and it is deliberate. Across levels the same name also collapses to
one.

So **two files both called `README.md` cannot both be shelved.** Rename one on the way in
(plans-README.md). Mika does this and says that she did.

## Where the directories come from

Every other user store is created by whatever first *writes* to it — the catalogs store
when you include a project root, the config store when you save a setting. **A read-only shelf is never
created by that rule**, because nothing ever writes to it, and an empty shelf you cannot
find is a shelf nobody uses.

So Ronin makes it the first time it looks: an idempotent `mkdir` on the read path, plus a
`root/<name>/` folder for every project root in the catalog, refreshed at every launch.
Excluding a root leaves its folder alone — it holds your files.

A failure to create is swallowed. **A session must never fail to launch because a directory
could not be made.**

## What ships

Three universal shelf files and one generated reading:

- **`all/KOTOBA_GLOSSARY.md`** — the house vocabulary, so every session means the same
  things by the same words.
- **`all/SHELVES.md`** — the map of where everything is **and what is on each shelf**
  (owner's ruling, 2026-08-20: a map naming zero books teaches nothing). Each roster
  sits beside the `ls` that resolves the live truth, stores included, and the directory
  wins whenever the two disagree.
- **`all/REQUIRED_ABILITIES.md`** — the abilities every session uses whatever its root
  or job, organized by topic: session macros, other sessions (the dial, reading one
  through RIREKI's tape, messaging one through `tejun-send`, and the absolute routing
  split between `forkit`/“fork it”/“new session” (visible Ronin session) and “spawn an
  agent” (internal sub-agent)), and measuring this machine. These are capabilities a
  session cannot search for without already knowing their names, which is why they are taught rather
  than shelved deeper. New universal topics join this file as sections; a topic splits
  out only when its section grows past teaching into procedure.
- **`SESSION_MACROS.md`** — a stock template whose active section is generated at birth
  from the resolved `MACROS.md` catalog. The entries marked `preview: yes` are both what the
  tile button shows and what the new session reads. The generated copy is disposable data
  at `ronin-store session_boot_cache`; the template is not handed over directly.

A shelf that arrives full is a shelf nobody curates.

## Asking Mika

*"put this on the shelf for ronin_cowork"* → `+session_boot:` (or `+shelve:`). She links or
copies it into the right folder, having shown you what she is about to do. If which level
you meant is not obvious, she asks — "everyone", "only in this repo" and "only when chasing
bugs" are three different answers.

## It is per-machine

The shelf is `user` scope: your files, surviving an upgrade and an uninstall. **That is not
the same as existing on every machine.** It lives outside every repo, so git does not carry
it, and unless you sync `ronin-store session_boot` yourself, a shelf built on one box is not
on another.
