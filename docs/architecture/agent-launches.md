# Agent launches

Ronin separates provider facts from Agent CLI commands. The provider catalog says which
provider, CLI and model belong together. Each [`docs/agents`](../agents/README.md) page is
the one executable authority for how that CLI is launched.

## Two independent choices

New Agent has two fields that can each say **Native**. Native is local to that field: it
means Ronin supplies no override on that axis.

| Model | Launch mode | Result |
|---|---|---|
| Native | Native | Bare CLI command; the CLI chooses its model and approval behavior. |
| Native | Dangerously | No model argument; use the CLI's approval-bypass form. |
| Named model | Native | Pass that model; do not override approval behavior. |
| Named model | Dangerously | Pass that model and use the CLI's approval-bypass form. |

Thus `Model: Native` does not prevent `Launch mode: Dangerously`, and `Launch mode:
Native` does not prevent an explicit model. Only Native + Native produces the bare CLI
command. Resume is separate: it revives a known provider conversation and is not either
a model choice or a launch mode.

**Every Agent launches Dangerously** unless a person chose Native (owner,
2026-11-18 and 2026-11-19; KAN-676, KAN-718). An Agent nothing sets a Mode for (no Campaign, a
bare-metal Agent) launches Dangerously. A command no catalog row
names gets the CLI's own bypass arguments added (`withBypass`, `src/agent-launches.ts`). A resume
is its birth command again; with none, the CLI's Dangerously command. **Mika always launches
Dangerously**: an approval prompt would stop her mid-answer. Ronin writes no sandbox or approval
setting into any CLI's config and runs no sandbox of its own (no bubblewrap).

## The standard command forms

Every Agent page declares JSON argv arrays for the same set of permutations:

| Form | Meaning |
|---|---|
| Native command | The CLI executable with neither axis overridden: for example `codex`. |
| Model command | The command with an explicit provider model. |
| Dangerous commands | The CLI's approval-bypass form, recorded separately with Native or named-model selection. |
| Resume | The CLI's resume prefix plus a provider conversation id. |
| New session id | An optional modifier used when Ronin can assign the provider conversation id. |
| Initial prompt | Whether the launch accepts the brief as a positional argument. |

`—` means Ronin does not offer that form. A CLI may support more upstream switches; its
page lists useful alternatives separately, but Ronin does not own or expose them until
they are deliberately adopted.

The Launch mode field calls ordinary approval behavior **Native**. It says nothing about
the separate Model field. If a model is selected, Ronin uses the Model command while
leaving approval behavior native.
Every currently launchable Agent maps **Dangerously** to its own approval-bypass command.
Future CLIs must declare that mapping before Ronin offers the mode.

## Open thread: provider-specific launch modes

The shared Launch mode vocabulary is **Native** and **Dangerously**. Providers also
offer intermediate policies—Claude permission modes, Codex approval/sandbox policies,
Antigravity `accept-edits`, `auto` and `plan` modes, and Grok approval modes—but Ronin does not expose them yet.
Their meanings do not line up cleanly, so they must not be squeezed into a misleading
universal label.

If adopted later, each mode needs a short provider-specific form label, a complete command
template in that Agent page, and an end-to-end lifecycle and safety check. The form must
derive those choices from the selected provider just as it derives Dangerously today.
Until then, the Agent pages retain them under upstream alternatives for drift review.

## Resolution

```text
src/agents.ts vendor + each CLI's own model list + HQ's model catalog (tier, line)
  → docs/agents/<cli>.md command grammar
  → GET /api/harness-catalog resolved commands and supported launch modes
  → New Agent provider, model and launch-mode choices
  → spawn the complete selected command
```

Dangerous commands are complete argv templates, not flags appended at launch time. That
matters when a CLI changes spelling, ordering or uses a mode value instead of a flag.

## Drift review

For each provider CLI, compare its Agent page with the provider's current official CLI
reference and the installed `--help`. Update the tested version, standard command matrix,
and the upstream-but-unused notes together. The provider catalog needs changing only when
provider or model facts changed. Focused parser and launch tests verify Ronin's wiring;
an end-to-end provider launch remains the final proof.
