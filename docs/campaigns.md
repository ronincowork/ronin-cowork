# Campaigns — the durable record of a body of work

A **campaign** is a named body of work, and the outer object every other record sits
under. One install may run several side by side: each `project_root`, `team_roster` and
session belongs to exactly one, and a workbench may show one, any selected set,
or all of them. A view is a projection and never ownership — selecting or hiding a
campaign changes what a browser draws and stops nothing on the box.

The durable record behind the word is the **`campaign_config`**, and `src/campaign-config.ts`
is the one writer of it. This page is that object: where it lives, what validates, what the
API is, and what the migration did to installs that predate it.

> **Campaign is user-visible only once more than one can exist.** An install with a single
> campaign says nothing about it, which is why the word cost nobody anything for the first
> year of Ronin.

## The record

One JSON file per campaign under the `campaigns` store — user scope, so an uninstall
leaves it (`src/stores.ts`, and `bin/ronin-store campaigns` gives bash the directory).

| Field | Means |
|---|---|
| `id` | Stable lowercase token — the storage and URL identity. **Immutable.** |
| `title` | Readable and editable. The id does not follow it. |
| `description` | Readable and editable. |
| `desk_profile` | Last desk-profile template applied; provenance, not a live reference. |
| `desk` | Campaign-owned effective skin, theme, lexicon, campaign kind, RIREKI view, Team arrangement and future defaults. |
| `state` | `active` or `archived`. **Archive hides and kills nothing.** |
| `created_at` | Stamped once at create. Provenance and list order only. |
| `config` | A typed bucket — `agent_defaults`, `cowork_defaults`, `template_defaults`. |

**The id is the filename and is not repeated in the body.** One home for one fact: a body
carrying its own id could disagree with the file it sits in, and then neither tells the
truth. `readCampaign()` takes the id from the filename, always.

**`id` and `created_at` are the two immutables, and they are immutable for different
reasons.** Every `campaign_id` on a roster, root, template and live session points at the
first, so renaming one would be a migration rather than a save — the edit door refuses it
BY NAME rather than ignoring it, because a caller sending one has a wrong model of the
object and that is worth saying out loud once. The second is provenance: it identifies the
campaign the migration seeded, and **it is not a "default campaign" pointer** — nothing may
read it as one, and no surface can set it.

**It owns no lists.** Rosters, roots, templates and sessions point back with `campaign_id`;
none of them is embedded here. Asking *what is in this campaign* is a question for those
surfaces, filtered by id.

### What validates

- An id is `^[a-z0-9][a-z0-9_-]{0,63}$` — lowercase, boring, typeable, and it excludes
  `/`, `.` and whitespace, so no id can address a path outside the store. An invalid id is
  never turned into a path read: the check happens before the filename is built.
- A title becomes an id **once** — at create, or at migration — through `campaignIdFrom()`,
  which slugs it and falls back to `ronin` when nothing usable is left. After that the id
  is frozen and the title is free to change.
- `config` merges per sub-bucket rather than replacing the whole bucket, so a caller that
  knows about one cannot silently drop another it has never heard of.
- A half-written record degrades to a readable campaign rather than throwing: unparseable
  reads as `null` and is skipped in the list, a missing title falls back to the id, an
  unknown state is `active`, and an array where a bucket belongs is an empty bucket. The
  file is under the user's own root and a person may edit it.

## The API

`src/routes/campaigns-api.ts`. It serves the record and **no membership of any kind**.

| Route | What it does |
|---|---|
| `GET /api/campaigns` | Every campaign, archived included. `?state=active` is the ordinary filter. |
| `GET /api/campaigns/:id` | One record, or 404. |
| `POST /api/campaigns` | Create. 201 with the whole record; 409 when the id is taken. |
| `PUT /api/campaigns/:id` | Edit the stated keys. `id` and `created_at` are refused. |
| `POST /api/campaigns/:id/archive` | `state: 'archived'`. Un-archive is `PUT` with `active`. |

**The list order is `created_at`, then `id` to break a tie.** A directory has no order of
its own, and two surfaces listing one install must agree.

