# Integrations
- **seed:** Any outside service (Jira, Netlify, an MCP server, a web API) is one record in Settings with its key; to set one up or use one: `ronin-help integrations`.
- **when:**
- **depth:** seed
- **order:** 23

Every outside service a user brings (Jira, hosting such as Netlify, research, a database, any MCP
server or web API) is one record in this machine's Settings: what it is, how it is reached, and the
secret that holds its key. Settings › Integrations shows them. You already know how to use the
service; this says how to set one up and where things are.

### Setting one up
When the person you work for asks you to connect a service, fill in its record. The command
writes the record, turns it on in Settings, and asks for the key on your tile: the owner pastes
it there, and you hear only `saved` or `cancelled`.

1. **One Ronin ships ready?** `mcp add` lists them (Netlify, Perplexity, …).
   `mcp add <name>` sets it up and asks for its key. Nothing else to fill in.
2. **An MCP server:** `mcp add <name> <url|start command>`. Add `--sign-in oauth` when it signs
   in through the browser (the owner signs in once in Settings), `--sign-in none` when it needs
   no key, `--send 'Header: {secret}'` or `--send 'env NAME'` when the key goes another way than
   `Authorization: Bearer`.
3. **A web API:** `api add <name> <base URL>` (`https://api.example.com/v1`). `--send
   'query <param>'` when the key goes in the query string.
4. **Jira** is the owner's, in Settings › Integrations › Jira (its Connect walkthrough).
5. **Check it:** `mcp tools <name>` or `api call <name> GET <a cheap path>`. Say in one line what
   is now set up.

The name is lowercase letters, digits and `-`, the provider's own name (`netlify`, `linear`). Its
key is the secret `<name>-api-key` unless `--secret` names another. A key the record already names
but is missing: `secret ask <secret> --for "<what it is>"`. Removing: `mcp remove <name>` (the
record and its key go); only when asked.

### Where things are
- **What is on for you:** your brief's integration lines; `mcp list` and `api list` show
  everything set up. On is a default that teaches: an integration that is off for you can still be
  called.
- **Your Workspace's running details** (Netlify's `site`): `work-record workspace list`. The
  owner sets them on the Workspace page; a Workspace never holds a key.
- **Keys:** never in chat. Use one by its file when you call a provider yourself:
  `secret path <name>`. `secret ls` lists what is saved.
- **A bridge**, where Ronin has one, is the short way: it reads the key, fills in the account
  and the site, and trims the answer. Without one, `mcp call` or `api call`, or the provider's own
  CLI with its key by `secret path`.

### The way
1. Code goes through a PR: `gh pr create`. A host linked to the repo builds a preview by
   itself; `gh pr checks` says whether it built.
2. Show the preview: `preview` adds the PR's preview link to your Documents.
3. Ship when the person you work for says so: `gh pr merge`.
4. A choice that depends on the work (where a preview's data comes from, which plan, which
   region): name the choices to the person you work for, and take the one they pick.
5. When your Workspace has a canvas, put it there: a link and one line.

### Don'ts
- Don't print, paste or commit a key, or put one in a `.env`, a doc, a record or a message.
- Don't set up a service nobody asked for.
