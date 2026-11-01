# Hermes in Ronin

- **stop_keys:** C-c
- **clear_keys:** C-c
- **launch_native:** ["hermes", "chat", "--provider", "{provider}"]
- **launch_model:** ["hermes", "chat", "--provider", "{provider}", "-m", "{model}"]
- **launch_native_dangerously:** ["hermes", "chat", "--provider", "{provider}", "--yolo"]
- **launch_model_dangerously:** ["hermes", "chat", "--provider", "{provider}", "-m", "{model}", "--yolo"]
- **launch_resume:** ["hermes", "--resume", "{session_id}"]
- **launch_new_session_id:** —
- **launch_isolation:** —
- **transcript_journal:** —
- **launch_initial:** none

CLI id: `hermes`. Catalog provider: Nous Research and other inference providers. Reviewed 2026-09-14.
Local evidence, 2026-11-01: **v0.22.5**, revision bf0203a794a0. A Ronin
`hermes_demo` session reached the provider-setup prompt. Inference, transcript reading
and archive/restore have not been certified.

## API connections and model selection

Choose the agent harness, then its API connection and model. Hermes owns endpoint,
transport and credential configuration. **Models → Hermes → Manage API connections**
opens `hermes model` in the native setup terminal. Keys are entered there, not in a
Ronin model field. Complete the setup and refresh the model list.

The refresh adapter reads `hermes config get model|providers|custom_providers --json`.
Only provider identifiers, labels and configured model identifiers enter Ronin's
measured summary. Credentials, endpoint URLs and arbitrary config fields are discarded.
This is a configured inventory, not an API entitlement probe. An empty configuration
shows no available connection; activating the harness alone does not invent one.
Built-in providers contribute the selected model; named provider entries contribute
their saved model lists, including lists discovered by Hermes. It does not import
Codex's subscription or model cache.

Each connection receives a stable Ronin route id, distinct from the inference provider
passed to `--provider`. Existing OpenAI/Codex selections keep their meaning. For a
configured connection, Ronin always passes a named model; a blank model choice uses its
first configured model rather than Hermes's unrelated global default.

Multiple API connections can coexist in Hermes's named provider configuration. The
native wizard may change the global default when selecting a built-in provider;
retain named entries for connections that must remain independently selectable.

## Ronin launch sequence

| Model | Launch mode | Command core |
|---|---|---|
| Native | Native | `hermes chat --provider <provider>` |
| Named | Native | `hermes chat --provider <provider> -m <model>` |
| Native | Dangerously | `hermes chat --provider <provider> --yolo` |
| Named | Dangerously | `hermes chat --provider <provider> -m <model> --yolo` |

Resume is separate: Hermes documents `hermes --resume <session-id>`, but Ronin cannot use
it until exact conversation discovery is supported.

Hermes can serve different inference providers. Its CLI identity is distinct from the
provider/model selected in the catalog. Ronin has no automated installer for it; a
manual installation can be detected. Update and declared resume arguments are registry
data, but exact conversation discovery is unsupported, so Archive refuses.

The initial brief is parked rather than positional. Hermes calls Ronin's Dangerously
intent `--yolo`, which bypasses its dangerous-command approval prompts. Services' gbrain scripts do not implement Hermes MCP registration,
and Agent launch does not provision one.

Hermes's provider-specific middle policies live in configuration as
`approvals.mode: smart` (the default) and `manual`; `off` is the persistent equivalent of
`--yolo`. Ronin records these for drift review but does not mutate owner configuration or
offer them as shared launch modes.

Stop and Clear send Ctrl+C once. The official [TUI README](https://github.com/NousResearch/hermes-agent/blob/main/ui-tui/README.md#main-chat-input)
documents interruption during activity, clearing the current draft, and exit when nothing
is pending. This mapping follows that documented TUI behavior; Hermes is not installed
here. The classic CLI guide separately documents Ctrl+C interruption and double-press
force exit. Ronin adds no state classification. Browser drafts clear entirely locally.


Shared [code ownership and test boundaries](README.md#code-ownership) apply to this CLI.

[Upstream reference](https://hermes-agent.nousresearch.com/docs/user-guide/cli). Update the evidence/version when changing this integration.
