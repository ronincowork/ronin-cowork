# Settei — the one object, its sources, and its views

> Current state, not a plan. Settei is the unified representation of what this install
> is. **It stores nothing and is stored nowhere** — it is assembled per read from the
> sources below, and every surface anyone sees is a conversion of that one read.
> Companions: `docs/settei-architecture.html` (the model, drawn),
> `docs/settei-record.html` (the object, leaf by leaf), `docs/install.md` (the door in),
> `docs/user-config.md` (`ronin.json`'s contract), `docs/env.md` (`.env`'s contract —
> knobs and secrets), `docs/wanted-needed.md` (the two lists — intent and arithmetic).
> What remains to build is `ronin-lab plans/ATARASHI.md`.

## The one door

**One read: `GET /api/settei`** (`src/settei.ts`). One call, one answer, no writes, no
cache. Every view converts that one read for its reader and its objective — the setup
view asks what is unanswered, the ⚙ tab shows everything, the 新 seat reads
`needed[]` as its reading list at its own start, and `tejun-account` prints the
identity lines for a shell. No surface reads a source directly, and no second
assembly exists.

Writes are the mirror: **one door, `PUT /api/settei/:family`**
(`src/routes/settei-api.ts`) — each family a narrow named writer through
`updateConfig()`, which saves atomically and preserves every key it never heard of.
An unknown family is refused, never guessed at. There is no `PUT /api/settei` that
takes a document, and no route serves the underlying file — the file has other
tenants (below).

Every leaf in the answer carries its provenance — **typed · found · derived** — and
provenance is all a view needs to render a leaf: an input, a fact line, or a task.

## The registry

The schema of the object is part of the object. `SETTEI_SCHEMA` (`src/settei-registry.ts` — pure data, split out by the line ceiling, still the one declaration)
declares every askable leaf once, as pure data — section, furniture (label ·
teaching · kind), `from` (a path into the record), `lands` (a write family and the
key inside its body), optional `requires` — and rides every answer as `schema`, so a
renderer needs nothing else. No view may know a field the registry does not say.

The scan-name lists live in the registry too (`scans.keys`, `scans.tools`) — a name
worth scanning is a name the registry mentions — joined at read time by every
`key_env` a configured job names. `requires` is judged against the found half — the
`needed[]` family in the answer — and its vocabulary is four verbs and stays four:
`key` · `agent` · `tool` · `set`. `families` maps each write family to its route and
is the migration seam for the one write door.

### Pending additions

The intake: a leaf someone wants is one row here, then one row in the registry.

| leaf | asked | lands | requires | status |
|---|---|---|---|---|
| *(none pending)* | | | | |

## The sources

This is the actual ledger — not a mystical list. Everything in the settei answer comes
from one of these, and adding a source is adding a row here.

| Source | Contributes | Provenance | The rule that binds it |
|---|---|---|---|
| **`ronin.json`** — the `config` store, user scope | owner · machine · sessions.max · agents · gbrain · services · setup | **typed — the only persisted half** | written only through `updateConfig()`; the file also hosts `auth` and `passkeys`, which are **not settei** — the file is storage, not the object |
| **the catalogs store** — `PROJECT_ROOTS.md` | projects, with their remits | typed, **by reference** | settei reads it in and never owns it; ▣ Project root and the owner's editor stay its writers |
| **the mechanical scans** — eight families today, extensible | machine & OS (DMI, cores, kernel) · agent CLIs (login-shell probe) · API-key presence · host tools · the install's identity and services roster · reach and exposure (web + ssh) · the work (project dirs, live sessions) | **found** — per read, never stored | a stored measurement is a lie the moment the machine changes; every answer carries `observed_at` |
| **`.env`** (+ the unit) — `docs/env.md` | **only a name and a boolean** — which key variables exist and whether each is set | found (presence only) | the value never crosses into settei in either direction; secrets live in `.env` and nowhere else |
| **the browser** — `localStorage` | nothing, today | — | theme and layout are honestly device state; keypad bindings are ruled settei and stranded here — a known defect, not a decision |
| *(computed in the door)* | `status` · `needed[]` | **derived** | not a source — it exists only in the answer, judged fresh from typed and found on every read |

