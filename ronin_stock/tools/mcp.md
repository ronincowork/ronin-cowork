# mcp
- **seed:** list the MCP servers available to your Campaign, fetch one's tools, call one
- **when:** mcp
- **depth:** seed
- **serves:** integrations
- **order:** 87

## Usage

`mcp list` → the servers available to the caller's Campaign, each with whether its key is saved. `mcp tools <name> [<tool>]` → the server's tools (name, what it does, its arguments), or one in full. `mcp call <name> <tool> --json '<args>'` → runs the tool and prints its answer, cut at 400 lines; content that is not text is saved and its path printed. `mcp add <name> <url|start command> [--sign-in key|oauth|none] [--secret <n>] [--send <s>] [--campaigns <list>] [--description <d>]` writes the record `~/ronin/custom/integrations/<name>.md`, asking for its key with `secret ask`; `mcp remove <name>` deletes it. The Services part `mcp` holds the key, logs the caller, stops after 60 seconds; a failure is one line. Without the part: the provider's own way. Design: docs/architecture/integrations.md.
