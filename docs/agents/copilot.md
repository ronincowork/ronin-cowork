# GitHub Copilot CLI in Ronin

- **stop_keys:** Escape
- **clear_keys:** C-c
- **launch_native:** ["copilot"]
- **launch_model:** ["copilot", "--model", "{model}"]
- **launch_native_dangerously:** ["copilot", "--allow-all"]
- **launch_model_dangerously:** ["copilot", "--model", "{model}", "--allow-all"]
- **launch_resume:** ["copilot", "--resume", "{session_id}"]
- **launch_new_session_id:** —
- **launch_isolation:** {"env": "COPILOT_HOME", "home": "~/.copilot", "private": "session-state"}
- **transcript_journal:** {"format": "copilot-events", "root": "{home}/session-state", "pattern": "events.jsonl", "idPath": "data.sessionId"}
- **launch_initial:** ["-i", "{brief}"]

CLI id and command: `copilot`. Vendor: `github` (GitHub Copilot), its `vendor` in `src/agents.ts`; transcript `$COPILOT_HOME/session-state/<session-id>/events.jsonl`, adapter `copilot-events`. Reviewed 2026-11-15.
Version: **1.0.112**. Installed into a scratch home and its help read; never signed in or run
through Ronin. The journal declaration is **from docs, not yet seen on a real run**: the first
office unit that signs it in proves it.

## Install and sign in

`npm install -g @github/copilot` (Node 22 or later; Ronin's bundled Node serves). Signing in is
`copilot` itself, then `/login`: GitHub's device flow, with a Copilot plan on that account
(Free, Pro, Pro+ or a business seat). `COPILOT_GITHUB_TOKEN`, `GH_TOKEN` or `GITHUB_TOKEN`
in the environment wins over a stored sign-in. The token goes to the OS keyring, or, where
there is none, into `~/.copilot/config.json`: no file means "signed in" on its own, so the
owner's **Done** after sign-in activates it. An npm install never updates itself.

## Ronin launch sequence

| Model | Launch mode | Command core |
|---|---|---|
| Native | Native | `copilot` |
| Named | Native | `copilot --model <model>` |
| Native | Dangerously | `copilot --allow-all` |
| Named | Dangerously | `copilot --model <model> --allow-all` |

The brief is passed with `-i` (`--interactive`): Copilot runs it as the first turn and stays
open. `--allow-all` is `--allow-all-tools --allow-all-paths --allow-all-urls`; upstream's
`--yolo` is its alias, and Ronin uses the canonical spelling. Model ids are the ones Copilot's
own `/model` picker shows (from several vendors, or `auto`); Copilot publishes no list Ronin
can read, so Model: Native is the only offered choice until one is typed.

Each launch gets its own `COPILOT_HOME` with a private `session-state/`; everything else in
`~/.copilot` (sign-in, settings, MCP config) is linked in. Copilot writes one directory per
session there, `session-state/<session-id>/events.jsonl`: one event per line, its first a
`session.start` whose `data.sessionId` is the session. Services rireki's `copilot-events`
adapter reads it, written from the generated schema `session-events.schema.json` that
`@github/copilot-sdk` ships. Resume is `copilot --resume <id>` with that id.

Stop sends Escape; Clear sends Ctrl+C.

Shared [code ownership and test boundaries](README.md#code-ownership) apply to this CLI.

[Upstream reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference). Update the evidence/version when changing this integration.
