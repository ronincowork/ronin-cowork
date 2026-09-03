# gbrain — shared knowledge for connected sessions

**gbrain is not ours.** It is Garry Tan's open-source agent-memory system — MIT licensed, and this
page exists partly to say so plainly: <https://github.com/garrytan/gbrain>. What it is, how
retrieval works, its CLI, its recipes for connecting email and calendar — **their README and
`docs/` are the reference, read live, never copied here.** On a machine where the gbrain
service has installed it, the same documents are on disk inside the installed package.

What gbrain does, in one paragraph: knowledge lives as markdown in a git repo of the
owner's; gbrain indexes it into a database and serves retrieval over MCP — hybrid search, a
self-wiring entity graph, and synthesized answers with citations. One server process owns
the database; every session with MCP on can reach it; the CLI against the same database is
refused while the server runs (single-writer, by design — theirs).

The picture the house uses: **gbrain is a filing cabinet and a
librarian** — but on a Ronin install the honest version is blunter. Nobody hand-files
markdown. Every writer this machine has is an agent over MCP (`put_page`, `capture`,
`remember`), and those writes land in **the librarian's own drawers — the database —
never as files in the cabinet.** Nor can the cabinet feed the index while the house is
up: syncing repo files is a CLI act, the CLI is refused while `serve` runs
(single-writer lock), and the MCP surface carries no sync op. **So on this deployment
the DATABASE is the brain**; the cabinet is an import bay — real when the owner bulk-
imports existing notes or a feed recipe lands files (both need a stop-sync-start
window), near-empty otherwise. Upstream's "markdown repo is the system of record"
describes their agent-lives-in-the-repo shape, not ours. Backup accordingly: `~/.gbrain`
first, the cabinet with it — and the uninstall keeps both, and says so.

## What gbrain needs from outside itself — and what Ronin's use actually requires

gbrain carries no model of its own. What it needs depends on which of its two products
you run, and **Ronin runs the first**:

| the product | outside tools needed | Ronin's status |
|---|---|---|
| **A memory for agents** — agents file and retrieve over MCP; the agent composes answers from the chunks | **one: an embedding model** | **complete.** The Load button ships it (koshi_weights — local, zero egress). Nothing is missing and nothing else is needed |
| **An autonomous brain** — gbrain thinks unattended: `think`/`synthesize`, scheduled enrichment, feeds filing themselves | the embedder PLUS **a chat model** | **not our product.** No key is configured, by ruling — not as a gap |

The reasoning, in the owner's words: agents are the only consumers Ronin has — gbrain is
localhost-only and nothing but an agent's MCP registration can reach it. On the retrieval
path gbrain hands found chunks over raw; the agent receiving them IS the LLM and does the
thinking on the owner's subscription. A key would only buy gbrain the ability to think on
its own, which nothing here asks of it.

**What keyless behavior looks like, verified live** (so nobody rediscovers it as a fault):
`think` answers "(no LLM available)", `synthesize` errors honestly, **`query` returns an
empty list silently — agents must use `search`, never `query`** (the SOP says so), and
`extract_facts` extracts nothing. All expected; none of it is used in our shape.

**If unattended feeds are ever ordered**, the chat-model question reopens — and even then
a metered API key is not the only road: upstream ships a `claude-cli` chat recipe that
routes gbrain's own calls through the local claude CLI on the owner's subscription
(verified in the installed package). A decision for that day; nothing is pre-configured.

## What cowork ships — all of it generic

Cowork has no gbrain runtime dependency. It ships the generic launch pieces below and the
service-owned gbrain Commons tab; the tab is opaque and inert when the `gbrain` service is
absent.

