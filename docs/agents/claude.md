# Claude Code in Ronin

- **stop_keys:** Escape
- **clear_keys:** Escape
- **launch_native:** ["claude"]
- **launch_model:** ["claude", "--model", "{model}"]
- **launch_native_dangerously:** ["claude", "--dangerously-skip-permissions"]
- **launch_model_dangerously:** ["claude", "--model", "{model}", "--dangerously-skip-permissions"]
- **launch_resume:** ["claude", "--resume", "{session_id}"]
- **launch_new_session_id:** ["--session-id", "{session_id}"]
- **launch_isolation:** —
- **transcript_journal:** {"format": "message-blocks", "root": "~/.claude/projects", "pattern": "{session_id}.jsonl", "idPath": "sessionId", "childPath": "isSidechain"}
- **launch_initial:** positional

CLI id: `claude`. Vendor: `anthropic` (Anthropic), its `vendor` in `src/agents.ts`; transcript `~/.claude/projects/<cwd-slug>/<uuid>.jsonl`. Reviewed 2026-09-14.
Version: **2.1.327**. Installed version checked; hooks, set-ahead and answers from Chat verified live (KAN-616, KAN-656..658).

## Ronin launch sequence

These declarations above are executable documentation: Ronin reads them to construct the
process argv. Native + Native means exactly `claude`; each Native applies only to its
Model or Launch mode field.

| Model | Launch mode | Command core |
|---|---|---|
| Native | Native | `claude` |
| Named | Native | `claude --model <model>` |
| Native | Dangerously | `claude --dangerously-skip-permissions` |
| Named | Dangerously | `claude --model <model> --dangerously-skip-permissions` |

Resume is separate: `claude --resume <session-id>`.

For a new Ronin session, the lifecycle envelope inserts `--session-id <new-uuid>` after
the executable and appends the initial brief positionally. Those are lifecycle mechanics,
not alternate meanings of Native.

Upstream also offers `--permission-mode auto`, `plan`, `acceptEdits`, and other modes.
Ronin does not currently expose them as launch choices; they are candidates to evaluate,
not aliases for the two supported launch modes.

Claude accepts the initial brief positionally. Ronin allocates a conversation UUID at
launch and uses it for archive/resume; the registry owns the arguments. Credential
locations are registry data. [Install, step 6](../getting-started/install.md#harness-sign-in-rules) owns the owner
handoff and credential-handling rules for a helping Agent.

Dangerously uses the complete command declared above. Ronin does not alter MCP configuration at
Agent launch; Claude starts with its ordinary command and reads its own user configuration.

Stop and Clear both send Escape once, as selected by the owner. The current CLI state
determines whether it clears input, interrupts activity, or dismisses a dialog; Ronin
does not classify that state. Whole browser drafts clear locally.

`hostside/claude-settings.py` owns the narrow theme/status-line configuration merge;
`hostside/statusline-ronin.sh` emits the context reading consumed by `src/ctx.ts`.
Preserve unrelated owner settings.

## Set ahead, and the asking hook (KAN-616)

At every launch and restore, `src/launch-ahead.ts`:

- marks the Agent's folder trusted in `~/.claude.json`
  (`projects["<dir>"].hasTrustDialogAccepted`), so *Do you trust this folder?* never shows, and first-run onboarding is marked done with a theme (`hasCompletedOnboarding`, `theme`; KAN-995), so the theme picker never shows;
- adds `--settings hostside/claude-asking.json` after `claude`. That file runs `ronin-asking`
  on SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PermissionDenied,
  PostToolUse, PostToolUseFailure, Notification, Elicitation, ElicitationResult, Stop and
  StopFailure. It merges with the owner's own hooks and holds nothing; these events are the
  Agent's status and its question (`src/asking.ts`, KAN-656).

**Answered from Chat** (KAN-658), as keys the prompt takes, tried on 2.1.327: a question's
option is its number, each question in turn; checkboxes are their numbers, then Tab; several
questions, or checkboxes, end on a review whose `1` submits. A plan is `1` to approve, Escape
to keep planning; a permission is `1` for Yes, Escape for No. Escape fires no hook, so Ronin
records the answer itself. AskUserQuestion and ExitPlanMode also send PermissionRequest for
their own tool: the same question.

The bypass-permissions warning is `skipDangerousModePermissionPrompt` in the owner's
`~/.claude/settings.json`; onboarding is done once at sign-in. Login is the owner's, in the
terminal. Verified with 2.1.325: AskUserQuestion sends PreToolUse, PermissionRequest and a
`permission_prompt` Notification while it is up, then PostToolUse and Stop once answered.
Plan approval is PreToolUse(ExitPlanMode), and flags the same way (KAN-618).

## Sign-in particulars

Use Claude Code's own current login/status surface and follow the interactive instructions
it displays. This repository does not carry a provider-neutral command that proves Claude
subscription versus API billing, so do not translate “CLI installed” into “signed in.”

Before launch, use `ronin-host secrets` to check whether `ANTHROPIC_API_KEY` or
`ANTHROPIC_AUTH_TOKEN` is in force without revealing its value. Those variables outrank an
OAuth/default profile and can silently move work to per-token billing. If the safe evidence
cannot distinguish the active account, report **unknown** and let the first interactive
launch request owner-controlled authorization.


Shared [code ownership and test boundaries](README.md#code-ownership) apply to this CLI.

[Upstream reference](https://code.claude.com/docs/en/interactive-mode). Update the evidence/version when changing this integration.
