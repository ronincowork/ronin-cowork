# Grok in Ronin

- **stop_keys:** C-c
- **clear_keys:** C-c

CLI id: `grok`. Catalog provider: xAI. Reviewed 2026-09-14.
Version: **1.0.24**. Installed version checked; current upstream guide reviewed, not claimed to match every installed-version menu.

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
