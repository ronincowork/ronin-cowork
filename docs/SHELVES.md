# SHELVES — where everything is, and what is on each shelf

You are an agent working in a Ronin tile. This is the map: what shelves exist, what each
one answers, and **what is actually on it**. The rosters below are the shipped stock;
the_owner's own store shadows stock file-for-file and can add books no roster here can
know, so **the definitive listing is always the `ls`, never this page** — each shelf's
section says the exact command. If this page and the directory disagree, the directory
is right.

Read the book you need. Do not read them all.

## The five shelves

| Shelf | Answers | Where |
|---|---|---|
| `ronin_session_boot/` | **what you read first** — handed to you at birth, so you have already met it | `docs/session-boot.md` |
| `ronin_catalogs/` | **what you can do** — macros, actions, tools, session jobs, project roots | `ronin_catalogs/README.md` |
| `ronin_library/` | **how a step is done** — reference an action names; a compile inlines it, so it arrives without you fetching it | `ronin_library/README.md` |
| `ronin_sops/` | **how this house goes about a domain** — you go and look when a situation calls for it | `ronin_sops/README.md` |
| `ronin_bin/` | **what you run** — the tools you type by bare name | `ronin_bin/README.md` |

Stock lives in this repo; the_owner's own copies live in a store and shadow stock
file-for-file. `bin/ronin-store --all` prints every store on this machine, resolved.
**Never spell a store path by hand** — ask (`ronin-store sops`, `ronin-store library`).

## The SOP shelf — how the house does a domain

`ls ronin_sops/ "$(bin/ronin-store sops)"` — the live truth, yours included. Stock today:

| Book | The situation that fetches it |
|---|---|
| `accounts.md` | who this install is for, and what it runs on |
| `codex.md` | the account that pays for a Ronin coding session |
| `data.md` | connecting to a data source, and choosing which one |
| `deploy.md` | getting a thing running where other people can reach it |
| `gbrain.md` | working the brain, when this machine has one |
| `github.md` | how we go about source control |
| `remote_machine_admin.md` | setting the machine up, checking what is still in place, and repairing it — the chores, and what each one grants |
| `remote_machine_health.md` | the box is slow, or something died — memory, swap, the kernel. Not the sessions on it |
| `install.md` | is this install actually what it claims to be |
| `ronin_methodology.md` | how work moves through sessions, shared artifacts, `dev`, and the final gate |
| `secrets.md` | keys, tokens, and the one mistake that cannot be undone |
| `skins.md` | changing how Ronin looks |
| `syncthing.md` | the same folders on every machine — start here when someone cannot find a file |
| `tmux_server.md` | the session engine — the list disagrees with the roster, sessions vanished at once, or a tmux command is about to be typed |
| `vpn.md` | reaching your own Ronin from your other devices |

An SOP is fetched by a situation, relayed to a person, and never pushed at a session
that did not ask. The_owner's copy of any name wins whole. `ronin_sops/README.md`.

## The catalogs — what you can do

`ls ronin_catalogs/ "$(bin/ronin-store catalogs)"`. Stock today: `MACROS.md` (the
`+name:` workflows the_owner invokes), `ACTIONS.md` (the cataloged procedures macros are
made of), `TOOLS.md` (the executables that implement actions, with usage), `role_families/`
(who a session is) and `session_roles/` (what it is doing — one file each),
`PROJECT_ROOTS.md` (the launch table),
`MIKA_MACROS.md` (the house assistant's jobs), `SKINS.md` (the look, tokens only),
`desk_profiles/` (your standing defaults for the surfaces you work at — skin, lexicon,
campaign kind, RIREKI view, Team page order; one file each) and `lexicons/` (the words a
surface uses — one file each, a language mechanically). Extending any of it starts at
`ronin_catalogs/README.md` — the action exists before the macro, the tool after the action.

## The library — how a step is done

`ls ronin_library/ "$(bin/ronin-store library)"`. Stock today: `documents.md` (where a
development document lives, and for how long). You rarely fetch these yourself — a
compile inlines the page the action names.

## The boot shelf — what you were handed at birth

Universal (`all/` + one generated): `SHELVES.md` (this map), `KOTOBA_GLOSSARY.md` (the
vocabulary), `REQUIRED_ABILITIES.md` (the abilities every session uses — read it before
improvising anything), `SESSION_MACROS.md` (the live `+macro:` roster, generated at your
birth). Scoped levels reach only the sessions they apply to: `<service>_connected/`
(e.g. `gbrain_connected/` — a connected service seeds its own reading, read only by
sessions launched with MCP on), `root/<project_root>/`, `role/<session_role>/`,
`task/<session_role>/`.
`docs/session-boot.md`.

## The tools — what you run

`ls ronin_bin/`. Every tool's usage, verdicts, and exit codes are rows in
`ronin_catalogs/TOOLS.md` — read the row, not the source. Prefer the tool over
performing its action by hand: it encodes the safety steps.

## The axes

Every session is fixed by two things, plus the team it may be born onto:
**`project_root`** — where the work happens, and the one that is REQUIRED
(`ronin_catalogs/PROJECT_ROOTS.md`) × **`session_role`** — what it is doing right now,
and yours to change as the work moves (`ronin_catalogs/session_roles/`). A TEAM adds
context on top — its roster's defaults and its `team_role` reading — and none is a
rōnin, which is ordinary (R35).

The session_role may be blank, and blank is a real answer rather than a gap.

## The short routing rules

- **A `+name:` lands in your pane** → compile it (`tejun <name>`), execute, report.
  Never a remembered workflow. `REQUIRED_ABILITIES.md` has the full rule.
- **Anything about another session** → dial first (`@ronin-control`), and never flip
  it. `REQUIRED_ABILITIES.md`, then `docs/session-control-dials.md`.
- **You need a process and no macro named one** → the SOP roster above; the situation
  picks the book.
- **A fact about this machine** → measured, never remembered: `tejun-survey`,
  `tejun-account`, `bin/ronin-store --all`.
