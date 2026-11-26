# Web APIs
- **seed:** Outside web APIs you reach through Ronin, which holds their keys: `api call <name> <METHOD> <path>` calls one, the path under its base.{setting.api_lines}
- **when:** api
- **depth:** seed
- **order:** 23

Each line above is a web API set up in Settings and on for you.
Ronin's broker attaches the key when you call; nothing about it is in your launch.

- Call: `api call <name> <METHOD> <path> [--json '<body>'] [--query k=v]`. The path starts with
  `/` and stays under the API's base; Ronin attaches the key, you never see or pass it.
- The answer is `HTTP <status>`, then the body. Use the provider's own API documentation for
  paths and bodies.
- A call that says its key is missing names the `secret ask` that saves it.
- `api list` shows every web API set up in Settings, with its base.
- Setting one up: the Integrations behaviour (`ronin-help integrations`).
