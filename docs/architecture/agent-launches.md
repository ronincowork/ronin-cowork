# Agent launches

Ronin separates provider facts from Agent CLI commands. The provider catalog says which
provider, CLI and model belong together. Each [`docs/agents`](../agents/README.md) page is
the one executable authority for how that CLI is launched.

## The standard permutations

Every Agent page declares JSON argv arrays for the same set of permutations:

| Form | Meaning |
|---|---|
| Native | The CLI executable with no model or permission instruction: for example `codex`. |
| Model | Native plus the selected provider model. |
| Dangerously | The CLI's supported approval-bypass form, recorded as a complete command for Native and Model. |
| Resume | The CLI's resume prefix plus a provider conversation id. |
| New session id | An optional modifier used when Ronin can assign the provider conversation id. |
| Initial prompt | Whether the launch accepts the brief as a positional argument. |

`—` means Ronin does not offer that form. A CLI may support more upstream switches; its
page lists useful alternatives separately, but Ronin does not own or expose them until
they are deliberately adopted.

The UI calls the ordinary mode **Native**. If a model is selected in the separate Model
field, Ronin uses the Model command; Native means it adds no permission-mode override.
**Dangerously** appears only when the selected provider's Agent page declares a dangerous
command. This permits future CLIs to expose only the modes they actually implement.

## Resolution

```text
MODEL_PROVIDERS.md provider + model facts
  → docs/agents/<cli>.md command grammar
  → GET /api/provider-catalog resolved commands and supported launch modes
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
