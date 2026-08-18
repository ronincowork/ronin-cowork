# Settei — the one object, its sources, and its views

> Current state, not a plan. Settei is the unified representation of what this install
> is. **It stores nothing and is stored nowhere** — it is assembled per read from the
> sources below, and every surface anyone sees is a conversion of that one read.
> Companions: `docs/settei-architecture.html` (the model, drawn),
> `docs/settei-record.html` (the object, leaf by leaf), `docs/install.md` (the door in),
> `docs/user-config.md` (`ronin.json`'s contract), `docs/env.md` (`.env`'s contract —
> knobs and secrets). What remains to build is `ronin-lab plans/ATARASHI.md`.

## The one door

**One read: `GET /api/settei`** (`src/settei.ts`). One call, one answer, no writes, no
cache. Every view converts that one read for its reader and its objective — the setup
view asks what is unanswered, the ⚙ tab shows everything, the 新 reading list (to
build) extracts what is needed and not present, and `tejun-account` prints the identity
lines for a shell. No surface reads a source directly, and no second assembly exists.

Writes are the mirror: **named PUTs, one per family** (`src/routes/settei-api.ts`),
each through `updateConfig()`, which saves atomically and preserves every key it never
heard of. There is no `PUT /api/settei` that takes a document, and no route serves the
underlying file — the file has other tenants (below).

Every leaf in the answer carries its provenance — **typed · found · derived** — and
provenance is all a view needs to render a leaf: an input, a fact line, or a task.

## The sources

This is the actual ledger — not a mystical list. Everything in the settei answer comes
from one of these, and adding a source is adding a row here.

| Source | Contributes | Provenance | The rule that binds it |
|---|---|---|---|
| **`ronin.json`** — the `config` store, user scope | owner · machine · sessions.max · agents · gbrain · services · setup | **typed — the only persisted half** | written only through `updateConfig()`; the file also hosts `auth` and `passkeys`, which are **not settei** — the file is storage, not the object |
| **the catalogs store** — `PROJECT_ROOTS.md` | projects, with their remits and per-project defaults | typed, **by reference** | settei reads it in and never owns it; ▣ Project root and the owner's editor stay its writers |
| **the mechanical scans** — seven families today, extensible | machine & OS (DMI, cores, kernel) · agent CLIs (login-shell probe) · API-key presence · host tools · the install's identity and services roster · reach and exposure · the work (project dirs, live sessions) | **found** — per read, never stored | a stored measurement is a lie the moment the machine changes; every answer carries `observed_at` |
| **`.env`** (+ the unit) — `docs/env.md` | **only a name and a boolean** — which key variables exist and whether each is set | found (presence only) | the value never crosses into settei in either direction; secrets live in `.env` and nowhere else |
| **the browser** — `localStorage` | nothing, today | — | theme and layout are honestly device state; keypad bindings are ruled settei and stranded here — a known defect, not a decision |
| *(computed in the door)* | `status` · `needed[]` (to build) | **derived** | not a source — it exists only in the answer, judged fresh from typed and found on every read |

And one thing that is the reverse of a source: **the tmux bus** (`@ronin-owner`,
`@ronin-session-max`) carries *copies out* of typed leaves, published after a write so
zero-dependency bash tools can read one value without a JSON parser. Copies, never
homes.

## The index — if you are looking for it, this is where it is

The same ledger, flipped to the seeker's direction: every fact, its home, and how it is
known. `⚙` = edit it in the ⚙ Setup view unless another editor is named.

### Who and what this install is

| Looking for | It lives | Known / edited |
|---|---|---|
| the owner's name | `ronin.json` `owner.name` | typed · `PUT /api/owner` · ⚙ |
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
| the projects (name, dir, remit, per-project model) | **catalogs store** `PROJECT_ROOTS.md` | typed · ▣ Project root or by hand · settei reads by reference |
| does a project's directory still exist | nowhere — one stat per read | derived · `status.projects[].dir` |
| the owner's setup notes (`projNotes`) | **nowhere today — vanishes on an agent-less Save** | plan leg 2 makes it a typed leaf |

