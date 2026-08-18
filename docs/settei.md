# Settei — the one object, its sources, and its views

> Current state, not a plan. Settei is the unified representation of what this install
> is. **It stores nothing and is stored nowhere** — it is assembled per read from the
> sources below, and every surface anyone sees is a conversion of that one read.
> Companions: `docs/settei-architecture.html` (the model, drawn),
> `docs/settei-record.html` (the object, leaf by leaf), `docs/install.md` (the door in),
> `docs/user-config.md` (the config store's contract). What remains to build is
> `ronin-lab plans/ATARASHI.md`.

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
| **`.env`** (+ the unit) | **only a name and a boolean** — which key variables exist and whether each is set | found (presence only) | the value never crosses into settei in either direction; secrets live in `.env` and nowhere else |
| **the browser** — `localStorage` | nothing, today | — | theme and layout are honestly device state; keypad bindings are ruled settei and stranded here — a known defect, not a decision |
| *(computed in the door)* | `status` · `needed[]` (to build) | **derived** | not a source — it exists only in the answer, judged fresh from typed and found on every read |

And one thing that is the reverse of a source: **the tmux bus** (`@ronin-owner`,
`@ronin-session-max`) carries *copies out* of typed leaves, published after a write so
zero-dependency bash tools can read one value without a JSON parser. Copies, never
homes.

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