| piece | what | where |
|---|---|---|
| **the toggle** | New Agent: **gbrain on** (the CLI's own config applies) / **gbrain off** (no MCP servers at all, every other connector included). The label says gbrain by the owner's ruling. Per launch; relaunch to change. The Codex exception is recorded below | `src/spawn.ts` |
| **`mcp:` (the cascading key)** | **which way the toggle opens for a resolved launch — off for every ordinary one**: the brain is something the owner turns ON for the launch that wants it. `on` opens it on; `always` opens it on and withdraws the choice (the `PersonalAssistant` session_role carries the lock). It is the definition's own key, resolved against the system default. A default, not a lock — the form and an explicit `mcp:` in the launch body both override it; only `always` refuses | `ronin_catalogs/session_roles/` · `src/launch-profile.ts` · `src/spawn.ts` |
| **`gbrain_disconnected:`** | the launch-table key holding a provider's declared tokens for `gbrain_mode: disconnected`. A launch that asks for disconnected and finds none declared is refused; a profile merely defaulting disconnected degrades to connected and the receipt says so. OpenAI disables gbrain specifically. Anthropic's coarse token disables **ALL MCP** for that launch | `ronin_catalogs/PROJECT_ROOTS.md` · `src/project-roots.ts` |
| **`credit:`** | a definition key — one markdown link, text and href — rendered on the opened launch form as a real anchor (*powered by gbrain ↗*). The credit is the FACE's — the `session_role`'s own, with the shelf's as presentation fallback. Never inside the kind button: an anchor in a button is nested-interactive, which the axe gate fails | `ronin_catalogs/session_roles/` · `src/resource-adapters.ts` |

### Review finding — connected is not provisioned, and off is not yet proved

The toggle is only a launch-time pass-through to the agent CLI. **On does not install,
start, authenticate or register gbrain.** It makes whatever MCP servers that CLI already
carries available to the new session. On a fresh machine that can mean nothing; provisioning
the owner's gbrain server and registering it with each CLI remains the gbrain `ronin_service`'s job.

The shared-access path has been proved: Claude and Codex sessions concurrently read and
wrote one PGLite database through one HTTP server. The inverse claim has not. In particular,
Codex merges `-c mcp_servers={}` with its user configuration rather than replacing the
configured servers — **proven end-to-end 2026-08-23** when the owner's gbrain-off codex
launch still tried to start the gbrain client. The row now uses
`-c mcp_servers.gbrain.enabled=false`, verified via `codex mcp list` (gbrain reports
`disabled`). The honest limit stays recorded: codex 0.148 has no global "no MCP at all"
switch, so off disables the named gbrain server and any OTHER server a user has added to
codex themselves rides through. An owner with more codex servers extends the flags in
their own launch-table copy.
The launch receipt records what Ronin requested, not what the CLI actually exposed.

One more boundary is deliberate: this is per-session *access*, not per-session data. Every
session launched with MCP on reaches the same gbrain corpus, and gbrain has no Ronin session
partition. A capture from one connected session can be recalled by another.

## 🎩 PersonalAssistant — the kind that names it

The owner's own assistant (`ronin_catalogs/session_roles/PersonalAssistant.md`): brain-first — search gbrain
before answering, capture what the owner asks to keep, one confirmation per anything that
opens an outside connection. **It credits gbrain by name and link, by the owner's ruling.**
On an install without gbrain it still launches and degrades to a plain assistant — the
posture itself says how.

What such a session knows at birth is shelf content, not catalog text. An overview is not
an operating protocol: the job shelf must point first to gbrain's live installed skill
resolver, which dispatches the request to `brain-ops`, `query`, `capture` and
the other applicable skills. Those skill bodies can be fetched from the installed package
or through gbrain's `get_skill` MCP tool; they should not be copied into cowork. The working
SOP and architecture overview may sit beside the resolver, and a `gbrain` project root may
carry the same pointers on its root shelf (`docs/session-boot.md`).

## Embeddings — why search needs a model, and which door that opens

**gbrain's search is only whole with an embedding model.** Pages are chunked into the
database; keyword (BM25) search works with no model at all — that is the degraded fallback,
and gbrain marks its own responses `degraded: embed_unavailable` while in it. Exact tokens
and names land; concept and synonym questions quietly under-return. The
vector half needs an **embedding model**, and enabling one means a re-init and full
re-import — **cheap while the gbrain corpus is small, growing with every page**, so the decision
belongs early.

Two families, and they differ in exactly one thing that matters here:

| | hosted (Voyage, OpenAI, Gemini, …) | **local (Ollama / llama.cpp server)** |
|---|---|---|
| quality | best (their default) | good for a personal corpus |
| **egress** | **a standing door: every page at index, every query at search** | **none — embedding happens on the machine** |
| cost | an API key and a bill | disk and CPU for a small model |

**The decided posture: opting into gbrain installs and uses
local embeddings. BM25-only keyless operation is the degraded posture when that local unit
is unavailable. Ronin offers no hosted embedding-provider option.**
Known sharp edges when enabling local: pin the embedding dimensions explicitly, and
`gbrain doctor` prints the exact repair when they fight (their issues #2051, #2301).

## The gbrain commons_tab

**When gbrain is not installed, the tab is one button**:
**Load gbrain** — a single press runs the service's own installer (weights, gbrain
pinned, the cabinet, the server, tokens, wiring, shelves), streaming its log into the
tab until the panel below takes over. The button exists only while `installed` is
false in `GET /api/gbrain`; the press lands on `POST /api/gbrain/install`, which is
refused while a run is underway. Nothing in cowork ever presses it itself.

The gbrain Commons tab makes the mechanical state visible without requiring the
owner to know what to ask an agent. Its primary privacy readout is:

```text
Local gbrain process     ● running
Listening                VM only
External model provider  none
Integrations             none
Public access            off
```

Here `127.0.0.1:7777`, when shown under details, is the VM's own loopback address for the
local gbrain HTTP/MCP process—not gbrain HQ and not public access. The tab also lists
available and connected integrations without checkboxes. Setup or repair hands an editable
request to PersonalAssistant, because credential recipes and their outside doors still
need an agent explanation and the owner's confirmation. The focused build-out and
service response contract live in GBRAIN_PANEL.md in ronin-lab's gbrain work folder. Cowork owns its
HTML/CSS/JavaScript; the gbrain `ronin_service` owns the secret-free `GET /api/gbrain`
snapshot. With services absent, the tab stays visible but opaque and cannot be opened.

The integration headline counts outside connections, not gbrain's internal “reflex”
policies. Those policies do not mean Gmail, Calendar, Drive, a gateway or a public tunnel
has been connected.

### Where connection credentials live

The implemented boundary is narrow: the gbrain credential gateway owns acquisition and
refresh, while Ronin receives only redacted connection state. The commons_tab neither reads
nor writes credentials. Whether a future **SETTEI** connection surface stores an OAuth token
in a protected field, a service-owned store or the gateway's own store remains an open
storage ruling; auth/passkeys do not settle it by analogy, and neither does the existing
`.env` rule for operator-supplied provider keys.

## What leaves the machine — measured, not asserted

Checked on the live process (2026-08-16): the server listens on `127.0.0.1` only — loopback,
unreachable from any other machine — and its only established connection was a local
session's own MCP client. **"OAuth 2.1" here is the local server checking local tokens, not
a cloud login.** The complete gbrain egress ledger in this configuration: **GitHub at
install, and version checks** (`self_upgrade: notify` in its config). No model calls
(keyless), no telemetry observed. A socket check is a snapshot, not an audit — the standing,
checkable answer is AGERU's `egress_log` when it exists.

## Connectors vs gbrain — two different Gmails

A claude session may also carry **claude.ai connectors** (Anthropic-hosted MCP servers that
come with the owner's claude.ai account — Gmail, Calendar, Drive). They are not gbrain
and not a competitor to it:

| | claude.ai connectors | gbrain ingestion (`email-to-brain`, etc.) |
|---|---|---|
| what they give | **live hands** — read the inbox now, make an event now; nothing stored | **knowledge** — mail becomes indexed, entity-linked gbrain pages searchable with history |
| who can use it | claude sessions only | any agent wired to gbrain — claude, codex, hermes |
| data flow | a fresh Anthropic ↔ Google call per query | Google → the owner's machine, continuously, via gbrain's credential-gateway recipe |
| setup | the claude.ai account; each connector still needs its own OAuth completed before any tool works | agent-walked recipe, doors named first, one yes at a time |

**The toggle governs both**: gbrain off launches the session with no MCP servers, connectors
included. And a connector that was never authenticated exposes only its login tools —
present is not the same as connected.

## What is deliberately NOT cowork's

The gbrain install itself, the one `serve --http` server and its unit, client registration
and token lifecycle, and the per-CLI MCP wiring — that is the **gbrain `ronin_service`'s** job
(services layer), or the owner's by hand. Cowork behaves identically whether or not any of
it exists: the toggle governs whatever the CLI's config carries, including nothing.

Two boundaries hold everywhere: **the vocabulary** — *gbrain* is a proper name; the bare
word *brain* stays retired (`KOTOBA.md`) — and **the door rule**: gbrain's integrations
(email, calendar, voice) each open outbound connections, and each is proposed to the owner
doors-first, one at a time, never as a bundle.
