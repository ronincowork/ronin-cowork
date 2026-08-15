# SHELVES — where everything is

You are an agent working in a Ronin tile. This is the map: what shelves exist, what each
one answers, and where to look. It names **no individual entry**, so it does not go stale
when one is added — go to the shelf and read it.

Read the shelf you need. Do not read them all.

## The five shelves

| Shelf | Answers | Where |
|---|---|---|
| `ronin_session_boot/` | **what you read first** — handed to you at birth, so you have already met it | `docs/session-boot.md` |
| `ronin_catalogs/` | **what you can do** — macros, actions, tools, session jobs, project roots | `ronin_catalogs/README.md` |
| `ronin_library/` | **how a step is done** — the reference an action or macro points you at | `ronin_library/README.md` |
| `ronin_sops/` | **how this house goes about a domain** — the standard process, adjustable | `ronin_sops/README.md` |
| `ronin_bin/` | **what you run** — the tools you type by bare name | `ronin_bin/README.md` |

Stock lives in this repo; the_owner's own copies live in a store and shadow stock
file-for-file. `bin/ronin-store --all` prints every store on this machine, resolved.
**Never spell a store path by hand** — ask (`ronin-store sops`, `ronin-store library`).

## The two axes

Every session is fixed by two things, and the rest is looked up from them:
**`project_root`** — where the work happens (`ronin_catalogs/PROJECT_ROOTS.md`) ×
**`session_job`** — what the session is for, and therefore who it is
(`ronin_catalogs/SESSION_JOBS.md`).

## Running a macro

`+<name>: <args>`, typed anywhere. Compile it with `ronin_bin/tejun <name>` and you get
the recipe, every action it names, their tools, and the SOPs those actions cite, as one
blob — execute in order, then report what happened. Extending any of it starts at
`ronin_catalogs/README.md`: the action exists before the macro, and the tool exists after
the action.

## Before you touch another session

Every session carries a dial (`@ronin-control`) — 👤 user · 👁 read · 🤖 write. Check it,
and **never flip it**: that is the_owner's hand. Report and ask.
`docs/session-control-dials.md`.

## When you need a process and no macro named one

Look on the SOP shelf. It holds the standard way this house goes about the areas no
single action owns — source control, data, getting a thing deployed. A default, not a
law, and the_owner's own copy wins: `ronin_sops/README.md`.
