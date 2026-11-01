# Hermes in Ronin

- **stop_keys:** C-c
- **clear_keys:** C-c
- **launch_native:** ["hermes", "chat"]
- **launch_model:** ["hermes", "chat", "-m", "{model}"]
- **launch_native_dangerously:** ["hermes", "chat", "--yolo"]
- **launch_model_dangerously:** ["hermes", "chat", "-m", "{model}", "--yolo"]
- **launch_resume:** ["hermes", "--resume", "{session_id}"]
- **launch_new_session_id:** —
- **launch_isolation:** {"env":"HERMES_HOME","home":"~/.hermes","private":["state.db","state.db-wal","state.db-shm","memories","sessions","logs"],"provision":"hermes-setup"}
- **transcript_journal:** {"format":"hermes-state","root":"{home}","pattern":"state.db"}
- **launch_initial:** ["--query", "{brief}"]

CLI id: `hermes`. Catalog provider: `hermes`.

The Hermes Models worksurface manages API connections and named setups, rather than
subscription sign-in. Add a named OpenAI, Mistral or OpenAI-compatible HTTPS connection,
enter its API key, and Discover models. This requests that endpoint's `/models` list;
it verifies listing access, not inference or tool support for every returned model.
Create a named setup selecting its model, reasoning and approvals. Non-OpenAI
connections currently use provider-default reasoning.

New Agent keeps its two fields: Model provider = Hermes, Model = the setup name.
Each Cowork birth creates a private `cli-home/` directory inside that session's record,
with a configuration snapshot and empty memory/history. The shared isolation grammar accepts a list of private home entries, excluding state.db and its WAL/SHM files as well as memories, sessions and logs from inherited links. Its `.env` links to the
connection's private credential file. Key rotation is picked up at process restart;
running processes may retain their old key in memory. Setup edits affect future births.
No subscription credentials are borrowed. Setup metadata is stored in the credential
store's `hermes-setups.json`; secrets remain in private `hermes-<connection-id>.env` files.
Deleting a connection is blocked while a setup references it. Its credential file is
retained for existing agents; revocation is performed at the API provider.

Existing provider credentials appear automatically: OPENAI_API_KEY and MISTRAL_API_KEY
use their provider endpoints; another compatible API uses NAME_API_KEY plus NAME_BASE_URL.
Ronin reads its environment/.env and the native Hermes .env, records the provider reference,
and prepares the private credential file used by agent homes. No import action is required.
Environment-backed connections are removed at their source; explicit form connections
remain managed in Ronin. Configured means a key is present, not that inference was tested.
Named setups currently require Cowork agent births; bare-metal launches are refused.
Archive/restore remains unsupported. The hermes-state transcript declaration identifies the private state.db; the reader is delivered separately by KAN-155. Raw native Hermes commands
continue to use Hermes's own defaults and do not select a Ronin setup automatically.

## Ronin launch sequence

A named setup launches `hermes chat -m <actual-model>` with a fresh HERMES_HOME.
Its API provider and endpoint come from that home's saved configuration. The optional
Dangerously launch mode appends `--yolo`; otherwise the setup's approvals setting applies.

Resume is separate: Hermes documents `hermes --resume <session-id>`, but Ronin cannot use
it until exact conversation discovery is supported.

Hermes can serve different inference providers. Its CLI identity is distinct from the
provider/model selected in the catalog. Ronin has no automated installer for it; a
manual installation can be detected. Update and declared resume arguments are registry
data, but exact conversation discovery is unsupported, so Archive refuses.

The initial brief is passed as one literal `--query` argument. On a TTY Hermes submits it as the first turn and keeps the session interactive. Hermes calls Ronin's Dangerously
intent `--yolo`, which bypasses its dangerous-command approval prompts. Services' gbrain scripts do not implement Hermes MCP registration,
and Agent launch does not provision one.

Stop and Clear send Ctrl+C once. The official [TUI README](https://github.com/NousResearch/hermes-agent/blob/main/ui-tui/README.md#main-chat-input)
documents interruption during activity, clearing the current draft, and exit when nothing
is pending. This mapping follows that documented TUI behavior. The classic CLI guide separately documents Ctrl+C interruption and double-press
force exit. Ronin adds no state classification. Browser drafts clear entirely locally.


Shared [code ownership and test boundaries](README.md#code-ownership) apply to this CLI.

[Upstream reference](https://hermes-agent.nousresearch.com/docs/user-guide/cli). Update the evidence/version when changing this integration.
