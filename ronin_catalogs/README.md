# Ronin catalogs

Use focused catalog checks for individual changes. The lead owns full `npm run verify`
at the combined integration/release gate ([verification guidance](../docs/development/verification.md)).
Installed user customization is checked with `npm run byoin`.

This shelf defines system-scope catalogs and the capability documents that select and
teach Agent-facing tools.

> **Everything in this directory is SYSTEM SCOPE — an upgrade replaces it wholesale**
> (`docs/architecture/shadowing.md`). Nothing here may list the_owner's own things.
>
> That is why `PROJECT_ROOTS.md` here holds **only the project_root contract** and
> `MODEL_PROVIDERS.md` holds **the stock provider catalog** (a copy in your catalogs store
> shadows it whole). The directories a box actually works in are user scope and live outside every
> repo, in the catalogs store — `bin/ronin-store catalogs` prints where, and it is resolved
> per machine, never spelled by hand (`bin/ronin-store --all` lists them). Created by Ronin on first use, and
> untouched by any upgrade. Never add a `## <handle>` root block to the shipped file.

## Adding an agent-facing tool

Add one executable in `ronin_bin/`, one row in `TOOLS.md`, and one capability document
that states when the tool is selected and how it is taught. The capability's `requires:`
facts are the only delivery gate. Keep operating rules in the capability document or a
named Behavior; there is no compiled instruction layer.

[`docs/architecture/tool-surface.md`](../docs/architecture/tool-surface.md) owns the architectural vocabulary and its composite tool boundary.
Do not introduce “macro” or “action” as a competing category.

## Directory map

This is the stock catalog at a glance. Each subdirectory owns one kind of composition
input; identical subject names across directories do not make the documents interchangeable.

| Path | Files | Why it exists / what belongs here |
|---|---|---|
| `capabilities/` | Core: `agent_session.md`, `cowork_team.md`, `edges.md`, `machine-settings.md`, `work-record.md`, `worktree-desk.md`. Feature: `mika.md`, `ronin-host.md`. | Agent-operable domains made from real tools. Every file has a `## Tools` table. |
| `behaviours/floor/` | `cowork-agent.md`, `mandates.md`, `user-intro.md` | The complete automatic floor; the folder resolves wholesale. `user-intro.md` is the stock-empty coordinate shadowed from registration. |
| `behaviours/conditional/` | `checkout.md`, `team-lead.md`, `worktree-root.md` | Candidates applied from launch facts declared in each file. |
| `behaviours/selected/` | `buildout.md`, `codebase_team.md`, `gbrain.md`, `more_checkpoints.md`, `perplexity.md`, `recruit.md`, `report_before_fixing.md`, `trello.md`, `visual_staging.md`, `write_it_down.md` | Candidates applied through Agent → Team → Campaign selection. |
| `behaviours/sought/` | empty | Future awareness-only pages; the folder would generate its own index. |
| `installations/` | `gbrain.md`, `perplexity.md`, `ronin_services.md`, `trello.md`. | What can be installed or enabled on a machine and what that installation contributes. An installation is not an Agent capability. |
| `desk_profiles/` | `home.md`, `league.md`, `professional.md`, `terminal.md`, `vibe_code.md`. | Named presentation and workspace defaults copied into Campaign configuration. |
| `lexicons/` | `home_en.md`, `league_en.md`, `professional_en.md`, `terminal_en.md`, `vibe_code_en.md`. | Surface-language overrides; `professional_en.md` is the complete floor. |
| `templates/` | `teams/*.md` plus its `README.md`. | Authored starting compositions offered as reusable choices, not runtime authority. |
| catalog root | `MODEL_PROVIDERS.md`, `PROJECT_ROOTS.md`, `SKINS.md`, `TOOLS.md`. | Flat stock registries whose formats do not need another grouping directory. `TOOLS.md` inventories executable operations; capability files select and teach them. |

Every subdirectory has a `README.md` for its exact file format. This map owns location and
inventory; the child README owns schema. When a file is added, moved, or removed, update
this table in the same change.

Creating a Team record and creating an Agent/session are peer tool operations with
parallel UI → tool/API → internal-module stacks. Connecting or composing them does not put
them on different layers. Capability documents and UIs must call a composite tool instead
of copying its guarded choreography.

## Adding a DESK PROFILE or a LEXICON (data, one file each)

`desk_profiles/<name>.md` is the owner's standing defaults for the surfaces they work at
(R38): templates copied into Campaign-owned settings: `skin` (a `SKINS.md` entry),
`theme`, `lexicon` (a `lexicons/` entry),
`rireki_view`, `team_arrangement`. `lexicons/<name>.md` is the words a surface uses —
keys to strings with a `base:` to fall through to. Both shadow whole-file by name
(`docs/architecture/shadowing.md`); each directory's README carries the format. The rule for words:
`professional_en` is the floor and complete, a lexicon says only what it changes, and
`scripts/check-lexicon.mjs` keeps the floor honest. `docs/architecture/desk-profiles.md`, `docs/architecture/lexicons.md`.

## Adding an INSTALLATION, a FEATURE, or a BEHAVIOUR

`installations/<name>.md` is one machine installation: `effect` is `system` (its reading,
tools and parts join every Cowork Agent birth) or `provider` (it `provides`
behaviours). `behaviours/<scope>/<name>.md` is one scoped page on how ordinary work is
done. Each directory's `README.md` carries the exact
format; `docs/architecture/installations.md` owns the cascade and birth behaviour. Membership is
listed once, in the definition; do not add an owner field to each member.

## Adding a CAPABILITY (a bundle of tools, taught at birth)

`capabilities/<name>.md` is one Agent capability: the question it answers, a `## Tools`
table of the actual tools that answer it (each with its authority, whether it is taught at
birth, and its help route), and the teaching around them. `requires:` names the launch facts
that select it — an installation on, a behaviour selected, a managed worktree, a connection, a
Campaign, a Team, the lead designation — and blank selects it for every Cowork Agent. A
capability may list several tools or one; the birth overview is rendered from the
selected documents and names only tools that exist on this box. `capabilities/README.md`
carries the exact format; `docs/architecture/installations.md` owns the birth behaviour.
