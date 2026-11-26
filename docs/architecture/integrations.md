# Integrations

How an outside service a user brings (Jira, hosting such as Netlify, research, memory, any MCP
server or web API) reaches Agents. This page has every decision in full. The brief model is
[brief.md](brief.md); this page is the services side of it. Decisions: KAN-586; the one record
and where it lives, the owner 2026-11-26 (KAN-857).

## The rule

**Set up in Settings, used by the Workspace.** Every integration is one record in this
machine's Settings: what it is, how it is reached, how it signs in, and the secret that holds its
key. Adding, configuring, keying and removing happen there and nowhere else. A Workspace never
holds a key or a setup; it only uses what Settings holds: whether its Agents are told of it, and
the running details of its own use (Netlify's `site`).

**On teaches, it never blocks.** On means the integration's behaviours are in the Agent's brief.
An Agent that finds an integration that is off for it may still call it: nothing refuses (the
owner, 2026-11-16 and 2026-11-26: no guards).

**Integrations are reached at run time, never at launch.** No Agent's launch carries an MCP
server or a per-integration switch, Ronin's own tools included. Every integration is a command
the brief teaches and the Agent runs through its shell. A new integration changes nothing about
how Agents launch, and an Agent that is already running can use one added after it started.

The word is **Integration**, on screen and in code. "Installations" (Ronin's own parts, on or off)
retires: Ronin Services always runs, hosted or self-hosted ([installations.md](installations.md)).

## Four ways in

All four are commands; Ronin holds the key and makes the network call, so an Agent never
handles a key.

| Way | The Agent sees | Who defines the calls | Example |
|---|---|---|---|
| **Hidden** | Ronin's own object; the provider is invisible | Ronin | Jira behind `item` |
| **Curated** (a bridge) | a few Ronin commands for the provider | Ronin, mapped to the provider's API | `netlify` |
| **MCP pass-through** | the provider's own MCP tools, as its server describes them | the provider | `mcp call <name> …` |
| **API pass-through** | the provider's own HTTP API, with the key attached | the provider | `api call <name> <METHOD> <path>` |

One integration may be reached more than one way with one key: Netlify's record serves both the
`netlify` bridge and `api call netlify …`. A bridge is the cleaner, Ronin-controlled way; it is
never the only one. Pass-through comes first: one broker serves every MCP server and every web
API with no code per provider. A provider gets a bridge only when it earns one (answers too long,
the same calls with the same arguments, a Workspace detail to fill in).

## The integration record

One Markdown file per integration, `~/ronin/custom/integrations/<name>.md`, in the owner's store
(it survives updates). It rides this machine's Settings (the Campaign; a machine has one). Every
integration has one: Jira, a bridge's provider, an MCP server, a web API. The name is the file
name: lowercase letters, digits and `-`. A record named like a bridge (`netlify`, its behaviour
`when: integration:netlify`) is that bridge's record: no list shows the two apart.

```markdown
# Netlify
- **description:** Hosting: sites, deploys, previews, variables.
- **base:** https://api.netlify.com/api/v1
- **sign-in:** key
- **secret:** netlify-auth-token
- **send:** Authorization: Bearer {secret}
```

| Field | Means |
|---|---|
| title (`#`) | the label Settings shows |
| `description:` | one line: what it is for. An MCP server's is taken from the server when added (its `instructions`, else its title), editable. The brief prints it; the brief build never calls a server |
| `reach:` | an MCP server: a URL (`http://`, `https://`: MCP's streamable HTTP), or the command that starts a local server (MCP over its stdin and stdout) |
| `base:` | a web API: its root URL, http or https, no query. Every call's path goes under it, and the key goes nowhere else |
| `sign-in:` | `key` (a pasted key), `oauth` (a sign-in whose token the broker keeps and renews), or `none` |
| `secret:` | the secret that holds the key or the OAuth token, `<name>-<key>`. Blank with `sign-in: none` |
| `send:` | how the key goes on each call: a header, `Header-Name: … {secret} …` (default `Authorization: Bearer {secret}`), for a local server an environment variable, `env NAME`; for a web API that wants it in the query string, `query <param>` |

There is no kind field: the ways follow from what the record has. A bridge behaviour of its name
makes it curated; `reach:` makes it an MCP server; `base:` a web API. A record may have a bridge
and `base:` both (Netlify). `reach:` and `base:` are one or the other. There is no `campaigns:`
line: a record in Settings is there for every Workspace on the machine.

**Jira's record is its connection**, the Jira part's own file (`~/ronin/jira/<campaign>.json`:
site, space, account, the switches, the sync state; the token in the secret `jira-<campaign>`).
Connect writes it and Remove (its disconnect) deletes it; Settings lists Jira while it exists, and
its Configure section is today's Jira panel. Jira is hidden: Agents reach work items
through `item`, so they are told nothing of Jira itself ([brief.md](brief.md)).

**The keys** are secrets, `~/ronin/services_secrets/<name>-<key>`: nothing readable, a value is
never printed or shown again. Settings saves and replaces them; an Agent's `secret ask` saves to
the same secret and stays (no guards).

**Ronin ships starting records.** A Services part's `mcp/stock/` holds records for the providers
Ronin knows (`perplexity`, `netlify`). Adding one in Settings copies it into the owner's store and
asks for its key; the owner's copy is the record from then on.

## Settings › Integrations

The list of records, one row each: its label and description, the ways it is reached (bridge,
MCP, web API), whether its key is saved (never the value), and whether its Services part runs. The
list reads the record files, never a server (`integrationsState`, `src/integrations.ts`).

- **+ Add an integration** asks which first: a starting record Ronin ships (Jira, Netlify,
  Perplexity, …), an MCP server, or a web API. Then that one's setup and key: for a starting
  record, the key alone; for an MCP server, name, address and sign-in (the broker connects and
  reads its description); for a web API, name, base and sign-in. Jira's is the Jira Connect
  walkthrough.
- **Configure** opens a row's setup: its fields, and Jira's panel for Jira.
- **The key**: a `key` record's paste field saves and replaces it (`POST /api/secrets/<secret>`);
  the field is cleared the moment it is sent. An `oauth` record's Sign in opens
  `/api/mcp/oauth/start?name=<name>` in a new tab.
- **Remove** deletes the record and its secret, and takes the name off Settings' integrations.
  Workspaces, Teams and Agents keep what they were born with ([brief.md](brief.md),
  inherit at birth); an Agent told of a removed integration finds its call answers that it is
  not set up.

Adding is how an integration comes on: **Add puts the name on Settings' integrations**
(`campaign.config.integrations`), the top of the cascade, so a Workspace made after it starts with
it on. Agents' `mcp add` and `api add` write the same record and do the same.

## The Workspace

A Workspace uses the integrations in Settings. Its Integrations step is one row per record: a tick
for on, and under a row whose bridge has a `facts:` line one small field per fact, the running
details of this Workspace's use (`netlify-bridge`'s `facts: site`, saved as
`{provider: "netlify", site: "<name>"}` in the record's `integrations` entry). No key, no key
state, no setup. No code per provider: a bridge file's `facts:` line is the whole list.

## On and off: a cascading default

On or off is a default that flows down, never a gate.

- **Settings starts it.** Adding an integration turns it on in Settings (the Campaign layer).
- **Each level copies its parent at birth.** A Workspace made after it starts with it on; a Team
  starts with its Workspace's; an Agent with its Team's (Workspace's when teamless). A change
  higher up never reaches a level that already exists ([brief.md](brief.md), inherit at birth).
- **Any level may change its own.** A Workspace turns one off (or back on) for itself, and the
  levels made under it afterwards copy that. A Team or Agent may do the same for itself
  (`brief.integrations_off` turns off one its parent has on).
- **The brief tells what is on.** On for an Agent makes `integration:<name>` hold, so its bridge
  behaviour and that behaviour's tools come into play, and an MCP server or web API that is on gets
  its line (below). Off, the Agent is told nothing of it, and may still call it.

The one cascade is `cascade`, `src/brief-settings.ts`.

## What Agents are told

- **Every Agent has the Integrations behaviour,** `behaviours/integrations.md` (no `when:`, seed
  depth): how to fill in a record when the person it works for asks for a service (`mcp add` for
  the ones Ronin ships, `mcp add <name> <reach>`, `api add <name> <base>`), the key asked with
  `secret ask` on its tile, then a check. Where things are; the don'ts.
- **One behaviour for every MCP server,** `behaviours/mcp-servers.md` (`when: mcp`), at seed depth,
  in play when at least one MCP record is on for the Agent. Its seed is generated: one line per
  record that is on, `<name>: <description>`, then how to call (`mcp tools <name>`, then `mcp call
  <name> <tool> --json …`). `tools/mcp.md` is the command's tool file.
- **Web APIs likewise,** in their own behaviour, `behaviours/web-apis.md` (`when: api`, seed depth,
  in play when at least one API record is on; `{setting.api_lines}`): one generated line per API,
  then `api call <name> <METHOD> <path>`; `tools/api.md` is the command's tool file.
- **A bridge** keeps its own behaviour file, and its record gets no line in either list.
- **A provider's tool list never goes into the brief.** The Agent fetches it with `mcp tools
  <name>` when the work needs it.
- **A change reaches Agents born after it.** A record added, removed, turned on or off never moves
  a running Agent's brief ([brief.md](brief.md), The work record is the source of truth).

## The broker

The Services part `mcp` is an MCP client and an HTTP caller. It keeps no connection between calls:
each call connects, asks and closes. It refuses no one: any Agent can call any record by name, and
the log names the caller.

| Command | Route | Does |
|---|---|---|
| `mcp list` | `GET /api/mcp` | the MCP servers in Settings, each with whether it is on for the caller and whether its key is saved |
| `mcp tools <name>` | `GET /api/mcp/tools?name=` | the server's tools: name, what it does, the arguments it takes |
| `mcp call <name> <tool> --json '<args>'` | `POST /api/mcp/call` | runs the tool and prints its answer |
| `mcp add <name> <reach> [--sign-in key\|oauth\|none] [--secret <n>] [--send <s>] [--description <d>]` | `POST /api/mcp/add` | connects, reads the server's description, writes the record and puts it on Settings' integrations. A key not yet saved does not stop it: the record is written, a call answers with the `secret ask` line, and the first call after it is saved reads the server's description |
| `mcp add` | `GET /api/mcp/stock` | the starting records Ronin ships, for an Agent (and Settings' Add) |
| `mcp add <name>` | `POST /api/mcp/stock` `{name}` | copies that starting record into the owner's store, puts it on Settings' integrations, and names its key when not saved (the command asks for it with `secret ask`) |
| `mcp remove <name>`, `api remove <name>` | `POST /api/mcp/remove` | deletes the record and its secret and takes it off Settings' integrations |
| `api list` | `GET /api/apis` | the web APIs in Settings, each with its base and whether its key is saved |
| `api call <name> <METHOD> <path> [--json '<body>'] [--query k=v]` | `POST /api/apis/call` | the call: `HTTP <status>`, then the body (JSON pretty-printed, cut at 400 lines; any other body saved to a file). Never a response header. The path starts with one `/` and must stay on base's host and under base's path (`//host`, a scheme, `..` and encoded dots refused before anything is sent); redirects are not followed |
| `api add <name> <base> [--sign-in …] [--secret <n>] [--send '<header>'\|'query <param>'] [--description <d>]` | `POST /api/apis/add` | writes the record, calling nothing, and puts it on Settings' integrations. A key not yet saved does not stop it |
| (the owner, in the browser) | `GET /api/mcp/oauth/start?name=` | an `oauth` record's sign-in: Ronin registers itself with the server's authorization server and comes back to the address the browser used; the tokens go in the record's secret and the broker renews them |

On every call the broker reads the record and the secret, attaches the key as `send:` says, logs
the caller and the tool or path (never the arguments' secrets, never the key: it is masked as
`***` in every line that leaves the broker, a `query` key included), stops after 60 seconds, and
answers `{ok, lines}`: the tool's text, cut at 400 lines with a note of what was cut. An image or
audio is saved to a file under the system temp folder (`ronin-mcp/<caller>/`) and its path is
printed. A failure is one line: what is missing (409, with what to set), what the server said
(502), or that the part is not running (404: use the provider's own way).

## Order of work (KAN-857)

1. This page and [installations.md](installations.md).
2. The record for every integration: `campaigns:` goes from the record, the broker and
   `src/integrations.ts`; a bridge's provider and Jira read their record; `netlify` ships as a
   starting record with its bridge's secret; Add and `mcp add`/`api add` put the name on
   Settings' integrations; Remove deletes the secret too (Cowork and Services).
3. Settings › Integrations: the list, + Add with its kinds, Configure, the key, Remove.
4. The Workspace's Integrations step: a tick and the running details per record; no key state.
5. Installations and the Ronin Services on/off go ([installations.md](installations.md)).

No migration and no reader for old files: the owner adds again what he wants set up the new way.
