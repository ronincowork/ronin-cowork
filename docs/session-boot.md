# SESSION BOOT — what a new session reads before anything else

**Named for booting a session, never the application.** Nothing here runs when Ronin
starts. It is read once, when a session is born.

The birth compiler selects the applicable shelf files, removes duplicate sources, and
writes one `README.md` into the newborn's per-session directory. The brief points to that
one document, and the same README appears automatically in the Agent's tracked Docs. The
page opens with its own contents list. Ronin's teaching — `all/`, Routine reading, the
desk contract, the generated macro roster — is inlined; the owner's project-root documents,
selected behaviour books and explicit seeds are listed by title and path under **On your
shelf**, because pasting a project's whole catalog is what made the packet unreadable.

| put it in | and it reaches |
|---|---|
| `all/` | every session, always |
| `<service>_connected/` (e.g. `gbrain_connected/`) | only when an enabled Routine declares that level and its connection is on |
| `root/<project_root>/` | only sessions working in that directory |
| `routine/<routine>/FILE.md` | only when an effective Routine's manifest explicitly names that file — `reading:` when the Routine is on, `reading_off:` when it is off (the page that says what the owner is working without, and where the switch is) |

The levels are **additive, not a hierarchy**. Root, connection and effective Routines are
independent launch facts; their files compile into one birth README
and nothing overrides another level. Work-specific reading uses the separate
`behaviours` choice: each selected `ways:<book>` joins that same birth reading once.
There is no mutable role level and no live re-delivery observer.

The connected level makes the launch decision govern both halves of a connection: off
means neither tools nor connection reading. A connected directory is not broadcast merely
because it exists; an enabled Routine manifest must select it.

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
goes stale.

## Resolution

The shelf resolves live files rather than stored absolute paths. Universal and
root levels select their live directory contents; Routine manifests select exact shelf
coordinates. A removed file simply stops appearing. `SESSION_MACROS.md` is rebuilt from
the live catalog at that same instant.

## Name collisions are real

The shelf is keyed by filename **within one level**. An owner file replaces stock at that
same coordinate. Two different levels may honestly contain `README.md`; both become
sections in the compiled birth README. If two coordinates resolve to the same symlink
target, the compiler includes that source once.

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

The contract for the compiled document itself — the one-read budget, the order, the closing
line, the receipt — is [`docs/birth-packet.md`](birth-packet.md).

**The packet says where it ends, and the brief says how big it is.** The compiled README's
last line is `— end of packet for <session> —`. The brief's `Read first:` sentence names the
path, the line count, the size, that one read delivers it, and that line; when a packet is
over the one-read budget the sentence says so and asks for it in parts, in order, until that
line. The birth receipt carries a `packet` block — path, bytes, lines, sections, terminator,
`over_budget` — so the record says what left; the ACK rule asks the newborn to quote the
terminator, so the tape says what arrived. Measured 2026-09-04: Codex delivers ~10k tokens
per shell read, Claude Code 30,000 chars per Bash call and 25,000 tokens per Read, and both
open a file in a first window of ~250 lines — which is why the contracts come first.

Three universal shelf files and two generated fragments, compiled in reading order —
Routine contracts first, the maps, the macro roster, the glossary last — and held to the
one-read budget (`PACKET_BUDGET` in `src/birth-readme.ts`) by `tests/session-boot.test.ts`
on the real shelf:

- **`all/README.md`** — the map of where everything is **and what is on each shelf**. Each roster
  sits beside the `ls` that resolves the live truth, stores included, and the directory
  wins whenever the two disagree.
- **`all/RONIN_UTILITY.md`** — the coworkspace for an Agent: the pages, the three
  workbenches and their surfaces, the tile head's buttons, Locked and Unlocked, copy and paste.
- **`all/KOTOBA_GLOSSARY.md`** — the house names (TEGAMI, TEJUN, the wipeboard …) and the
  plain word to say for each, so no Japanese leaks from the tools to the person. Rendered at
  birth with the owner's desk words (`renderGlossary`; `docs/kokugo.md` §8) and compiled
  **last**: reference, not rules.
- **`SESSION_MACROS.md`** — a stock template whose active section is generated at birth
  from the resolved `MACROS.md` catalog. The entries marked `preview: yes` are both what the
  tile button shows and what the new session reads. The generated copy is disposable data
  as an internal compiler fragment; the template is not handed over directly.

Abilities belong to the Routine that equips them: Base, Worktrees, Services or Host. Test
protocols are repository-contributor instructions and never enter user birth reading.
The compiled result lives as `README.md` beside that session's letter and birth receipt.

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