And one thing that is the reverse of a source: **the tmux bus** (`@ronin-owner`,
`@ronin-session-max`) carries *copies out* of typed leaves, published after a write so
zero-dependency bash tools can read one value without a JSON parser. Copies, never
homes.

## The index — if you are looking for it, this is where it is

The same ledger, flipped to the seeker's direction: every fact, its home, and how it is
known. `⚙` = edit it in the ⚙ Configuration view unless another editor is named.

### Who and what this install is

| Looking for | It lives | Known / edited |
|---|---|---|
| the owner's name | `ronin.json` `owner.name` | typed · `PUT /api/settei/owner` · ⚙ |
| what the machine is called | `ronin.json` `machine.name` | typed · ⚙ |
| where the machine is | `ronin.json` `machine.where` | typed, free text by ruling · ⚙ |
| the effective name/machine (fallbacks applied) | nowhere — derived in the answer | `status.owner_name`, `status.machine_name` |
| has first run happened | `ronin.json` `setup` | typed by the system: stamped at birth, cleared by Save |

### Capacity and sessions

| Looking for | It lives | Known / edited |
|---|---|---|
| the session cap | `ronin.json` `sessions.max` | typed · one route shared by ⚙ and ⌂ Roster |
| how many sessions are running now | nowhere — counted live | derived · `status.sessions` |

### Projects and the work

| Looking for | It lives | Known / edited |
|---|---|---|
| the projects (name, dir, remit) | **catalogs store** `PROJECT_ROOTS.md` | typed · ▣ Project root or by hand · settei reads by reference — **no per-root model: one default, one place (owner, 2026-08-18)** |
| does a project's directory still exist | nowhere — one stat per read | derived · `status.projects[].dir` |
| does a root have a repository, and where origin points | nowhere — one file read per root (`.git/config`) | derived · `status.projects[].repo` — measured, never recorded |
| the owner's setup notes (`projNotes`) | **nowhere — the ask was deleted, not rehomed** | ruled extravaganza (owner, 2026-08-18); one registry row if the want ever returns |

### Models, agents, and keys

| Looking for | It lives | Known / edited |
|---|---|---|
| the default for new sessions | `ronin.json` `agents.sessions.default` | typed · ⚙ |
| which model answers Mika / a house job | `ronin.json` `agents.jobs.<name>` | typed · ⚙ (koshi jobs point in 目) |
| the env-var **name** a job bills through | `ronin.json` `agents.jobs.<name>.key_env` | typed — a name is a setting |
| which CLIs are installed, and where | nowhere — login-shell probe per read | found · `observed.agents` |
| is a given key **set** | nowhere — env scan per read | found · `observed.keys` · presence only |
| **which names the scan checks** | the registry — `SETTEI_SCHEMA.scans` | plus every `key_env` a configured job names, joined per read |
| a key's **value** | **`.env` — only there** | never enters settei in either direction |
| the launch table (providers × models) | stock catalogs `PROJECT_ROOTS.md` | data, never a code path |
| open weights actually downloaded | nowhere — the koshi_weights store scanned per read | found · `observed.weights` — name and size, never assumed |

### Services and the deal

| Looking for | It lives | Known / edited |
|---|---|---|
| Services activation, entitlement id, masked email, terms | activation state in the config store | written by the Shiwake request and poll flow · read by ⚙; SETTEI cannot edit it |
| gbrain on or off | `ronin.json` `gbrain.enabled` | typed · ⚙ |
| which services are registered | nowhere — the install's roster per read | found · `observed.ronin.services` |
| what a selection still needs | nowhere — `needed[]` in the answer | derived · the registry's `requires` **and the want list**, judged per read; met items do not exist |
| the owner's want list | `ronin.json` `wanted` | typed · `PUT /api/settei/wanted` · the ⚙ "add to needed" ticks — intent persists, the needed entry it produces never does |

### The machine and the install

