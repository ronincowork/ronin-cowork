# SHELVES — where everything is

The map of Ronin's shelves: what each one answers and how to list it. Stock ships in the
repo; the owner's store shadows stock file-for-file and can add books, so **the `ls` is
the truth and this page is the index**. Read the book you need, not the shelf.

| Shelf | Answers | List it |
|---|---|---|
| `ronin_session_boot/` | what you read first — this packet | already in your hands |
| `ronin_catalogs/` | what you can do — `MACROS.md`, `ACTIONS.md`, `TOOLS.md`, `PROJECT_ROOTS.md`, routines, templates, desk profiles, lexicons | `ls ronin_catalogs/ "$(bin/ronin-store catalogs)"` |
| `ronin_library/` | how a step is done — a compile inlines the page an action names | `ls ronin_library/ "$(bin/ronin-store library)"` |
| `ronin_sops/` | how this house goes about a domain — fetched when a situation calls for it | `ls ronin_sops/ "$(bin/ronin-store sops)"` |
| `ways/` | approaches to work — the owner hands you one at launch; you do not go shopping | `ls ways/` |
| `ronin_bin/` | what you run — every tool's usage and verdicts are rows in `ronin_catalogs/TOOLS.md`; prefer the tool over doing its job by hand | `ls ronin_bin/` |

`bin/ronin-store --all` prints every store on this machine. Never spell a store path by hand.

## The SOP shelf — the situation picks the book

| Book | Fetch it when |
|---|---|
| `accounts.md` | who this install is for, and what it runs on |
| `codebase_team.md` | one agent lands on a codebase and stands up the team around it |
| `codex.md` | the account that pays for a coding session |
| `data.md` | connecting to a data source |
| `deploy.md` | getting a thing running where other people can reach it |
| `gbrain.md` | working the brain, when this machine has one |
| `github.md` | source control |
| `install.md` | is this install what it claims to be |
| `remote_machine_admin.md` | setting the machine up, checking it, repairing it |
| `remote_machine_health.md` | the box is slow or something died — memory, swap, kernel |
| `ronin_methodology.md` | how work moves through sessions and shared artifacts |
| `secrets.md` | keys and tokens |
| `skins.md` | changing how Ronin looks |
| `syncthing.md` | the same folders on every machine; someone cannot find a file |
| `teams.md` | leading or joining a team |
| `tmux_server.md` | the session engine — before any tmux command is typed |
| `vpn.md` | reaching this Ronin from other devices |

## Routing

- **`+name:` lands in your tile** → compile it (`tejun <name>`), execute, report. Never a remembered workflow.
- **Anything about another session** → its Control dial first (`@ronin-control`); never flip it.
- **A process with no macro** → the SOP above.
- **A fact about this machine** → measure it: `tejun-survey`, `tejun-account`, `bin/ronin-store --all`.
