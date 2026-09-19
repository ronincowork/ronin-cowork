# Codex in Ronin

- **stop_keys:** Escape
- **clear_keys:** C-c
- **launch_native:** ["codex"]
- **launch_model:** ["codex", "--model", "{model}"]
- **launch_native_dangerously:** ["codex", "--dangerously-bypass-approvals-and-sandbox"]
- **launch_model_dangerously:** ["codex", "--model", "{model}", "--dangerously-bypass-approvals-and-sandbox"]
- **launch_resume:** ["codex", "resume", "{session_id}"]
- **launch_new_session_id:** —
- **launch_initial:** positional

CLI id: `codex`. Catalog provider: OpenAI. Reviewed 2026-09-14.
Version: **0.153.4**. Installed version and tagged upstream input source reviewed; no live turn interrupted.

## Ronin launch sequence

The declarations above are executable documentation. Native + Native means exactly
`codex`; each Native applies only to its Model or Launch mode field.

| Model | Launch mode | Command core |
|---|---|---|
| Native | Native | `codex` |
| Named | Native | `codex --model <model>` |
| Native | Dangerously | `codex --dangerously-bypass-approvals-and-sandbox` |
| Named | Dangerously | `codex --model <model> --dangerously-bypass-approvals-and-sandbox` |

Resume is separate: `codex resume <session-id>`.

For a new session Ronin appends the initial brief positionally. Codex owns the new
conversation identity; Ronin discovers the exact identity after launch rather than
supplying one in argv.

Upstream also offers `--approve-for-me`, explicit sandbox policies, and approval policies.
Ronin does not currently expose those as launch choices; `--approve-for-me` is a safer
automation candidate to evaluate separately from full bypass.

Codex accepts the initial brief positionally. Ronin discovers the conversation from
matching rollout/writer-lock file descriptors and archives/resumes that exact identity.
The registry owns resume syntax. Settings/auth remain in the CLI's own configuration;
[the Codex account Behavior](../operating/codex-account.md) owns the default billing policy.

Dangerously adds the catalog's approval/sandbox bypass flag for this launch; configured
mode leaves the command unchanged. Ronin never adds an MCP override at Agent launch;
Codex reads its own user configuration.

Stop sends Escape. Clear sends Ctrl+C once, as selected by the owner. Ronin does not
inspect the CLI state first; native Ctrl+C may clear a draft, interrupt activity, or
exit at an empty prompt. Whole browser drafts clear locally.

Complete messages use the shared bracketed-paste transport before Enter. Codex's
[`handle_paste`](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/tui/src/bottom_pane/chat_composer.rs)
clears paste-burst Enter suppression after an explicit paste; raw character bursts
can instead treat Enter as a newline. This is terminal protocol handling, not a
provider-specific shortcut or a second Enter.

Services' `gbrain/setup.sh`, `uninstall.sh`, and `doctor.sh` own gbrain registration,
removal and checks. The setup uses the Codex MCP command and token environment reference.
Agent launch does not provision or switch that registration.

## Sign-in particulars

Codex has a safe status command:

```bash
codex login status
```

If it already reports the arrangement the owner chose, change nothing. This command proves
only the login arrangement it reports. This repository does not establish whether an
OpenAI environment variable could take precedence in the launched Codex process; inspect
relevant variable names without values and report that precedence as **unknown** unless
separate current evidence settles it. For a ChatGPT subscription on a remote machine, the
supported device flow is:

```bash
codex login --device-auth
codex login status
```

The owner opens the URL, enters the displayed one-time code, and authorizes in their own
browser. Success for this route is `Logged in using ChatGPT`. Plain `codex login` is also
valid when its browser callback can return on the same machine.

API-key login is a separate billing choice. Use it only when the owner explicitly chooses
API billing. `codex login --with-api-key` reads standard input; the owner must supply it
directly, outside chat, documentation, wipeboards, shell history, and recorded tiles.


Shared [code ownership and test boundaries](README.md#code-ownership) apply to this CLI.

[Upstream reference](https://github.com/openai/codex/tree/rust-v0.153.4/codex-rs/tui/src). Update the evidence/version when changing this integration.
