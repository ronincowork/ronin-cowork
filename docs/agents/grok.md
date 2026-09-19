# Grok in Ronin

- **stop_keys:** C-c
- **clear_keys:** C-c
- **launch_native:** ["grok"]
- **launch_model:** ["grok", "--model", "{model}"]
- **launch_native_dangerously:** ["grok", "--always-approve"]
- **launch_model_dangerously:** ["grok", "--model", "{model}", "--always-approve"]
- **launch_resume:** —
- **launch_new_session_id:** —
- **launch_initial:** positional

CLI id: `grok`. Catalog provider: xAI. Reviewed 2026-09-14.
Version: **1.0.24**. Installed version checked; current upstream guide reviewed, not claimed to match every installed-version menu.

## Ronin launch sequence

The declarations above are executable documentation. Model: Native plus Launch mode:
Native means exactly `grok`; each Native applies only to its field.

| Model | Launch mode | Command core |
|---|---|---|
| Native | Native | `grok` |
| Named | Native | `grok --model <model>` |
| Native | Dangerously | `grok --always-approve` |
| Named | Dangerously | `grok --model <model> --always-approve` |

Resume is separate and not used by Ronin; exact identity discovery is unsupported.

Ronin appends the initial brief positionally. Grok calls Ronin's Dangerously intent
`--always-approve`; upstream also accepts `--yolo` as its alias, but Ronin uses the clear
canonical spelling. Its provider-specific middle controls are `--allow <rule>`, `--deny
<rule>`, and `--sandbox <profile>`; installed help also exposes permission-mode choices.
Grok additionally accepts `--resume`, `--continue`, explicit session IDs, and
reasoning-effort controls. These are recorded here for drift review but are not Ronin
standards until their lifecycle and safety behavior are exercised end to end.

The initial brief is positional. Install/update/version operations are in the registry.
Resume syntax and exact conversation discovery remain unsupported; Archive refuses.
The catalog currently declares no Dangerously mode. Services' gbrain scripts do not
implement Grok MCP registration, and Agent launch does not provision one.

Stop and Clear send Ctrl+C once. The upstream keyboard guide documents a single Ctrl+C
clearing a nonempty draft. With an empty prompt it cancels activity and may escalate
toward quit while cancelling. Escape also cancels in default mode; fullscreen Vim mode
has different Escape behavior. Ronin uses the registered Ctrl+C mapping without checking
those states. Browser drafts clear entirely locally.


Shared [code ownership and test boundaries](README.md#code-ownership) apply to this CLI.

[Upstream reference](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/03-keyboard-shortcuts.md). Update the evidence/version when changing this integration.
