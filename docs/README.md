# Ronin documentation

Start with what you want to do. These guides are for people and Agents alike; the
route depends on the task, not on who is reading.

## Evaluate, install, and use Ronin

| I want to… | Read |
|---|---|
| Understand Ronin and decide whether it fits | [Ronin overview](../README.md) and [machine and work boundaries](getting-started/how-ronin-protects-you.md) |
| Choose a machine and install Ronin | [Prepare a machine](getting-started/rent-a-machine.md), then [install](getting-started/install.md) |
| Finish setup and start one working Agent | [Get started](getting-started/get-started.md), [Ronin Setup](getting-started/setup-workbench.md), and [provider sign-in](getting-started/provider-sign-in.md) |
| Find and arrange my work | [Workbench](using-ronin/workbench.md) and [the tile](using-ronin/tile.md) |
| Choose where Ronin works | [Workspace Folders](getting-started/workspace-folders.md) |
| Start a Team | [New Team](using-ronin/new-team.md) |
| Track work and coordinate Agents | [Work record](using-ronin/work-record.md), [Team Kanban](using-ronin/team-kanban.md), and [wipeboards](using-ronin/wipeboards.md) |
| Stop, clear, copy, or close | [Terminal controls](using-ronin/terminal-controls.md) |
| Archive or restore an Agent | [Archived sessions](using-ronin/archived-sessions.md) |
| Use a private branch and hand work in | [Managed worktrees](using-ronin/desks.md) |
| Change my appearance or Agent guidance | [Customize Ronin](getting-started/customize.md) |
| Add optional Services or understand what they send | [Ronin Services](getting-started/services-activation.md) |
| Check the install or troubleshoot the machine | [Operating guides](operating/README.md), including [install health](operating/install-health.md) and [private access](operating/vpn.md) |
| Give product feedback | [Feedback](using-ronin/feedback.md) |

## Terminal controls

The [default shortcut table](using-ronin/terminal-controls.md#default-shortcuts) and
provider-specific behavior live in the Terminal controls guide.

## Understand how Ronin is constructed

Start with the [seven-surface contributor map](contributor-map.md). It connects each
change area to its code, UI, stores, Services, documentation, and tests.

| Question | Reference |
|---|---|
| What do the names mean? | [KOTOBA](../KOTOBA.md) and [Agent glossary](../KOTOBA_GLOSSARY.md) |
| How are tools and Agent instructions composed? | [Tools and capabilities](architecture/tool-surface.md), [Agent composition](architecture/agent-composition.md), and [birth packet](architecture/birth-packet.md) |
| How do configuration and owner customizations resolve? | [Installations](architecture/installations.md), [shadowing](architecture/shadowing.md), and [templates](architecture/templates.md) |
| Where do state and work live? | [State inventory](state-inventory.md), [coordination trace](coordination-trace.md), and [Workspace Folders](architecture/project-roots.md) |
| How does the server run terminals and optional parts? | [Runtime connection](architecture/tmux-connection.md) and [Services contracts](https://github.com/ronincowork/ronin-services/blob/dev/README.md#understand-or-change-services) |
| How are provider CLIs integrated and launched? | [Agent launch method](architecture/agent-launches.md), [Agent integrations](agents/README.md), and [provider catalog](architecture/model-providers.md) |
| How do Workbenches place, restore, launch, and load their surfaces? | [Workbench construction](architecture/workbench.md) and [Workspace Kit](architecture/workspace-kit.md) |
| How do I contribute and verify a change? | [CONTRIBUTING](../CONTRIBUTING.md), [Agent route](../AGENTS.md), and [development references](development/README.md) |
| Where does a new file or directory belong? | [Repository layout and ownership](architecture/repository-layout.md) |

These references describe implemented behavior. They are useful to any contributor,
including a user extending Ronin; they do not require access to the creators' Lab.

## Ideas and work in progress: Ronin Lab

Ronin Lab is a place for ideas, research, plans, and notes before or across projects.
Setup gives each owner a Lab; the Ronin creators use their own Lab in the same way.
A Lab can use Git to preserve its notes without being the code repository for one project.

The creators' buildouts, audits, proposals, and rollout records belong in their
`ronin-lab` repository. They are not installation instructions or evidence that a
feature is available. Finished work should leave a current usage guide and, when
needed, a construction contract in Cowork or Services.

See [Documentation audiences and ownership](development/documentation.md) when writing
or moving documentation.
