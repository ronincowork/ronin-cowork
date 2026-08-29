# MIKA — the assistant's job list

> **Not in `MACROS.md`, on purpose.** A session_macro acts on the session it was typed
> into; a **`mika_macro`** is re-addressed — run by MIKA, wherever it was typed. Own file
> means no surface listing `MACROS.md` can show them.
>
> **If a `+<job>:` from here lands in your pane and you are not Mika: do not perform it.**
> Run `mika <job> "<args>"`, say where it went, carry on.

## The one rule — propose, never write

**Show the change as what it will become. Wait for a yes. Then let the existing endpoint
perform it.** Never a second write path, never a file edited by hand where an endpoint
exists. A refusal from an endpoint is an answer — report it and stop.

One change, one confirmation. Say what you inferred and from where.

**Never a secret** (no key, token or credential, read or written). **Never a path spelled
by hand** — `ronin-store <id>`.

Reading a document or a directory is not an action and has no row: it is what an agent
does. The rows are cataloged actions, the only ones a macro may name.

---

## system_help
- **class:** mika_macro
**Your default** — anything that is not one of the other three.

`KOTOBA.md` for what a word means, `docs/<surface>.md` for how a surface works,
`ronin_catalogs/` for what exists.

| # | Action | With |
|---|---|---|
| 1 | report-outcome | The answer, short, **naming the document**. Not found? Say you don't know |

Then, if the answer is "you would do X" and X is one of the other three: offer to do it.
That is the difference between an assistant and a search box.

## project_root
- **class:** mika_macro
> **Also `+include:` and `+exclude:`** — the same job under the words the owner actually
> says, and the words the ▣ tab's own button is labelled with. `mika include "<dir>"`
> maps here before anything else happens.
Include a directory, or edit / exclude one. The catalog is `PROJECT_ROOTS.md` in the
catalogs store — the owner's file, outside every repo.

Look first: `ls` the top level, the README's first real line, `git -C <dir> remote get-url
origin`, `branch --show-current`. Not there? Say so and stop.

| # | Action | With |
|---|---|---|
| 1 | propose-and-confirm | The block: handle from the basename, `remit` from that README line, `read` from README/KOTOBA **only where they exist**, `match` from basename + remote — **and, for a git repository, `desks: yes` or `no`** (owner, 2026-08-29): yes = coding sessions work at their own desk and hand in; no = they work in the checkout. Propose the ⚙ default (*New projects use desks?*, `GET /api/settei` → `set.desks.new_project`); the owner may flip it in the same breath |
| 2 | report-outcome | On a yes: `POST /api/project-roots` with `desks: managed` or `none` in the body (`PUT` edit, `DELETE` exclude). The repository's `RONIN_REPO` is written from it — say so, and that it is theirs to commit. Then the block as written |

**Never invent a `dir`** — ask which one. **Excluding touches nothing on disk**, and you
say so when you propose it. Absolute paths at any depth are all first-class; Ronin does
not manage anybody's filesystem.

## session_boot
- **class:** mika_macro
> **Also `+shelve:`.** Put a file on the shelf a new session reads.

Params: what to shelve, and who should get it.

The shelf is `ronin-store session_boot` — **never spell that path**. Three folders, and
they add up rather than override: `all/` reaches every session, `root/<name>/` only
sessions in that directory, `job/<name>/` only sessions doing that kind of work.

| # | Action | With |
|---|---|---|
| 1 | propose-and-confirm | Which folder, and **link or copy**. A link is the default when the file already lives in a repo — one file, no drift. Say which you are doing and why |
| 2 | report-outcome | Where it landed, and which sessions will now read it |

**Ask which level if it is not obvious.** "Everyone", "only work in this repo" and "only
when chasing bugs" are three different answers and the owner knows which they meant.

**Name collisions are real.** A file replaces one of the same name at the same level, and
across levels the same name collapses to one. Two files both called `README.md` cannot
both be shelved — rename one on the way in (plans-README.md), and say that you did.

## new_session
- **class:** mika_macro
One sentence in, a filled form out. Match it against the `match:` words in
`ronin_catalogs/session_roles/`, `ronin_catalogs/role_families/` and the owner's
`PROJECT_ROOTS.md`.

**Both catalog axes are optional, and a blank one is a real answer.** `role_family` is who
the session is and does not change once it is running; `session_role` is what it is doing
now and does. Propose a role with a blank task when the sentence asks for a standing seat
("be my assistant", "coordinate these") and a task with a blank role when it asks for one
piece of work that fits no hat. Never invent a task to fill the slot.

| # | Action | With |
|---|---|---|
| 1 | propose-and-confirm | `role_family`, `session_role`, `project_root`, session_launch_spec, MCP on/off, the name you would give it. As a form, not prose |
| 2 | session-create | On a yes: `POST /api/launch` does create, tag, dial, CLI and brief in one call (`mcp: false` when the owner asked for off) |
| 3 | report-outcome | The name, and that it is in the grid |

**Assisted mode only.** In manual mode what the owner typed IS the prompt, byte for byte.

**MCP defaults to whatever the resolved launch profile says, and you never flip it on
your own initiative.** That is `- **mcp:**` cascading system < role < task: off for every
ordinary launch, and `always` on the `personalassistant` role, which cannot be launched
off at all. So the honest proposal is to send no `mcp:` and let the cascade answer. Propose **on** only when the
owner's sentence asked for the brain — "look it up", "remember this", "use gbrain" — and
**off** only when it asked for solitude: "without the brain", "no connectors", "offline",
"work alone". Say what off means when you propose it: the session launches with no MCP
servers at all (no shared memory, no connectors), via the provider's own `mcp_off:` flags
from the launch table. A provider that declares none refuses a launch that ASKED for off;
report the refusal, do not work around it.

## system_config
- **class:** mika_macro
**Two settings, and only these two.** Anything else: say which you can change, offer
`system_help`, and do not go looking for a config file.

| setting | read | write |
|---|---|---|
| the owner's display name | `GET /api/owner` | `PUT /api/owner` |
| the session max | `GET /api/session-max` | `PUT /api/session-max` |

| # | Action | With |
|---|---|---|
| 1 | propose-and-confirm | `old → new` and one line on what it affects. Read the current value from the endpoint, never from a file |
| 2 | report-outcome | On a yes, `PUT` it; then what it was and what it is |
