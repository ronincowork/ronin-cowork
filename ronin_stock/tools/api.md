# api
- **seed:** list the web APIs available to your Campaign, call one with Ronin holding its key
- **when:** api
- **depth:** seed
- **serves:** integrations
- **order:** 88

## Usage

`api list` → the web APIs available to the caller's Campaign: name, what it is, its base URL. `api call <name> <METHOD> <path> [--json '<body>'|--json -] [--query k=v ...]` → `HTTP <status>`, then the body (JSON pretty-printed, cut at 400 lines); never a header; the path stays under the API's base. `api add <name> <base URL> [--sign-in key|oauth|none] [--secret <s>] [--send '<header>'|'query <param>'] [--campaigns <a,b>] [--description <d>]` writes the record `~/ronin/custom/integrations/<name>.md`, asking for its key with `secret ask`; `api remove <name>` deletes it. The Services part `mcp` holds the key and logs the caller; a failure is one line. Design: docs/architecture/integrations.md.
