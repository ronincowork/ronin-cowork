# SESSION BOOT — what a new session reads before anything else

**Named for booting a session, never the application.** Nothing here runs when Ronin
starts. It is read once, when a session is born.

The birth compiler selects the applicable shelf files, removes duplicate sources, and
writes one `README.md` into the newborn's per-session directory. The brief points to that
one document, and the same README appears automatically in the Agent's tracked Docs. The
page opens with its own contents list. Ronin's teaching — `all/`, each system installation's page, the
generated tool overview — is inlined; the owner's project-root documents,
selected behaviour books and explicit seeds are listed by title and path under **On your
shelf**, because pasting a project's whole catalog is what made the packet unreadable.

| put it in | and it reaches |
|---|---|
| `all/` | every session, always |
| `<service>_connected/` (e.g. `gbrain_connected/`) | when a selected feature declares that legacy-named level; selection supplies teaching, not a runtime connection claim |
| `root/<project_root>/` | only sessions working in that directory |
| `routine/<name>/FILE.md` | only when an installation's or a feature's definition names that file — `reading:` when it is on, `reading_off:` when it is off (the page that says what the owner is working without, and where the switch is) |
| `ronin_catalogs/capabilities/<bundle>.md` | not a shelf level but the source of the generated **tool overview**: each capability bundle whose `requires:` predicates hold for this birth is rendered as one entry — title, blurb, the projected priority tools, help route, and the path of the full document (`ronin_catalogs/capabilities/README.md`) |

The levels are **additive, not a hierarchy**. Root, installations and behaviours are
independent launch facts; their files compile into one birth README
and nothing overrides another level. Work-specific reading uses the separate
`behaviours` choice: each behaviour that is on joins that same birth reading once.
There is no mutable role level and no live re-delivery observer.

A legacy-named connected directory is not broadcast merely because it exists; a selected
feature's definition must name it. Its inclusion teaches the feature and does not assert
that an external connection is currently healthy.

## The two halves

The same split `ronin_catalogs/behaviours` and `ronin_library` already use — this is the third instance of
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
root levels select their live directory contents; installation and feature definitions select exact shelf
coordinates. A removed file simply stops appearing. `CAPABILITIES.md` — the tool overview —
is rendered from the selected capability documents at that same instant.

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
line, the receipt — is [`docs/architecture/birth-packet.md`](birth-packet.md).

**The packet says where it ends, and the brief says how big it is.** The compiled README's
last line is `— end of packet for <session> —`. The brief's `Read first:` sentence names the
path, the line count, the size, that one read delivers it, and that line; when a packet is
over the one-read budget the sentence says so and asks for it in parts, in order, until that
line. The birth receipt carries a `packet` block — path, bytes, lines, sections, terminator,
`over_budget` — so the record says what left; the ACK rule asks the newborn to quote the
terminator, so the tape says what arrived. Measured 2026-09-04: Codex delivers ~10k tokens
per shell read, Claude Code 30,000 chars per Bash call and 25,000 tokens per Read, and both
open a file in a first window of ~250 lines — which is why the contracts come first.

Two universal background files and two generated fragments, compiled in reading order —
then the tool map and glossary — and held to the
one-read budget (`PACKET_BUDGET` in `src/birth-readme.ts`) by `tests/session-boot.test.ts`
on the real shelf:

- **`all/RONIN_UTILITY.md`** — the coworkspace for an Agent: the pages, the three
  workbenches and their surfaces, the tile head's buttons, Locked and Unlocked, copy and paste.
- **`all/KOTOBA_GLOSSARY.md`** — the house names (TEGAMI, RIREKI, the wipeboard …) and the
  plain word to say for each, so no Japanese leaks from the tools to the person. Rendered at
  birth with the owner's desk words (`renderGlossary`; `docs/products/kokugo.md` §8) and compiled
  **last**: reference, not rules.
- **`CAPABILITIES.md`** — no template: rendered whole at birth by `renderCapabilitiesOverview`
  from the capability documents the launch resolver selected (`src/capabilities.ts`). One
  entry per selected bundle: its title, blurb, the priority tools that exist on this box with
  their authority, the `--help` route, and the path of the full document. A tool the box
  lacks is never advertised. Knowledge without an actual tool belongs in an installation,
  Behavior, or explanatory document rather than a capability.
  The generated copy is disposable data as an internal compiler fragment.

General Cowork Agent guidance belongs to the Behavior floor (`floor/cowork-agent.md` and
`floor/mandates.md`). System teaching belongs to an installation (Ronin Services) or to a
feature (Ronin Host, gbrain); see
[`docs/architecture/installations.md`](installations.md). Test
protocols are repository-contributor instructions and never enter user birth reading.
The compiled result lives as `README.md` beside that session's letter and birth receipt.

A shelf that arrives full is a shelf nobody curates.

## It is per-machine

The shelf is `user` scope: your files, surviving an upgrade and an uninstall. **That is not
the same as existing on every machine.** It lives outside every repo, so git does not carry
it, and unless you sync `ronin-store session_boot` yourself, a shelf built on one box is not
on another.