### Models, agents, and keys

| Looking for | It lives | Known / edited |
|---|---|---|
| the default for new sessions | `ronin.json` `agents.sessions.default` | typed · ⚙ |
| which model answers Mika / a house job | `ronin.json` `agents.jobs.<name>` | typed · ⚙ (koshi jobs point in 目) |
| the env-var **name** a job bills through | `ronin.json` `agents.jobs.<name>.key_env` | typed — a name is a setting |
| which CLIs are installed, and where | nowhere — login-shell probe per read | found · `observed.agents` |
| is a given key **set** | nowhere — env scan per read | found · `observed.keys` · presence only |
| **which names the scan checks** | **hardcoded in `src/settei.ts` today** | dissolves into the manifest's `requires` at plan leg 1 |
| a key's **value** | **`.env` — only there** | never enters settei in either direction |
| the launch table (providers × models) | stock catalogs `PROJECT_ROOTS.md` | data, never a code path |

### Services and the deal

| Looking for | It lives | Known / edited |
|---|---|---|
| the entitlement id, email, terms | `ronin.json` `services` | typed · pasted code, recorded never verified · ⚙ |
| gbrain on or off | `ronin.json` `gbrain.enabled` | typed · ⚙ |
| which services are registered | nowhere — the install's roster per read | found · `observed.ronin.services` |
| what a selection still needs | nowhere — `needed[]`, to build | derived · plan leg 1 |

### The machine and the install

| Looking for | It lives | Known / edited |
|---|---|---|
| hardware, virtualization, cores, RAM | nowhere — DMI + os per read | found · `observed.machine` |
| OS, kernel, node | nowhere — read per request | found · `observed.os` / `.runtime` |
| host tools (gh, tailscale, chromium) | nowhere — PATH scan per read | found · `observed.tools` |
| release, commit, contract, started | nowhere — the install answers | found · `observed.ronin` |
| the URL, and who can reach it | nowhere — measured per read | found + derived · `observed.routes`, `status.routes[].exposure` |

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
  pending install to the setup view. `?setup` remains the deliberate way back in.
- Save calls `PUT /api/settei/setup`: pending clears, `completed_at` stamps. An install
  that predates the key has no setup section and stays quiet forever — absence means
  do-not-show.

## The setup view

`public/js/firstrun.js`, rendered over the field manifest (`public/js/setup-fields.js`
— every askable leaf declared once; no view may know a field the manifest does not
say). It asks in order, teaches as it asks, and ends. Setup is complete at Save — the
view is mechanical and needs no agent; a machine with no CLI on it is finished, not
failing. The first project lands in the catalogs store via `POST /api/project-roots`,
and the seeded `home` root guarantees a floor even if the view is skipped.

## The reading list, and the seat

What a form cannot settle goes to someone who can ask. `projNotes` is deliberately
routeless — the owner's own words, never a setting. When an agent CLI exists at Save,
the view launches **新 Atarashi** (`session_job` catalog row) on a brief; the seat asks
rather than assumes, touches nothing outside the project directory unannounced, and
stops. Its shelf (`ronin_session_boot/job/Atarashi/`) binds it to treat saved answers
as intent and measure what is true (`ronin_sops/install.md`).

**To build** (plan legs 1–3): the notes become a typed leaf so an agent-less Save never
loses them; `needed[]` — each askable leaf's `requires`, judged against found — joins
the derived half; and the reading list becomes a standing view *read live at seat
start*, offered as "start your setup session" whenever an agent exists and the list is
non-empty.

## The standing ⚙ view

`public/js/settei.js`: one fetch of the record, one screen. Typed leaves are fields
saving per-field through the same named PUTs; found leaves are lines of text; derived
leaves are readouts beside the thing they are about. Projects are shown here and edited
where they live; the session cap is the same number ⌂ Roster edits, over one route.
**To build** (plan leg 4): the typed rows render from the manifest, so a leaf asked
anywhere is editable here, structurally.
