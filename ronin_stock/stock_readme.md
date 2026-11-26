# Ronin stock

Everything Ronin ships for Agents and their work: the public suite. Use focused checks for
individual changes; the lead owns full `npm run verify` at the combined gate
([verification guidance](../docs/development/verification.md)). The person's own files are
checked with `npm run byoin`.

## Three places, each with one meaning

| Place | What | Who writes it |
|---|---|---|
| `ronin_stock/` (this folder, in the image) | everything Ronin ships | Ronin's repository only; an image update replaces it whole |
| `~/ronin/custom/` | the person's own files, in the same folders as here; empty on a new office | the person, and Agents for them |
| `~/ronin/office/` | office-output: what the fact builders and Agents write about the office (the office-facts in `facts/`, `MACHINE_STATUS.md`, `ABOUT_USER.md`) | the fact builders, Agents |

**The one rule, for every reader:** a file in `~/ronin/custom/<folder>/` replaces the file of the
same id in `ronin_stock/<folder>/`, whole, or adds one. Nothing is seeded, copied or merged.
Nothing in `ronin_stock/` is written at run time.

## Foundations

A **foundation** is one of the four kinds an Agent and its work are built from: a **behaviour**
(`behaviours/`), a **tool** (`tools/`), a **fact** (`facts/`) and a **playbook** (`playbooks/`).
A **stock-foundation** is Ronin's file here; a **custom-foundation** is the person's, in
`~/ronin/custom/<kind>/`, which replaces the stock one by id under the one rule.

- A fact's foundation file is its **fact-print**: how the brief prints the fact. The fact as
  built is an **office-fact**, in `~/ronin/office/facts/`.
- A **playbook** is a reusable plan of work: work items, one JSON file each (`PLAYBOOK-n.json`),
  checked out into live items ([playbooks_readme.md](playbooks/playbooks_readme.md)).
- An **agent-kind** is a condition a foundation's `when:` reacts to: irasshai, mika, a role.

The words are in [KOTOBA.md](../KOTOBA.md) (Agent composition and tools); the brief model is
[docs/architecture/brief.md](../docs/architecture/brief.md).

## Directory map

| Path | Files | What belongs here |
|---|---|---|
| `behaviours/` | one file per behaviour | How an Agent works; its header says when and how much it is told. |
| `tools/` | one file per tool or family | What the brief says about each executable in `ronin_bin/`, and which behaviour it serves. |
| `facts/` | one fact-print per fact | How the brief prints each fact. |
| `playbooks/` | one `PLAYBOOK-n.json` per playbook item | Ronin's playbooks: `item checkout PLAYBOOK-n` copies one into live work. |
| `workspace_types/` | one file per project type and variant | What a new Workspace can be; the new-workspace behaviour lists them (`lists: workspace_types`). |
| `desk_profiles/` | one file per profile | Named presentation and workspace defaults copied into Campaign configuration. |
| `lexicons/` | one file per lexicon | Surface words; `professional_en.md` is the complete floor. |
| `canvases/` | one outline per file | What a canvas starts from (`canvas templates`). |
| root | `SKINS.md` | Flat registries; a custom copy replaces an entry by its name (`docs/architecture/shadowing.md`). |

The custom folder also holds the person's MCP server and web API records,
`~/ronin/custom/integrations/<name>.md`, written by `mcp add` and `api add`.

Every folder has a `<folder>_readme.md` for its file format (`tools/tools_readme.md`). This map owns location; each folder's readme
owns format. When a file is added, moved or removed, update this table in the same change.

## Adding a foundation

One file in `behaviours/`, `tools/` or `facts/` with the shared header
([tools_readme.md](tools/tools_readme.md#the-header)), or one `PLAYBOOK-n.json` in `playbooks/`;
nothing else changes. Every tool is on every Agent's PATH; a header decides only what the Agent
is told. An agent-facing tool is one executable in `ronin_bin/` and its file in `tools/`.

An integration is a record in Settings, and a bridge is `behaviours/<name>-bridge.md` with
`when: integration:<name>` (`docs/architecture/integrations.md`). Ronin Services has no file here:
where it ships, every part runs (`docs/architecture/installations.md`).

## Adding a desk profile or a lexicon

`desk_profiles/<name>.md` is the owner's standing defaults for the surfaces they work at:
`skin` (a `SKINS.md` entry), `theme`, `lexicon` (a `lexicons/` entry), `rireki_view`,
`team_arrangement`. `lexicons/<name>.md` is the words a surface uses, keys to strings with a
`base:` to fall through to; a lexicon says only what it changes. `docs/architecture/desk-profiles.md`,
`docs/architecture/lexicons.md`.
