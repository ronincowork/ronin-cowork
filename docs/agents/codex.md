# Codex in Ronin

- **stop_keys:** Escape
- **clear_keys:** C-c
- **launch_native:** ["codex"]
- **launch_model:** ["codex", "--model", "{model}"]
- **launch_native_dangerously:** ["codex", "--dangerously-bypass-approvals-and-sandbox"]
- **launch_model_dangerously:** ["codex", "--model", "{model}", "--dangerously-bypass-approvals-and-sandbox"]
- **launch_resume:** ["codex", "resume", "{session_id}"]
- **launch_new_session_id:** —
- **launch_isolation:** {"env": "CODEX_HOME", "home": "~/.codex", "private": "sessions"}
- **transcript_journal:** {"format": "event-items", "root": "{home}/sessions", "pattern": "rollout-*.jsonl", "idPath": "payload.session_id", "childPath": "payload.source"}
- **launch_initial:** positional

CLI id: `codex`. Vendor: `openai` (OpenAI), its `vendor` in `src/agents.ts`; transcript `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Reviewed 2026-09-14.
Version: **0.169.0** (hooks and set-ahead, KAN-616); **0.153.4** for the isolation below. Installed version and tagged upstream input source reviewed; no live turn interrupted.

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

For a new session Ronin appends the initial brief positionally. The launch processor
sets `CODEX_HOME` to `<session store>/<birth key>/cli-home`. Every existing entry from
the inherited home is symlinked into that directory except `sessions`, which is private.
This preserves discovered configuration and credentials without a filename allowlist.
Codex chooses its id; Ronin reads it from the header inside that launch-owned journal
location. No shared-directory claim, birth-window match, or terminal capture is used.

**A birth's journal may be several files.** Codex can close one rollout and open another
under the same birth — a continuation — and on 2026-09-24 it did: the identity had pinned
the first filename, so the copy stopped at 12:56 while the Agent kept working. The journal
of an isolated birth is therefore the ORDERED CHAIN of parent rollouts in its private
`sessions` directory, not one filename. Resolution derives that chain on every call and
writes nothing back: the launch artifact is birth evidence, never a cursor. Sub-agent
rollouts are excluded by `childPath`, as before.

Segments are ordered by the header's own `timestamp`, and the filename settles a tie — a
total order, because names in one directory are unique. Every parent is admitted exactly
once: a tie decides only which of two segments is read first, never whether a record is
delivered, so it is not worth making a transcript unavailable over.

Verified with CLI 0.153.4 on 2026-09-22: a real one-reply `codex exec` invocation wrote
its rollout under the supplied home, with no matching rollout in the default home.
File-based authentication through a symlink succeeded. Forced token refresh and macOS
keyring behavior were not exercised. A CLI replacing a shared symlink by atomic rename
can make that file local to the isolated home; inheritance is the launch-time view.

Ronin restore retains this launch home and resumes the recorded id there. An explicitly
named existing conversation without retained Ronin identity uses the existing CLI home;
Ronin does not rewrite its id. Native in-pane history/picker behavior may differ because
the journal directory is private while other provider state is inherited; no picker
compatibility claim is made by the relocation test.
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
can instead treat Enter as a newline. Submission is a real tmux Enter key action after
the bracketed paste completes; a pasted carriage return is data, not that action. Ronin
leaves tmux copy mode when necessary, then unconditionally sends Enter. This is terminal
protocol handling, not a provider-specific shortcut, delay, or second Enter.

## Set ahead, and the asking hook (KAN-616)

At every launch and restore, `src/launch-ahead.ts` writes `hooks.json` into the birth's
`CODEX_HOME` (one `ronin-asking` command on SessionStart, UserPromptSubmit, PreToolUse,
PermissionRequest, PostToolUse, Stop and Interrupt: the Agent's status and its question,
`src/asking.ts`, KAN-656), adds `--dangerously-bypass-hook-trust` after `codex`, so *Hooks
need review* never shows, and adds to the linked `config.toml`, each only when absent:

- `check_for_update_on_startup = false`: no *Update available* screen;
- `[notice]` `hide_full_access_warning` and `hide_rate_limit_model_nudge`;
- `[projects."<dir>"] trust_level = "trusted"` for the Agent's folder.

The flag runs enabled hooks without persisted trust for that invocation; Codex then runs
without its shared background server (embedded mode, a startup warning says so). A
PermissionRequest hook that prints nothing is no decision, so the prompt stays for the person.
Verified with 0.169.0: an approval sends PreToolUse and PermissionRequest, then PostToolUse
and Stop once approved; request_user_input sends PreToolUse with its questions (the shape of
Claude's AskUserQuestion); a proposed plan sends only Stop (`last_assistant_message` null), so
Ronin reads the `<proposed_plan>` from the rollout's last message; Escape sends Interrupt.

**Answered from Chat** (KAN-658), as keys the prompt takes: a question's option is its number,
each question in turn (the last submits); a plan is `1` to implement, `3` to stay in Plan
mode; a permission is `y` for Yes, Escape for No. Ronin records the answer itself.

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
