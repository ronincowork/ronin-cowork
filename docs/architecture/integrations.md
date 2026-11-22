# Integrations

How an outside service a user brings (hosting, a tracker, memory, research, any MCP server)
reaches Agents. This page has every decision in full. The brief model is
[brief.md](brief.md); this page is the services side of it. Decisions: KAN-586; plan:
`integrations-end-to-end` (Ordered 2026-11-16).

## The rule

**Integrations are reached at run time, never at launch.** No Agent's launch carries an MCP
server or a per-integration switch, Ronin's own tools included. Every integration is a command
the brief teaches and the Agent runs through its shell. A new integration changes nothing about
how Agents launch, and an Agent that is already running can use one connected after it started.

The brief's `mcp:` header (a bridge naming an MCP server for the launch) retires, with no
compat.

## Four ways in

All four are commands; Ronin holds the key and makes the network call, so an Agent never
handles a key.

| Way | The Agent sees | Who defines the calls | Example |
|---|---|---|---|
| **Hidden** | Ronin's own object; the provider is invisible | Ronin | Jira behind `item` |
| **Curated** | a few Ronin commands for the provider | Ronin, mapped to the provider's API | `netlify` |
| **MCP pass-through** | the provider's own MCP tools, as its server describes them | the provider | `mcp call <name> …` |
| **API pass-through** | the provider's own HTTP API, with the key attached | the provider | `api call <name> <METHOD> <path>` |

Pass-through comes first: one broker serves every MCP server and every web API with no code
per provider; an Agent already knows a provider's API, and Ronin only holds its key. A
provider gets a curated bridge only when it earns one (answers too long, the same calls with the
same arguments, a Workspace fact to fill in). A curated bridge may call through the broker, by MCP or by API.

## The pieces

