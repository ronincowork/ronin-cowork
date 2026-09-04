# Ronin documentation — start with the question

These are operational routes for a user or an Agent working on the user's behalf. Builder
contracts remain available, but they are not prerequisites for installing or using Ronin.

## Before Ronin is running

| Question | Route |
|---|---|
| What authority does Ronin have on this machine? | [How Ronin protects your machine and work](how-ronin-protects-you.md) |
| Is this machine suitable, or should the user rent one? | [Rent or prepare a machine](rent-a-machine.md) |
| How do I install without disturbing existing tmux work? | [Install Ronin](install.md) |
| What will `cowork_setup` ask, and what happens after Save? | [Get started](get-started.md) |
| How do I establish one provider without exposing credentials or changing billing by accident? | [Provider sign-in](provider-sign-in.md) |

## Once the coworkspace is running

| Question | Route |
|---|---|
| How do I find and arrange work? | [Workbench](workbench.md) |
| How do I add or change a Workspace Folder? | [Workspace folders](project-roots.md) |
| How do parallel Agents avoid colliding in the same files? | [Ronin Worktrees](worktrees.md) |
| How do session Control settings work? | [Session Control](session-control-dials.md) |
| How do I customize Ronin without editing shipped files? | [Customize](customize.md) and [shadowing](shadowing.md) |
| What is a template, and how does my agent keep mine? | [Templates](templates.md) |
| What has Ronin connected to? | [Services activation and the egress record](services-activation.md) |
| How do I inspect configuration and the running copy? | [Machine configuration](machine-settings.md) and `bin/ronin-doctor` |

## If you are changing Ronin itself

Start with the root [`AGENTS.md`](../AGENTS.md), then use the relevant architecture or
implementation contract.

| Question | Route |
|---|---|
| How do I verify a repository change? | Run `npm run verify`; run Playwright suites explicitly when diagnosing the rendered UI. |

## Shelves

| Shelf | Contains |
|---|---|
| `ronin_session_boot/` | the reading assembled for a new session |
| `ronin_catalogs/` | actions, tools, macros, project roots, definitions and presentation resources |
| `ronin_library/` | pages compiled into action instructions |
| `ronin_sops/` | situation-specific operating guidance |
| `ronin_bin/` | executable tools listed in `ronin_catalogs/TOOLS.md` |

The owner's stores shadow shipped resources file-for-file. `bin/ronin-store --all` lists
their resolved locations. A macro is compiled with `tejun <name>`; a machine fact is
measured with `tejun-survey`, `tejun-account`, or the relevant tool.

## Coworkspace

The Agent's page for this is [RONIN_UTILITY](RONIN_UTILITY.md): the pages, the three
workbenches and their surfaces, the tile head's buttons, Locked and Unlocked, copy and paste.

The home page opens Machine Settings, Coworks, or New Project. The bar opens the Campaign,
the current Cowork, a quick new session, the cowork commons, and the two-or-four workspace
layout. On a phone, choose the Cowork, choose the Agent, then use its full-screen tile.

A terminal tile provides the live terminal, composer, output view, Control value, and work
record. Team commons provides Docs, Wipeboard, Agent Message Queue, and Team Configuration.
Cowork commons provides account, appearance, release, voice, Services, project-root, and
archive controls. Campaign commons provides Campaign configuration, roots, Coworks,
templates, and Routines.