| Looking for | It lives | Known / edited |
|---|---|---|
| hardware, virtualization, cores, RAM | nowhere — DMI + os per read | found · `observed.machine` |
| OS, kernel, node | nowhere — read per request | found · `observed.os` / `.runtime` |
| host tools (gh, tailscale, chromium) | nowhere — PATH scan per read | found · `observed.tools` |
| release, commit, contract, started | nowhere — the install answers | found · `observed.ronin` |
| the URL, and who can reach it | nowhere — measured per read | found + derived · `observed.routes`, `status.routes[].exposure` |
| how to reach it by ssh | nowhere — interfaces + sshd listen, per read | found + derived · `observed.reach.ssh`, `status.ssh` · never the laptop-side alias |

### Near settei, but not settei

| Looking for | It lives | Note |
|---|---|---|
| the login password, the token-signing secret | `ronin.json` `auth` | **not settei** — same file, different tenant; never rendered |
| passkeys | `ronin.json` `passkeys` | not settei · ⚙ System |
| koshi outlet wiring | `ronin.json` `koshi` | edited in 目; settei shows the resolved job lines |
| knobs — `PORT`, `BIND`, `TMUX_*` | `.env` + the unit | inert until operator restart; shown read-only if shown |
| hotwords, saved launches, session jobs | catalogs store | the owner's recipes — authored, not set |
| the boot shelf | `session_boot` store | what a session reads at birth; no UI today |
| theme, layout | browser `localStorage` | device state, honestly per-device |
| keypad bindings | browser `localStorage` | **ruled settei, stranded — known defect** |

## The birth key

A genuinely fresh install says so itself; nothing is ever inferred.

- `stampFreshInstall()` writes `setup.pending = true` at first operator boot, the
  moment `ronin.json` does not exist. No route can set or re-arm it.
- Every page load asks `GET /api/settei/setup` — one section, no scans — and routes a
  pending install to the setup view. `/cowork_setup` remains the deliberate way back in.
- Save calls `PUT /api/settei/setup`: pending clears, `completed_at` stamps. An install
  that predates the key has no setup section and stays quiet forever — absence means
  do-not-show.

## The setup view

`public/js/firstrun.js`. Every askable leaf is declared once and no view may know a
field the declaration does not say — that declaration is the registry (above), served
with the answer and read through the shared vocabulary (`public/js/settei-schema.js`).
There is no client-side field list. It asks in order, teaches as it asks, and ends. Setup is complete at Save — the
view is mechanical and needs no agent; a machine with no CLI on it is finished, not
failing. The first project lands in the catalogs store via `POST /api/project-roots`,
and the seeded `home` root guarantees a floor even if the view is skipped.

## The reading list, and the seat

What a form cannot settle goes to someone who can ask. `needed[]` rides every answer:
the registry's `requires`, judged against the found half per read — met items do not
exist, so satisfying a need makes its task vanish everywhere with no write anywhere.
The unmet rows render in ⚙ beside the leaf that caused them.

The seat is the registry's own (`schema.seat`): **新 Atarashi**, launched from Save
when an agent CLI exists, and offered as **"start your setup session"** in ⚙ and on
the ＋ New board whenever an agent is found and the list is non-empty. Every launch
hands over a one-line pointer and nothing else — **the seat reads `GET /api/settei`
itself at start** (its shelf, `ronin_session_boot/job/Atarashi/00_ATARASHI.md`, says
so), so a session born at Save and one born three weeks later read the same fresh
truth, and nothing is composed, parked, or stale. The seat asks rather than assumes,
touches nothing outside the project directory unannounced, and stops
(`ronin_sops/install.md` is its verification SOP).

## The standing ⚙ view

`public/js/settei.js`: one fetch of the record, one screen. The typed rows render
from the registry — a leaf asked anywhere is editable here, structurally — saving
per-field through the one write door; found leaves are lines of text; derived leaves
are readouts beside the thing they are about, seated by the registry's declared
`fallback`/`note`/`aside` paths. Projects are shown here and edited where they live;
the session cap is the same number ⌂ Roster edits, over one route.
