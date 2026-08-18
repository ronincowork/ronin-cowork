# Setup — how a fresh install becomes a working coworkspace

> Current state, not a plan. The install door itself is `docs/install.md`; the config
> store's contract is `docs/user-config.md`. This document is the map between them: what
> happens from the first operator boot to the first finished session, and which piece of
> code owns each step.

## The shape: one record, two showings

There is one assembled record of what an install is, and every setup surface is a face
over it. Nothing here has a store of its own.

- **`GET /api/settei`** (`src/settei.ts`) assembles the record per request, in three
  sections separated by provenance: **`set`** — the owner typed it, and this half alone
  persists in `ronin.json`; **`observed`** — the box measured it (login-shell agent
  probe, DMI, roster, routes), never stored; **`status`** — computed from the other two
  on read.
- **Writes are by name, never by document** (`src/routes/settei-api.ts`). Each PUT names
  the keys it may touch and goes through `updateConfig()`, which preserves every section
  the caller never heard of. No credential crosses the boundary in either direction: the
  record carries a key's variable *name* and whether it is set, and no route accepts a
  value.
- **The field manifest** (`public/js/setup-fields.js`) declares each asked field once —
  where it appears, what it says, which route it lands on, how it folds into the body.
  The first-load page renders from it. Fields sharing a route are sent as one body;
  a field with no route is a briefing, not a setting (see the handoff below).

## The birth key

A genuinely fresh install says so itself; nothing is ever inferred.

- `stampFreshInstall()` (`src/user-config.ts`) writes `setup.pending = true` at first
  operator boot, the moment `ronin.json` does not exist. There is no route to set it;
  nothing can re-arm it over HTTP.
- On every page load the client asks `GET /api/settei/setup` — a cheap read of one
  config section, no probe — and routes to the first-load page when pending is true
  (`public/js/main.js`). `?setup` remains the deliberate way back in.
- The page's Save calls `PUT /api/settei/setup`, which clears pending and stamps
  `completed_at`. An install that predates the key has no setup section and stays quiet
  forever: absence means do-not-show.

## The first-load page

`public/js/firstrun.js`, rendered over the manifest. It asks in order, teaches as it
asks, asks once, and ends. It collects only the mechanical: the owner's name, the
machine's name, the first project (name, remit, directory), the session default off the
launch table, Mika's model, the cap, the optional services opt-in. Every write lands on
the same named endpoints the standing surfaces use. The first project is the one family
whose home is not `ronin.json` — it goes to the catalogs store via
`POST /api/project-roots`, and the seeded `home` root (`src/project-roots.ts`) guarantees
a floor exists even if the page is skipped.

## The handoff

Setup is complete at Save — the page is mechanical and needs no agent; a box with no
CLI on it is finished, not failing. The handoff is a bonus for a box that already has
one. A form cannot settle whether a repository is already cloned or what
"half-finished" means, and it does not try. `projNotes` is a field with deliberately no
route — read, never sent as configuration. When the probe found an agent CLI, the page
composes a brief after the writes land — who the owner is, the machine, the project and
its root, their note verbatim, and what a form could not settle — and launches the
first session on it: `POST /api/launch` with `session_job: Atarashi`. When it found
none, Save simply finishes into the workspace.

**新 Atarashi** (`ronin_catalogs/SESSION_JOBS.md`) is the seat that finishes what the
page could not: it asks rather than assumes, touches nothing outside the project
directory unannounced, and stops when done. Its boot shelf
(`ronin_session_boot/job/Atarashi/`) tells it to treat every saved answer as intent, not
truth, and links the install SOP (`ronin_sops/install.md`) for measuring what the box
actually has. A session that fails to start does not strand a finished setup — everything
is already saved, and the page says so.

## The standing ⚙ Setup tab

`public/js/settei.js`, one fetch of the record and one screen: `set` rows are fields that
save per-field through the same named routes, `observed` rows are lines of text, `status`
is a readout beside the thing it is about. Projects are shown and edited where they live
(▣ Project root); the session cap is the same number as ⌂ Roster's over one route. The
tab renders a curated projection, never the file — `ronin.json` holds the token-signing
secret, and no route serves the document whole.
