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
| How do I add or change a project root? | [Project roots](project-roots.md) |
| How do session Control settings work? | [Session Control](session-control-dials.md) |
| How do I customize Ronin without editing shipped files? | [Customize](customize.md) and [shadowing](shadowing.md) |
| What has Ronin connected to? | [Services activation and the egress record](services-activation.md) |
| How do I inspect configuration and the running copy? | [User configuration](user-config.md) and `bin/ronin-doctor` |

## If you are changing Ronin itself

Start with the root [`AGENTS.md`](../AGENTS.md), then use the relevant architecture or
implementation contract.

| Question | Route |
|---|---|
| KOTOBA, the glossary, KOKUGO, the lexicons, the table — which one do I want? | [Words](words.md) |
 [Test protocols](test-protocols.md) define when scoped checks and
full repository verification belong. [The API surface](api-surface.html) maps routes,
websockets, sockets, and commands.