| Piece | Where | Says |
|---|---|---|
| A **bridge** (curated or hidden) | a behaviour file with `when: integration:<name>`, and its tools ([brief.md](brief.md#integrations-and-bridges)) | what the bridge is for and when to reach for its commands; its `facts:` line names the facts a Workspace gives it (`facts: site`) |
| An **MCP server** or a **web API** | a record, `~/ronin/custom/integrations/<name>.md` | how the server is reached, how it signs in, which secret holds its key, which Campaigns it is available to |
| The **keys** | secrets, `~/ronin/services_secrets/<name>-<key>`, made with `secret ask` | nothing readable: a value is never printed |
| The **link** | the Workspace record's `integrations` entry, `{provider, …facts}` | the facts a bridge needs for that Workspace (Netlify's `site`) |

The owner sets the link on the Workspace page, Integrations: a row per provider, and under a row
whose bridge has a `facts:` line one small field per fact, saved into the entry
(`{provider: "netlify", site: "<name>"}`). A row with no bridge, or a bridge with no facts, is the
provider alone; any other fact in an entry is kept and shown as it is. No code per provider: a
bridge file's `facts:` line is the whole list.

## The MCP server record

One Markdown file per server, in the owner's store (it survives updates). `mcp add` writes it,
`mcp remove` deletes it, and the owner may edit it by hand. A few records ship with Ronin (the Services
part's `mcp/stock/`: `perplexity`, the Perplexity bridge's API); the owner's record of the same
name replaces one, a Campaigns change writes that copy, and a stock record is never removed. The name is the file name:
lowercase letters, digits and `-`.

```markdown
# Wispr Flow
- **description:** Voice dictation and transcripts.
- **reach:** https://mcp.example.com/mcp
- **sign-in:** key
- **secret:** wispr-flow-api-key
- **send:** Authorization: Bearer {secret}
- **campaigns:** home_machine, client_x
```

| Field | Means |
|---|---|
| title (`#`) | the label Settings shows |
| `description:` | one line: what the server is for. Taken from the server at `mcp add` (its `instructions`, else its title), editable. The brief prints it; the brief build never calls a server |
| `reach:` | an MCP server: a URL (`http://`, `https://`: MCP's streamable HTTP), or the command that starts a local server (MCP over its stdin and stdout) |
| `base:` | in place of `reach:`, a web API: its root URL (`https://api.netlify.com/api/v1`), http or https, no query. Every call's path goes under it, and the key goes nowhere else |
| `sign-in:` | `key` (a pasted key), `oauth` (a sign-in whose token the broker keeps and renews), or `none` |
| `secret:` | the secret that holds the key or the OAuth token, `<name>-<key>`. Blank with `sign-in: none` |
| `send:` | how the key goes on each call: a header, `Header-Name: … {secret} …` (default `Authorization: Bearer {secret}`), for a local server an environment variable, `env NAME`; for a web API that wants it in the query string, `query <param>` |
| `campaigns:` | the Campaigns it is available to, comma-separated. Blank: every Campaign. Available is not on: see Who has it |

There is no `bridge:` field and no kind field: a record with `reach:` is an MCP server, one with
`base:` a web API. A record whose name is also a bridge's (`netlify`) is that bridge's way through
the broker: the bridge behaviour teaches it, and no list shows it. A record named apart from its
bridge (`netlify-api` beside `netlify`) gets its own line: it does what the bridge does not.

## Who has it

The owner's ruling, 2026-11-16 (KAN-607): a record's Campaigns mean **available**, not on.

- **Available fills the pickers.** Every picker that turns integrations on (the Campaign,
  Workspace, Team and New Agent Integrations, and the Workspace page's add list) lists the bridge
  names plus every MCP server (`reach:`) and web API (`base:`) record available to that Campaign.
  The settings route sends them as `inherited.available`, the preview as `available`; the
  Workspace page reads `available` on each `/api/integrations` row.
- **The layers turn it on.** A record is on exactly as a bridge is: a Campaign, Workspace, Team or
  Agent integrations switch names it, and it is on for that layer and below. There is no other
  path: the one cascade (`cascade`, `src/brief-settings.ts`) works out every integration, and
  the Campaign layer adds nothing for a record. A lower layer turns one off for itself and below
  (`brief.integrations_off`).
- **The brief tells what is on.** Birth keeps the records available to the Campaign
  (`setting.available`, each with its kind); `buildBrief` keeps those the cascade has on, MCP
  servers as `setting.mcp` and web APIs as `setting.api`. A record available but not on is told
  nothing.
- **Example.** `cloudflare` and `workos` are available to `home_machine`, and on only because
  the Workspace `ronin_hosted` turns them on: its Agents are told them; another Workspace's are
  not, and a Team under `ronin_hosted` can turn one off.
- **The broker refuses no one** (the owner, 2026-11-16: no guards). Availability and the layers
  decide only who is told: the brief's lines, and what `mcp list` and `api list` show for the
  caller's Campaign. Any Agent can call any record by name, and the log names the caller.

## What Agents are told

- **One behaviour for every MCP server,** `behaviours/mcp-servers.md` (`when: mcp`), at seed depth,
  in play when at least one MCP record is on for the Agent. Its seed is generated: one line per record that is
  on, `<name>: <description>`, then how to call (`mcp tools <name>`, then `mcp call <name>
  <tool> --json …`). `tools/mcp.md` is the command's tool file.
- **A provider's tool list never goes into the brief.** The Agent fetches it with
  `mcp tools <name>` when the work needs it.
- **A change reaches Agents born after it.** A record added, removed, made available, turned on or off never
  moves a running Agent's brief ([brief.md](brief.md), The work record is the source of truth).
- **Web APIs likewise,** in their own behaviour, `behaviours/web-apis.md` (`when: api`, seed depth,
  in play when at least one API record is on; `{setting.api_lines}`): one generated line per API, then `api call <name> <METHOD>
  <path>`; `tools/api.md` is the command's tool file. Each seed names one command and is in play
  only when that kind is on.
- **A curated bridge** keeps its own behaviour file and gets no line in either list.

## The broker

The Services part `mcp` is an MCP client and an HTTP caller. It keeps no connection between calls:
each call connects, asks and closes.

| Command | Route | Does |
|---|---|---|
| `mcp list` | `GET /api/mcp` | the servers available to the caller's Campaign, each with whether it is on for the caller and whether its key is saved |
| `mcp tools <name>` | `GET /api/mcp/tools?name=` | the server's tools: name, what it does, the arguments it takes |
| `mcp call <name> <tool> --json '<args>'` | `POST /api/mcp/call` | runs the tool and prints its answer |
| `mcp add <name> <reach> [--sign-in key\|oauth\|none] [--secret <n>] [--send <s>] [--campaigns <list>] [--description <d>]` | `POST /api/mcp/add` | connects, reads the server's description, writes the record. A key not yet saved does not stop it (add now, authenticate later): the record is written, its line says it needs its key, a call answers with the `secret ask` line, the command asks for the key on the tile, and the first call after it is saved reads the server's description |
| (Settings › Integrations) | `POST /api/mcp/campaigns` `{name, campaigns}` | changes which Campaigns the record is available to: only the record's `campaigns:` line, blank for every Campaign; connects to nothing |
| `mcp remove <name>`, `api remove <name>` | `POST /api/mcp/remove` | deletes the record (either kind); its secret stays until the owner removes it |
| `api list` | `GET /api/apis` | the web APIs available to the caller's Campaign, each with its base and whether its key is saved |
| `api call <name> <METHOD> <path> [--json '<body>'] [--query k=v]` | `POST /api/apis/call` | the call: `HTTP <status>`, then the body (JSON pretty-printed, cut at 400 lines; any other body saved to a file). Never a response header. The path starts with one `/` and must stay on base's host and under base's path (`//host`, a scheme, `..` and encoded dots refused before anything is sent); redirects are not followed |
| `api add <name> <base> [--sign-in …] [--secret <n>] [--send '<header>'\|'query <param>'] [--campaigns <list>] [--description <d>]` | `POST /api/apis/add` | writes the record, calling nothing. A key not yet saved does not stop it: a call answers with the `secret ask` line until it is, and the command asks for it on the tile |
| (the owner, in the browser) | `GET /api/mcp/oauth/start?name=` | an `oauth` record's sign-in: Ronin registers itself with the server's authorization server and comes back to the address the browser used; the tokens go in the record's secret and the broker renews them |

On every call the broker reads the record and the secret, attaches the key as `send:` says,
logs the caller and the tool or path (never the arguments' secrets, never the key: it is masked as
`***` in every line that leaves the broker, a `query` key included), stops after 60
seconds, and answers `{ok, lines}`: the tool's text, cut at 400 lines with a note of what was
cut. An image or audio is saved to a file under the system temp folder (`ronin-mcp/<caller>/`)
and its path is printed. A failure is one line: what is missing (409, with what to set), what the
server said (502), or that the part is not running (404: use the provider's own way).

## Settings › Integrations

One list: every bridge and every MCP server, each with its description, the secret names
saved for it (never a value), the Campaigns it is available to, the Workspaces that link it and
whether its Services part runs. The list is `integrationsState` (`src/integrations.ts`): it
reads the record files, never a server; a record named like a bridge shows as that bridge.
An MCP row carries `mcp: {reach, sign_in, secret, saved, campaigns}`; a bridge's is null. Every
row carries `available` for the Campaign asked: the Workspace page's add list shows only those.

The panel (`public/js/integrations-panel.js`) works an MCP server through the broker's routes,
so it answers only while the `mcp` part runs:

- **Add MCP server** (the surface's action): name, address, sign-in, through `POST /api/mcp/add`,
  the same record `mcp add` writes. A key not saved yet opens the paste field for the secret
  the broker names; saving it adds again.
- **The key** of a `key` record: a paste field on its row saves it with `POST /api/secrets/<secret>`,
  the route `secret ask` answers through; the field is cleared the moment it is sent.
- **Sign in** on an `oauth` record opens `/api/mcp/oauth/start?name=<name>` in a new tab; Refresh
  shows it signed in.
- **Campaigns** are ticked on the row and saved with `POST /api/mcp/campaigns`; none ticked is
  every Campaign.
- **Remove** is one press (`POST /api/mcp/remove`); the secret stays.

## Order of work

1. This page.
2. The broker, MVP: one hosted server that takes a key; `mcp add`, `list`, `tools`, `call`
   from a running Claude or Codex session, with no restart.
3. A local server (a start command), then OAuth sign-in.
4. The brief (Team behaviours, w676): `mcp.md` and `tools/mcp.md`, narrowing, the refresh,
   and the `mcp:` header retired.
5. Settings › Integrations shows MCP records.
