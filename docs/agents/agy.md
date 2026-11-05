# Antigravity CLI in Ronin

- **stop_keys:** Escape
- **clear_keys:** C-c
- **launch_native:** ["agy"]
- **launch_model:** ["agy", "--model", "{model}"]
- **launch_native_dangerously:** ["agy", "--dangerously-skip-permissions"]
- **launch_model_dangerously:** ["agy", "--model", "{model}", "--dangerously-skip-permissions"]
- **launch_resume:** ["agy", "--conversation", "{session_id}"]
- **launch_new_session_id:** —
- **launch_isolation:** —
- **transcript_journal:** —
- **launch_initial:** ["-i", "{brief}"]

CLI id and command: `agy`. Catalog provider: Google. Reviewed 2026-11-05.
Version: **1.5.1**. Installed and its help read; the launch below is not yet proven end to
end through Ronin.

## Install and sign in

Install runs Google's installer, which puts a checksum-checked `agy` in `~/.local/bin` and
adds that folder to the shell's PATH. Signing in is `agy` itself: choose **Google OAuth**,
open the link it prints, sign in, and paste the code it gives back into the same terminal.
Antigravity CLI updates itself in the background; `agy update` updates it on demand.

## Ronin launch sequence

| Model | Launch mode | Command core |
|---|---|---|
| Native | Native | `agy` |
| Named | Native | `agy --model <model>` |
| Native | Dangerously | `agy --dangerously-skip-permissions` |
| Named | Dangerously | `agy --model <model> --dangerously-skip-permissions` |

The brief is passed with `-i` (`--prompt-interactive`): Antigravity runs it as the first
turn and stays open. Resume syntax is `agy --conversation <id>`; Ronin does not yet read
the conversation id, so Archive refuses before stopping an Antigravity session.

Stop sends Escape; Clear sends Ctrl+C. No MCP registration adapter is implemented in
Services' gbrain setup for `agy`.

Shared [code ownership and test boundaries](README.md#code-ownership) apply to this CLI.