**An empty list is an answer, not an absence.** A client paints its empty state on `[]`,
and falls back to a compatibility synthesis only when the route is unreachable.

**Create saves the campaign and stops** (owner, 2026-08-29). It writes one record and
returns it whole, so a client has the id it needs to select without a second round trip. It
creates no Cowork, no `team_roster`, no `project_root` and launches no session — and that
is true by construction rather than by care, because the module imports none of those
stores.

**There is no delete.** Nothing on a button deletes a record other objects still point at.

### Fresh-install population

`FRESH_CAMPAIGNS` in `src/campaign-config.ts` is the declarative collection installed
when the Campaign store is empty. It contains one object today: stable id `ronin_home`,
title `Ronin Home`. SETTEI ensures that record exists before it answers Atarashi, so the
setup seat receives a real Campaign object rather than synthesizing one. Existing installs
keep their previously named Campaign unchanged, and the collection is never a mutable
"default Campaign" pointer.

## The SETTEI boundary

Before 2026-08-29 the install's one implicit campaign lived in `ronin.json` as
`campaign.{name,description}` with `desk.profile` beside it — two keys describing a body of
work, in the file that describes the *machine*. They moved here. What did **not** move, and
the rule that decided it: only settings that semantically vary with the body of work.

| Moved to `campaign_config` | Stayed in `ronin.json` |
|---|---|
| campaign name and description | owner, authentication and passkeys |
| `desk_profile` | machine name, where, and its monitor |
| | `sessions.max`, `agents`, `gbrain` |
| | the want list, and the first-run stamp |

**One writable record, structurally.** The legacy accessors were re-pointed onto this store
rather than kept in parallel: `src/machine-settings.ts`, `src/routes/machine-settings-api.ts` and
`src/desk-profiles.ts` each changed one import and nothing else, so `GET /api/machine-settings` still
serves the same `set.campaign` and `set.desk` shapes a client has always read — from a
different home. `PATCH /api/machine-settings` and `PATCH /api/machine-settings` still work and now
land in the initial record.

The dependency runs **one way** — `campaign-config.ts` reads `user-config.ts`, never the
reverse. That is what keeps `check-modules` free of a cycle, and it is what makes "no second
writable campaign record" a fact about the import graph instead of a convention.

## The migration

`ensureInitialCampaign()`, called at boot beside `stampFreshInstall()` and best-effort for
the same reason: a store we cannot write is a different failure, and throwing there would
cost the whole boot.

1. Derive one id from the install's current campaign name. An install that never named
   one — every fresh install — is born with the one home Campaign, `ronin_home`, titled
   "Ronin Home" (owner, 2026-08-30); the name is free to change afterwards. **On a box
   whose owner named their campaign, the id is derived from that name, never hard-coded**,
   and anything assuming a literal id is wrong there.
2. Create the record from that name, description and `desk_profile`.

**Idempotent by existence, not by a flag.** If the install has any campaign — archived ones
included — the migration has already happened and it returns that one untouched. So it is
safe on every boot forever, it cannot resurrect a campaign the owner archived, and it
cannot manufacture a second on a box that already has several.

**The old keys are read once more, never written, and not deleted.** They are the seed and
nothing else; after it they are inert. Removing them belongs with the removal of the old
writable surface, so that there is never a release in which the data is gone and the reader
that replaced it has not yet proved itself.

`initialCampaign()` answers which record the migration seeded — earliest `created_at`,
**archived ones included** — and is the seam an unmarked `campaign_id` maps through during
the compatibility window. It is a function rather than a file anyone else reads, so storage
formats stay behind their own module.

## Where the rest of it lives

- `KOTOBA.md` — the `campaign` and `campaign_config` rows.
- `docs/desk-profiles.md` — what a `desk_profile` decides.
- `docs/settei.md` and `docs/user-config.md` — the install record, and what is still in
  the owner's config file.
- The store table is `src/stores.ts`, mirrored for bash in `bin/ronin-store`, with
  `scripts/check-stores.mjs` holding the two identical.
- `docs/api-surface.html` — every door into Ronin, these routes among them.
