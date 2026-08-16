# gbrain — the brain a session can be wired to

**gbrain is not ours.** It is Garry Tan's open-source agent brain — MIT licensed, and this
page exists partly to say so plainly: <https://github.com/garrytan/gbrain>. What it is, how
retrieval works, its CLI, its recipes for connecting email and calendar — **their README and
`docs/` are the reference, read live, never copied here.** On a machine where the gbrain
service has installed it, the same documents are on disk inside the installed package.

What gbrain does, in one paragraph: knowledge lives as markdown in a git repo of the
owner's; gbrain indexes it into a database and serves retrieval over MCP — hybrid search, a
self-wiring entity graph, and synthesized answers with citations. One server process owns
the database; every session with MCP on can reach it; the CLI against the same database is
refused while the server runs (single-writer, by design — theirs).

## What cowork ships — all of it generic

Cowork itself has no gbrain code and no gbrain dependency. It ships three pieces that any
MCP-served tool can use, and gbrain is simply the first occupant:

| piece | what | where |
|---|---|---|
| **the toggle** | ＋ New session: **gbrain on** (default — the CLI's own config applies) / **gbrain off**. The label says gbrain by the owner's ruling; the mechanism is all-MCP — off launches the session with **no** MCP servers, every other connector included, and the tooltip says so. Per launch; relaunch to change | `public/js/launcher.js` · `src/spawn.ts` |
| **`mcp_off:`** | the launch-table key holding a provider's own "no MCP" flags, appended to the cell's command when the toggle is off. A provider that declares none is **refused** when off is asked for — never launched connected | `ronin_catalogs/PROJECT_ROOTS.md` · `src/project-roots.ts` |
| **`credit:`** | the session_job key — one markdown link, text and href — rendered on the opened launch form as a real anchor (*powered by gbrain ↗*). Never inside the kind button: an anchor in a button is nested-interactive, which the axe gate fails | `src/catalog.ts` · `public/js/launcher.js` |

## 🎩 PersonalAssistant — the kind that names it

The owner's own assistant (`ronin_catalogs/SESSION_JOBS.md`): brain-first — search gbrain
before answering, capture what the owner asks to keep, one confirmation per anything that
opens an outside connection. **It credits gbrain by name and link, by the owner's ruling.**
On an install without gbrain it still launches and degrades to a plain assistant — the
posture itself says how.

What such a session knows at birth is shelf content, not catalog text: the session-boot
store's job level carries the working SOP and gbrain's own skillpack on installs that
have them, and a root whose directory is the brain's own repo can carry the same on its
root-level shelf (`docs/session-boot.md`).

## Embeddings — why search needs a model, and which door that opens

**gbrain's search is only whole with an embedding model.** Pages are chunked into the
database; keyword (BM25) search works with no model at all — that is **keyless mode**, the
shipped default, and gbrain marks its own responses `degraded: embed_unavailable` while in
it. Exact tokens and names land; concept and synonym questions quietly under-return. The
vector half needs an **embedding model**, and enabling one means a re-init and full
re-import — **cheap while the brain is small, growing with every page**, so the decision
belongs early.

Two families, and they differ in exactly one thing that matters here:

| | hosted (Voyage, OpenAI, Gemini, …) | **local (Ollama / llama.cpp server)** |
|---|---|---|
| quality | best (their default) | good for a personal corpus |
| **egress** | **a standing door: every page at index, every query at search** | **none — embedding happens on the machine** |
| cost | an API key and a bill | disk and CPU for a small model |

**The decided posture (owner, 2026-08-16): keyless is the shipped default; local embeddings
are the offered upgrade; a hosted provider is a named door the install never opens itself.**
Known sharp edges when enabling local: pin the embedding dimensions explicitly, and
`gbrain doctor` prints the exact repair when they fight (their issues #2051, #2301).

## What leaves the machine — measured, not asserted

Checked on the live process (2026-08-16): the server listens on `127.0.0.1` only — loopback,
unreachable from any other machine — and its only established connection was a local
session's own MCP client. **"OAuth 2.1" here is the local server checking local tokens, not
a cloud login.** The complete gbrain egress ledger in this configuration: **GitHub at
install, and version checks** (`self_upgrade: notify` in its config). No model calls
(keyless), no telemetry observed. A socket check is a snapshot, not an audit — the standing,
checkable answer is AGERU's `egress_log` when it exists.

## Connectors vs the brain — two different Gmails

A claude session may also carry **claude.ai connectors** (Anthropic-hosted MCP servers that
come with the owner's claude.ai account — Gmail, Calendar, Drive). They are not the brain
and not a competitor to it:

| | claude.ai connectors | gbrain ingestion (email-to-brain etc.) |
|---|---|---|
| what they give | **live hands** — read the inbox now, make an event now; nothing stored | **knowledge** — mail becomes pages in the brain: indexed, entity-linked, searchable with history |
| who can use it | claude sessions only | any agent wired to the brain — claude, codex, hermes |
| data flow | a fresh Anthropic ↔ Google call per query | Google → the owner's machine, continuously, via gbrain's credential-gateway recipe |
| setup | the claude.ai account; each connector still needs its own OAuth completed before any tool works | agent-walked recipe, doors named first, one yes at a time |

**The toggle governs both**: gbrain off launches the session with no MCP servers, connectors
included. And a connector that was never authenticated exposes only its login tools —
present is not the same as connected.

## What is deliberately NOT cowork's

The gbrain install itself, the one `serve --http` server and its unit, client registration
and token lifecycle, and the per-CLI MCP wiring — that is the **gbrain service's** job
(services layer), or the owner's by hand. Cowork behaves identically whether or not any of
it exists: the toggle governs whatever the CLI's config carries, including nothing.

Two boundaries hold everywhere: **the vocabulary** — *gbrain* is a proper name; the bare
word *brain* stays retired (`KOTOBA.md`) — and **the door rule**: gbrain's integrations
(email, calendar, voice) each open outbound connections, and each is proposed to the owner
doors-first, one at a time, never as a bundle.
