# MCP servers
- **seed:** Outside services you reach through Ronin, which holds their keys: `mcp tools <name>` lists what one can do, `mcp call <name> <tool> --json '<args>'` runs one.{setting.mcp_lines}
- **when:** mcp
- **depth:** seed
- **order:** 22

Each line above is an MCP server set up in Settings and on for you. Ronin's broker
reaches it when you call; nothing about it is in your launch.

- Fetch its tools when the work needs them, not before: `mcp tools <name>`, and
  `mcp tools <name> <tool>` for one in full with its arguments.
- Call: `mcp call <name> <tool> --json '{…}'`. Ronin attaches the key; you never see or pass it.
- A call that says its key is missing names the `secret ask` that saves it.
- `mcp list` shows every server set up in Settings, and whether its key is saved.
- Setting one up: the Integrations behaviour (`ronin-help integrations`).
