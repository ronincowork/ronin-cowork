# Ronin catalogs

Use focused catalog checks for individual changes. The lead owns full `npm run verify`
at the combined integration/release gate ([verification guidance](../docs/development/verification.md)).
Installed user customization is checked with `npm run byoin`.

This folder holds system-scope catalogs and the facts, behaviours and tools an Agent's
brief is built from.

> **Everything in this directory is SYSTEM SCOPE — an upgrade replaces it wholesale**
> (`docs/architecture/shadowing.md`). Nothing here may list the_owner's own things.
>
> That is why `MODEL_PROVIDERS.md` holds **the stock provider catalog** (a copy in your
> catalogs store shadows it whole). The folders a box works in are rows of its Workspaces
> (`src/workspaces.ts`), never a catalog here.

## Adding an agent-facing tool

Add one executable in `ronin_bin/` and its file in `tools/` (the header:
[tools/README.md](tools/README.md#the-header)). Keep operating rules in the tool's file or a
behaviour.

[`docs/architecture/brief.md`](../docs/architecture/brief.md) owns the brief model and the composite tool boundary.
Do not introduce “macro” or “action” as a competing category.

## Directory map

This is the stock catalog at a glance. Each subdirectory owns one kind of composition
input; identical subject names across directories do not make the documents interchangeable.

| Path | Files | Why it exists / what belongs here |
|---|---|---|
| `facts/` | one file per fact (`you`, `user`, `workspace`, `task` …) | What the brief says is true, printed from the work record. |
| `behaviours/` | one file per behaviour, flat | How an Agent works; its header says when and how much it is told. |
| `tools/` | one file per tool or family | What the brief says about each executable in `ronin_bin/`, and which behaviour it serves. |
| `workspace_types/` | one file per project type and per variant (`code`, `website` … `github`, `publishing` …). | What a new Workspace can be; the new-workspace behaviour lists them (`lists: workspace_types`). |
| `library/` | one file per shipped library item, named by its fixed id (`LIBRARY-1-onboarding.md`). | Ronin's own library items: each read onto the shelf at start when its id is missing, never rewritten; `item checkout` copies one into live work (`ronin-help library`). |
| `services/` | `ronin_services.md`. | Ronin Services: Ronin's own switchable contribution and the parts it runs. Not a tool. |
| `desk_profiles/` | `home.md`, `league.md`, `professional.md`, `terminal.md`, `vibe_code.md`. | Named presentation and workspace defaults copied into Campaign configuration. |
| `lexicons/` | `home_en.md`, `league_en.md`, `professional_en.md`, `terminal_en.md`, `vibe_code_en.md`. | Surface-language overrides; `professional_en.md` is the complete floor. |
| `templates/` | `agents/*.md`, `teams/*.md`, `canvases/*.md` (Netlify), each shelf with its `README.md`. | Authored starting compositions offered as reusable choices, not runtime authority. |
| catalog root | `MODEL_PROVIDERS.md`, `SKINS.md`. | Flat stock registries whose formats do not need another grouping directory. |

Every subdirectory has a `README.md` for its exact file format. This map owns location and
inventory; the child README owns schema. When a file is added, moved, or removed, update
this table in the same change.

Creating a Team record and creating an Agent/session are peer tool operations with
parallel UI → tool/API → internal-module stacks. Connecting or composing them does not put
them on different layers. Tool files and UIs must call a composite tool instead
of copying its guarded choreography.

## Adding a DESK PROFILE or a LEXICON (data, one file each)

`desk_profiles/<name>.md` is the owner's standing defaults for the surfaces they work at
(R38): templates copied into Campaign-owned settings: `skin` (a `SKINS.md` entry),
`theme`, `lexicon` (a `lexicons/` entry),
`rireki_view`, `team_arrangement`. `lexicons/<name>.md` is the words a surface uses —
keys to strings with a `base:` to fall through to. Both shadow whole-file by name
(`docs/architecture/shadowing.md`); each directory's README carries the format. The rule for words:
`professional_en` is the floor and complete, and a lexicon says only what it changes. `docs/architecture/desk-profiles.md`, `docs/architecture/lexicons.md`.

## Adding an INSTALLATION, an INTEGRATION, or a BEHAVIOUR

An integration is a bridge: `behaviours/<name>-bridge.md` with `when: integration:<name>`.
`services/<name>.md` is one machine installation: `effect` is `system` (its reading,
tools and parts join every Cowork Agent birth) or `provider` (it `provides`
behaviours). `behaviours/<name>.md` is one page on how ordinary work is done. Each directory's `README.md` carries the exact
format; `docs/architecture/installations.md` owns the cascade and birth behaviour. Membership is
listed once, in the definition; do not add an owner field to each member.

## Adding a FACT, a BEHAVIOUR or a TOOL

One file in `facts/`, `behaviours/` or `tools/` with the shared header; nothing else changes.
How the brief chooses and orders them is [docs/architecture/brief.md](../docs/architecture/brief.md).
Every tool is on every Agent's PATH; a header decides only what the Agent is told.
