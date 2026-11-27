# OpenCode in Ronin

- **stop_keys:** Escape
- **clear_keys:** C-c
- **launch_native:** ["opencode"]
- **launch_model:** ["opencode", "--model", "{model}"]
- **launch_native_dangerously:** ["opencode", "--auto"]
- **launch_model_dangerously:** ["opencode", "--model", "{model}", "--auto"]
- **launch_resume:** ["opencode", "--session", "{session_id}"]
- **launch_new_session_id:** —
- **launch_isolation:** —
- **transcript_journal:** —
- **launch_initial:** ["--prompt", "{brief}"]

CLI id and command: `opencode`. Vendor: `opencode` (OpenCode), its `vendor` in `src/agents.ts`; one SQLite store `~/.local/share/opencode/opencode.db`, no adapter. Reviewed 2026-11-15.
Version: **1.19.5**. Installed into a scratch home and its help read; never signed in or run
through Ronin.

## Install and sign in

`npm install -g opencode-ai`. OpenCode serves any provider. Sign-in is
`opencode providers login` (alias `opencode auth login`): pick a provider and give its API key,
or sign in to a subscription it supports; each one goes into
`~/.local/share/opencode/auth.json`, the file Ronin reads as "signed in". OpenCode Zen's free
models work with no sign-in at all, so the owner's **Done** activates it too.
OpenCode updates itself on start (`autoupdate`).

## Ronin launch sequence

| Model | Launch mode | Command core |
|---|---|---|
| Native | Native | `opencode` |
| Named | Native | `opencode --model <provider/model>` |
| Native | Dangerously | `opencode --auto` |
| Named | Dangerously | `opencode --model <provider/model> --auto` |

The brief is passed with `--prompt`: the TUI opens with it as the first turn. `--auto`
auto-approves every permission not explicitly denied in its config. Model ids are
`provider/model`, as `opencode models` prints them one per line; a refresh reads that list.

Chat shows the terminal only. OpenCode keeps every session in one SQLite store,
`~/.local/share/opencode/opencode.db` (`opencode db path`), whose schema it does not publish;
its documented way out is `opencode export <sessionID>`. No log reader is written against an
unpublished schema. Resume syntax is `opencode --session <id>`; Ronin does not read the id, so
Archive refuses.

Stop sends Escape. Clear sends Ctrl+C, which clears a nonempty prompt; on an empty prompt
OpenCode's default keys also bind Ctrl+C to quit.

Shared [code ownership and test boundaries](README.md#code-ownership) apply to this CLI.

[Upstream reference](https://opencode.ai/docs/cli/). Update the evidence/version when changing this integration.
