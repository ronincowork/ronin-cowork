# Gemini CLI in Ronin

- **stop_keys:** C-c
- **clear_keys:** C-c
- **launch_native:** ["gemini"]
- **launch_model:** ["gemini", "--model", "{model}"]
- **launch_native_dangerously:** ["gemini", "--approval-mode=yolo"]
- **launch_model_dangerously:** ["gemini", "--model", "{model}", "--approval-mode=yolo"]
- **launch_resume:** ["gemini", "--resume", "{session_id}"]
- **launch_new_session_id:** —
- **launch_initial:** positional

CLI id: `gemini`. Catalog provider: Google. Reviewed 2026-09-14.
Version: **0.60.0**. Installed version and current CLI help inspected; complete Ronin launch/resume journey remains unverified.

## Ronin launch sequence

The declarations above are executable documentation. Native + Native means exactly
`gemini`; each Native applies only to its Model or Launch mode field.

| Model | Launch mode | Command core |
|---|---|---|
| Native | Native | `gemini` |
| Named | Native | `gemini --model <model>` |
| Native | Dangerously | `gemini --approval-mode=yolo` |
| Named | Dangerously | `gemini --model <model> --approval-mode=yolo` |

Resume syntax is separate: `gemini --resume <session>`.

Ronin appends the initial brief positionally. The CLI accepts resume syntax, but Ronin
does not yet discover an exact Gemini conversation identity, so Archive refuses before
stopping a Gemini session.

Upstream also offers `default`, `auto_edit`, and `plan` approval modes. The older `--yolo`
alias still appears in installed help but is deprecated upstream; Ronin uses the supported
`--approval-mode=yolo` spelling.

The initial brief is positional. The registry declares resume syntax but exact live
conversation identity discovery is unsupported; Ronin refuses Archive before stopping
the session. Installation and update arguments are in the registry.

The catalog declares a Dangerously option. No Gemini MCP registration adapter is
implemented in Services' gbrain setup, and Agent launch does not provision one.

Stop and Clear send Ctrl+C once. The official keyboard reference documents `edit.clear`
as clearing all input text. The same key can interrupt a request or quit on empty input;
Ronin leaves that native behavior to Gemini. Browser drafts clear entirely locally.


Shared [code ownership and test boundaries](README.md#code-ownership) apply to this CLI.

[Upstream reference](https://geminicli.com/docs/reference/keyboard-shortcuts/). Update the evidence/version when changing this integration.
