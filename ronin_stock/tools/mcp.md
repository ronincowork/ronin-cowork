# mcp
- **seed:** list the MCP servers set up in Settings, fetch one's tools, call one; set up an integration Ronin ships
- **when:** mcp
- **depth:** seed
- **serves:** integrations
- **order:** 87

## Usage

`mcp list` → the MCP servers set up in Settings, each with whether its key is saved. `mcp tools <name> [<tool>]` → the server's tools (name, what it does, its arguments), or one in full. `mcp call <name> <tool> --json '<args>'` → runs the tool and prints its answer, cut at 400 lines; content that is not text is saved and its path printed. `mcp add` → the integrations Ronin ships ready to set up; `mcp add <name>` sets one up (its record in Settings, its key asked with `secret ask`). `mcp add <name> <url|start command> [--sign-in key|oauth|none] [--secret <n>] [--send <s>] [--description <d>]` writes an MCP server's record `~/ronin/custom/integrations/<name>.md`, asking for its key with `secret ask`; `mcp remove <name>` deletes the record and its key. Adding turns it on in Settings. The Services part `mcp` holds the key, logs the caller, stops after 60 seconds; a failure is one line. Without the part: the provider's own way. Design: docs/architecture/integrations.md.
