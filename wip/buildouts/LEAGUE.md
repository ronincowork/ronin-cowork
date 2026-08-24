# LEAGUE — Eye 1 build-out

## Goal

**In the owner's words:** *"Own Eye 1: League and application-shell integration. Audit the
League surface against those contracts; produce a bounded implementation plan, file/seam
inventory, state/API dependencies, responsive behavior, and acceptance journeys. Preserve
full-card Team navigation, global roster show/hide, separate session bubbles, many-to-many
membership, and Unassigned."*

Narrowed by ruling (owner, 2026-08-23): *"Workspace Kit remains a separately supervised
foundation workstream; you consume its contracts and own League integration only."*

So: **League is one registered destination that renders the Team board and owns Team/session
membership from that board.** It does not build a shell, a router, a persistence layer, a
terminal, or a launcher. Where League needs something from the shell, this document names it
as a dependency on the Workspace Kit owner rather than building a local substitute.

## CURRENT STATE / RESUME HERE — 2026-08-23 17:36Z

Written for a session that wakes with none of this in context. Facts only.

### Completed behaviour (built, in the working tree, verified — see *Verification* below)

League is registered as a Workspace Kit destination at `#/league` and renders the board:
durable Team cards, **empty** durable Teams, **tag-only** Teams, and the **Unassigned**
holding area. Archived rosters are hidden. Board order is durable → tag-only → Unassigned
last; within a Team, sessions with no `session_role` sort last. The whole Team card
navigates to `#/team/<name>`; **Unassigned takes no action and renders as an `<article>`,
not a `<button>`**. One League-level control shows/hides every roster together, persisted
per browser tab in `views.league.rostersVisible` via the Kit's `patchViewState` (null =
shown, and null is a valid state). A dotted New Team card links to `#/new-team`. Lead is
shown on a bubble where present; a blank `session_role` draws no stand-in mark.

### Files Eye 1 owns (the complete list)

```text
public/js/teams-store.js     the shared session/team projection; reads only, writes nothing
public/js/league-board.js    board, cards, bubbles, toolbar
public/js/league-view.js     the registered destination + per-view state
public/css/league.css        namespaced under #league, tokens only
```

Baseline md5s were taken at 16:29:39Z and stored outside the repo. **`league-view.js` has
since been edited by someone else** — `title: () => 'League · ronin'` became
`title: () => 'League'`. One line, deliberate-looking, left as found. The other three are
byte-identical to baseline.

### Shared seams touched

**`public/js/main.js` — exactly two lines, and nothing else anywhere:**
- an `import { createLeagueView } from './league-view.js';`
- `guard('register the League destination', () => workspace.register('league', createLeagueView()));`
  placed **before `workspace.start()`** so a direct `#/league` entry resolves rather than
  falling back to Sessions.

`main.js` is subject to **silent whole-file clobbering** — four sessions read-modify-write
it and last writer wins, with no conflict and no error. `check-dead` stays **green** through
a lost registration; **`check-modules`** is the gate that catches it ("X.js is orphaned").
**Re-grep both lines before assuming they are there.**

No other shared file was edited. `index.html` and `public/style.css` were **not** touched —
League links its own stylesheet from its own module at mount.

### Uncommitted

**Everything.** Nothing of Eye 1's is committed; HEAD is `989daa5`. All four owned files are
untracked, and the two `main.js` lines are part of that file's modified state. The owner
instructed (2026-08-23): **do not commit the shared tree — root is integrating all preview
slices centrally.**

### Verification actually run, and against what target

- `check-modules` **exit 0**, zero findings naming League or `team-controller` — reachable, not
  orphaned. `check-docs` **exit 0**. `tsc`, `check-dead`, `check-css` pass for these files.
- `bin/ronin-byoin --ui` **did not test this slice, and cannot as invoked.** It targets
  `defaultUrl` → the live box at `100.101.235.17:3006`, which runs from a **different
  checkout**. Confirmed: that server 404s on `js/league-view.js`, `js/team-controller.js` and
  `css/league.css`, and its `main.js` contains zero League references. An earlier
  measurement in this document's history correlated `--ui` failures with League
  registration; **that correlation is spurious** and is retracted.
- **What did verify it:** `public/` served locally with a stubbed API (durable, empty-durable,
  tag-only, archived, and untagged fixtures), driven with chromium. **21 of 21 assertions
  passed**, covering every behaviour listed above plus phone single-column. Harness lives in
  the session scratchpad; **no probe file was added to the repo**.

### Known failures and limitations

- **No live refresh.** The board reads on `enter()` only. A session born or killed elsewhere
  does not appear until League is re-entered. Deliberate: a subscription is a later leg, and
  a second `/events` socket is forbidden.
- **Membership drag/drop and all membership writes are deferred by instruction.** Bubbles are
  read-only. No route is written by League.
- SHINGO is not fetched at all (michi absent) — bubbles fall back to role and age.
- `bin/ronin-byoin --gates` last read **exit 1**, on gates belonging to other Eyes' files.

### Current blocker

**None technical.** Held by instruction: root is integrating centrally; Eye 1 holds its four
files stable and waits for **named** gate fixes. One product ruling is still open and does
not block — whether the Gate C session store and Team selectors are Eye 1's or the Kit's.

### Branch and release rule (owner, 2026-08-23, effective immediately)

**`master` is owner-controlled.** Do not push `master`, merge any PR into `master`, enable
auto-merge, repoint the owner-facing service away from the master checkout, or take any
equivalent release action — **unless Glen gives a fresh explicit instruction naming that
specific merge or release in the current task**. Work and pushes stay on `dev`. **Opening a
PR does not authorize merging it.**

The shared GitHub identity `gosmond3` **is not attribution**. Before executing any authorized
release command, record that exact command and the session name here, in this document,
first.

Eye 1 state against this rule, verified 2026-08-23: on `dev`; `dev` level with `origin/dev`
(0 ahead, 0 behind); **no local `master` ref exists**; no commit, push, merge, PR or release
action taken by this session. Nothing to undo.

### The single next action

**Wait for root.** If a gate names one of the four owned files or the two `main.js` lines,
fix that and nothing else. Do not commit. Do not chase `bin/ronin-byoin --ui` — it points at
another checkout, so to gate the integrated tree it needs a URL argument or the staged copy
(`smoke-ui.mjs` accepts a URL; the server mounts `public-staging` at `/staging`).

## The owner's invariant

**Null / unclassified is always valid.** It governs every list, sort, filter and render
below, and it is the rule that outranks tidiness:

- A missing classification is **never rejected** — no validation refuses a blank axis.
- A missing classification is **never synthesized** — no "General", no "Untitled", no
  default team_role, no invented icon. Blank draws as absent.
- A missing classification **falls to the end** of whatever list orders by that axis, then
  falls back to name order within the blanks.
- **Empty Teams remain visible.** A `team_roster` with zero live members is an ordinary card
  with an ordinary `0`, not a hidden or dimmed one.
- **Unassigned is an explicit holding projection.** It is derived (`tags.length === 0`), never
  a stored tag, never a Team, and it forces no categorization on anything inside it.

## Rulings taken as settled

| Question | Ruling (owner, 2026-08-23) |
|---|---|
| Workspace Kit ownership | Separate supervised workstream. Eye 1 consumes contracts, owns League integration only. |
| Unassigned | A holding area and drop target. **Not** a navigation destination and not a fake Team. |
| `Teams ▾` dropdown | Belongs to Team workspace chrome. Not a League control, not global. |
| Archived Teams | Hidden in v1. |
| Tag-only Teams | Represented compatibly — shown, not dropped. |
| Lead in bubbles | Shown when present. |
| SHINGO absent | Plain role/status fallback. |

## Audit — the reviewed League Surface against the contracts

Read against `wip/buildouts/FIVE_EYES.md`, `wip/buildouts/WORKSPACE_KIT.md`, the landed
`src/team-rosters.ts` / `src/routes/teams-api.ts` / `src/routes/sessions-api.ts`, and the
reviewed artifact at `http://100.101.235.17:8099/five-eyes.html`.

**The served artifact is byte-identical to `ronin-lab` commit `f9510ef`** — the reviewed
commit. There is no drift between what was reviewed and what was audited. This was verified
by diffing the served bytes against the working tree; the fixture was **not** opened in a
real browser, because there is no browser on this box. Composition and script behaviour were
read from source.

### Where the fixture and the contracts agree

Whole-card Team navigation (head and objective are both click targets on one card), the
single `Hide rosters` / `Show rosters` toolbar control, session bubbles as separate objects
beneath the card, copy-semantics drag (`effectAllowed = 'copy'`, source row cloned, other
memberships untouched), the red `×` removing one membership and re-projecting the session
into Unassigned if it was its last, dropping onto Unassigned clearing every real membership,
`Unassigned` drawn with the ordinary card treatment, and the dotted New Team card.

### Discrepancies and how each resolves

1. **Dead per-Team roster toggles in the fixture source.** The markup carries
   `.roster-toggle` buttons ("View roster · 3"), a `.league-members.closed` class and a
   click handler for them — which would contradict *"there are no per-Team roster
   disclosure buttons."* They are inert: the script's first statement removes every
   `.roster-toggle` on load, and `.league-members.closed { display: grid }` neutralises the
   closed state. **The reviewed page matches the contract.** This is residue from an earlier
   draft. → Reported to `@view_mgr` so it is not ported forward. No production carry.

2. **Unassigned was clickable in the fixture.** Its head is a plain `<div>` with no
   `data-go`, but the delegated handler catches any `[data-league-team]` card and navigates
   to Team — so the rendered fixture *did* open a Team view from the Unassigned card.
   → **Ruled: Unassigned is a holding area and drop target, not a destination.** Production gives
   the Unassigned card no navigation affordance and no click-to-navigate; its only
   interactions are drop, and the roster bubbles inside it.

3. **`Teams ▾` scope.** Fixture shows the `#team-context` block only inside the Team view.
   → **Ruled: Team workspace chrome.** Out of Eye 1's scope entirely; League does not draw it.

4. **Lifecycle eyebrow vs. the stored field.** The fixture's "Active Team" / "Resting Team"
   eyebrow is not `team_roster.state` (which is only `active | archived`) — "Resting" means
   *active roster, zero live members*. → Production derives the eyebrow from
   `(state, live member count)`. Archived rosters are filtered out in v1, so the axis reduces
   to **live members > 0 → "Active Team"**, **live members === 0 → "Resting Team"**, and the
   holding projection's fixed **"Holding area"**.

5. **Tag-only Teams are absent from the fixture — and they are the majority case today.**
   `GET /api/teams` derives Teams from live session tags; `GET /api/team-rosters` lists only
   durable rosters. A tag with no roster is a real Team. → Production draws it as an ordinary
   Team card with no objective, no `team_role` and no wipeboard link — the null invariant
   applied to a whole card. It sorts after every rostered Team and before the holding area,
   and it is navigable, since there is a live Team behind it.

   **Measured on this box, 2026-08-23:** four live Teams — `buildout`, `five-eyes`,
   `viewers`, `walk` — and **one roster**, the `five-eyes` record in the team_rosters store
   (outside this repo, so no path is quoted), which exists only because it was
   made for this rollout. Three quarters of the Teams here have no durable record, and one
   session carries no tag at all, so the holding area is non-empty too. That is the board
   League actually has to draw today, and it is a better acceptance fixture than anything
   invented: one rostered Team, three tag-only, a populated Unassigned. (Independently
   measured by `@eye_team` and re-run here.)

   **This is not an edge case.** `/api/launch` accepts a distinct `team` key that drives
   roster resolution (`src/routes/launch.ts:69`), but the shipped launcher never sends it —
   `public/js/launcher.js:565` sends the chosen Team as `tags: [name]` and nothing else. So
   **every Team created through today's UI is tag-only**: no roster, no `team_role` reading
   shelf, no objective. On any existing box the tag-only card is most of the board, not a
   compatibility footnote, and it must be as complete and unapologetic as a rostered one.
   (Raised by `@eye_new_team` as their item 12 from the authoring side; verified here.)

   **And it does not expire.** When the launcher is fixed to send `team:`, *new* Teams start
   arriving rostered — but `resolveForm` (`src/spawn.ts:284-288`) throws on a Team with no
   roster, so the fix changes what happens next without retroactively giving the existing
   tag-only Teams a durable record. They stay tag-only until someone walks an adoption door,
   and nothing forces anyone to. The tag-only card is therefore a permanent state of the
   domain, not a migration-era accommodation to be deleted later, and League must not build
   it as temporary. (Sequencing consequence identified by `@eye_team`. Verified here — belatedly: this document cited `spawn.ts:283` for two turns on an inherited line number without opening the file, and :283 is the roster *read*; the throw is :284-288. The code's own comment states the doctrine: *"being born ONTO a team is a launch fact and deserves the durable half to exist; joining a tag-only team afterwards is the tags route's ordinary business."*)

6. **A roster may legally be named `unassigned`.** `isValidTeamName('unassigned')` returns
   true, so a real `team_roster` can collide by name with the holding projection. This is a
   genuine domain hole, not a UI one. → Reported to `@view_mgr`. League's own defence: the
   holding projection is keyed by a sentinel that is not a team name, never by the string
   `unassigned`, so the board stays correct even if the collision is never closed upstream.
   A roster actually named `unassigned` would draw as an ordinary Team card beside the
   holding area, which is confusing but not wrong.

7. **Bubble readings assume SHINGO.** "SHINGO 7.2 · now" is a `michi` ROW-socket field; the
   free build has none, and the standard-states rule says an unavailable optional service
   stays opaque and unfetched. → **Ruled: plain role/status fallback.** See *Bubble readings*.

8. **No touch or keyboard path to membership.** The fixture uses HTML5 drag events only.
   → Mine to design. See *Responsive behaviour*.

9. **Objective has no truncation rule.** `objective` is capped server-side at 2000 chars;
   the fixture renders it whole in a `min-height: 72px` box. → Production clamps to a fixed
   line count with the full text in the accessible title. A blank objective renders as an
   empty region that keeps its height, because that region is also the card's drop target.

10. **`team_role` renders as text — and that is landed doctrine, not an Eye 1 decision.**
    `GET /api/team-roles` exists, but stock `ronin_catalogs/team_roles/` ships **only a
    README**, and zero is the *permanent* stock state rather than a shelf awaiting filling:
    *"The house ships none: a `team_role` is the owner's own vocabulary for their teams, and
    a stock guess would be furniture."* The same README then states League's rule outright,
    naming this Surface:

    > *"A roster may name a `team_role` with no file here. The reading shelf is then simply
    > empty; **the name still renders on the League** and the roster. Blank is valid
    > everywhere in this house, and an empty `team_role` is a label the owner has not yet
    > made mean anything."*

    → League renders `team_role` **as its own text** and does **not** fetch
    `/api/team-roles` in v1. For every roster that exists today — including `five-eyes`'
    own `development` — a fetch would cost a request to learn nothing, and synthesizing a
    mark for an undefined role would break the invariant. Blank draws as absent.

    Drawing a defined role's `icon`/`label` is a strict post-v1 enhancement and the only
    reason League would ever fetch that route. The text floor stays correct either way.
    (Raised by Eye 1, independently verified and strengthened by `@eye_customize`, whose
    Customize matrix moved a row on it — a read-only Surface over a shelf that is empty by
    design is a dead section.)

11. **Two title writers.** `state.js:190` writes `<first tile> · ronin` on every
    `saveState()`; `workspace.js:154` writes the active view's title. Both are still live, so
    whichever ran last wins. → Title policy is the Kit's by contract. Named as a dependency,
    not fixed here.

## Legs

Each leg is independently landable on `dev` and independently reviewable. Legs 1–2 are the
foundation League needs; 3–5 build the board itself; 6 is the reconciliation.

### Leg 1 — Team projection (Gate C)

A view-neutral module publishing the four named selectors from `FIVE_EYES.md` Gate C:

```text
teamsFromState(state)          → ordered Team descriptors, rostered ∪ tag-only, archived removed
membersOfTeam(state, team)     → ordered live sessions carrying that tag
unassignedSessions(state)      → live sessions with zero tags
sessionBelongsToTeam(s, team)  → membership predicate
```

It reads, never writes, the existing session truth (`S.sessions`, whose one writer stays
`reconcileSessions` in `public/js/api.js`) plus a cached `GET /api/team-rosters`. It
subscribes to change rather than polling. Eyes 2 and 4 consume it.

> **Gate — confirm before this lands.** The Eye 1 charter and Gate C both assign the
> canonical session store and Team selectors to Eye 1, but the narrowing ruling says
> "League integration only". This leg is planned as Eye 1's on the strength of the charter.
> If `@view_mgr` rules it into the Workspace Kit instead, the module moves with **no API
> change** — nothing in Legs 3–5 depends on where it lives.

**Ordering, per the invariant:** rostered Teams by name; then tag-only Teams by name; then
the holding projection, always last. Within a Team, members with a `session_role` by role
then name; members with a blank `session_role` after them, by name. Nothing is dropped for
being blank.

### Leg 2 — Membership writes

One module owning every membership mutation, because `POST /api/sessions/:name/tags`
**replaces the entire tag list** — every add and remove is a read-modify-write, and a naive
one loses a concurrent change.

- read current tags, apply one delta, write, reconcile from the response (the route returns
  the saved list — that is the truth, not the optimistic value);
- serialise writes per session so two rapid drags cannot interleave;
- optimistic render with rollback on failure, matching the pattern already in `roster.js`;
- `addToTeam` / `removeFromTeam` / `clearAllTeams` (the Unassigned drop), where
  `clearAllTeams` writes `tags: []` — **it never writes a tag named `unassigned`**;
- surface the `notices` the route returns (wipeboard join/leave posts fire as a side effect
  of the tag write, and clearing several memberships at once fires several).

`public/js/roster.js` (the Commons ⌂ Roster room) has its own copy of this logic. **It is not
touched in v1** — converting it is offered as a later slice, not forced, because Commons
extraction belongs to the Kit.

### Leg 3 — LeagueBoard, cards and bubbles

The board itself, composed from the Kit's `Card` primitive rather than a private visual
system: `TeamCard` (identity, eyebrow, working context, objective, count pill) with the whole
box as the navigation target; the separate bubble list beneath it; the dotted New Team card
last, handing off to the `new-team` destination.

**One structural constraint, and it is not cosmetic.** `createCard({action})` renders a
`<button>`. Session bubbles carry their own buttons (the red `×`, the membership affordance),
and a button cannot nest inside a button. So **the bubble list is a sibling of the Team card,
never a child of it** — which is also exactly what *"session bubbles are visually and
behaviorally separate objects"* asks for. The reviewed fixture is built this way already
(`.league-members` sits beside `.league-team-head` and `.league-objective`, not inside them).
The contract, the primitive and the fixture agree; this note exists so the composition is not
"simplified" into nested buttons later.

The Unassigned card takes **no `action`** — by ruling it is a holding area, so it renders
as the `article` form of the primitive, not the `button` form. That makes the ruling
structural rather than a suppressed click handler.

Standard states, in the Kit's language: loading (before the first roster+session answer),
genuine empty (no Teams and no live sessions), stale-but-usable (a failed refresh keeps the
last board and labels it), failed load, and zero-Team (rosters answered, none exist — the
dotted card alone, which is the correct fresh-install face).

### Leg 4 — Membership interaction

Drag/drop with copy semantics on pointer devices; the equivalent non-drag path on touch and
keyboard (see *Responsive behaviour*); the red `×`; drop-target highlighting; and the
re-projection rule — a session whose last real membership is removed appears under the
holding area on the next projection, without a second write.

### Leg 5 — Shell integration

Registering `league` with the Kit runtime and consuming its navigation for the Team,
New Team and (compatibility) Sessions destinations. Small and mostly a list of asks — see
*Dependencies on the Workspace Kit*.

### Leg 6 — Reconciliation pass

Read the board against this document and the two contracts once it renders with live data,
and post remaining discrepancies to the `five-eyes` wipeboard.

## File / seam inventory

### New — Eye 1's own, no other Eye edits them

**Flat, with a prefix — not a subdirectory.** `public/js/` holds 63 modules and **no
subdirectories at all**; the Kit's own new files follow the same rule with a shared prefix
(`workspace-primitives.js`, `workspace-layouts.js`, `workspace-kit.js`). This inventory
planned league and teams subdirectories under public js until that was checked — named here
as prose, because they do not exist and a backticked path would assert that they do. The names below
now match the house convention. None of them exists yet.

**Measured, not assumed:** stripping every `[planned]` marker from this document and re-running
`check-docs` produces **exactly two failures, both in prose, none in this fenced block.** So
only two of the three markers are load-bearing; the one on this line is inert, because the
fence is invisible to the gate in *both* directions — it cannot fail, and marking it cannot
help. A fenced inventory reads as the most rigorous part of a document and is the part least
checked. Read these names by eye; no gate will. (Break-it-on-purpose method from
`@eye_agent_config` via `@eye_customize`, run here on this file.)

Worth recording *how* that slipped: these paths sit in a fenced block, which `check-docs`
exempts by design, so the gate could never have caught them. **A gate only reads the claims
you make** — the fence made a wrong convention invisible, exactly as naming no files at all
would have. (`@eye_team`'s framing; the flat-`public/js` check is `@eye_agent_config`'s.)

```text
public/js/teams-store.js        Leg 1 — projection + the four selectors  (gated, see Leg 1)
public/js/teams-membership.js   Leg 2 — the serialised tag read-modify-write
public/js/league-view.js        Leg 5 — the registered destination: mount/enter/leave/destroy
public/js/league-board.js       Leg 3 — LeagueBoard composition and standard states
public/js/league-teamcard.js    Leg 3 — TeamCard from the Kit Card primitive
public/js/league-bubble.js      Leg 3 — session bubble + readings + fallbacks
public/js/league-dnd.js         Leg 4 — pointer drag, touch sheet, keyboard path
public/css/league.css           Leg 3 — all League CSS, namespaced under the view root
```

### Shared — read, not edited, by Eye 1

| File | Why it is touched, and how far |
|---|---|
| `public/js/state.js` | Read `S.sessions`, `S.services`, `serviceMissing`, `S.workspace`. **No new writer.** |
| `public/js/api.js` | `reconcileSessions` stays the one writer of the session list. Store subscribes; it does not replace. |
| `public/js/events.js` | Source of live membership change (`/events` carries tags, leads, `session_role`). Its Tile-mutating behaviour stays for now — Gate C's "events do not directly attach or detach global tiles" (quoted as written) is a Kit-era cleanup, not something League forces early. |
| `public/js/roster.js` | Overlapping membership UI in Commons. **Untouched in v1.** |
| `public/js/workspace.js` | Kit's runtime. Called (`register`, and the `navigate` / `patchState` / `back` handed in on the view context), never edited. |
| `public/index.html` | Needs a League view root and one stylesheet line. **Kit's file — an ask, not an edit.** |
| `public/style.css` | One `@import` for `public/css/league.css` [planned], matching the existing xterm layered-import pattern. **Kit's file — an ask.** |
| `public/js/workspace-kit.js` | The one Gate A hand-off. League imports `WorkspaceKit` and nothing beneath it. |
| `public/js/tile.js`, `layout.js`, `commons.js`, `desk.js` | Out of scope entirely. The compatibility Tile grid stays usable and untouched. Commons/Configuration extraction is the Kit's — `WorkspaceKit.adapters` already carries its seams. |

### Server

**Eye 1 v1 needs no new backend routes.** Everything the board requires already landed. This
is deliberate scope discipline: if a leg starts wanting a route, that is the signal it has
drifted out of Eye 1.

## State and API dependencies

### What League reads

| Source | Gives | Cost |
|---|---|---|
| `GET /api/team-rosters` | durable Teams: `team_role`, `objective`, `project_root`, `repos`, `branch`, `wipeboard`, `wipeboard_exists`, `state` | one fetch, cached, refreshed on Team lifecycle events |
| `/events` websocket | live push of `{name, tags, leads, session_role, created, …}` on membership change | already open, 2s server poll, change-gated |
| `GET /api/sessions` | the same shape as a boot fetch | already fetched at boot |
| `GET /api/home` | `status`, `model`, `ctx`, plus ROW-socket fields (SHINGO) | **one `capture-pane` per session**; already polled at 8s while visible |

`GET /api/teams` and `GET /api/team-roles` are **deliberately not fetched** — see audit items
5 and 10. Two requests League does not make.

**Why `GET /api/teams` is not used.** It returns only tag→name and lead→name maps, and the
session list already carries `tags` and `leads` per session. Projecting client-side is one
fetch fewer and — more importantly — keeps the board consistent with the live event stream
instead of racing a second server-side derivation.

### What League writes

`POST /api/sessions/:name/tags` — and nothing else. No route writes a Team roster from
League in v1; roster editing belongs to Team Config (Eye 2) and New Team (Eye 4).

### Workspace state

League needs exactly one persisted field: **whether rosters are shown or hidden, per browser
tab.** The Kit's `ronin.workspace.v1` schema has no slot for it, and the contract forbids a
view inventing its own storage key. → Named as a Kit dependency below. Until it exists,
show/hide works for the page lifetime and does not persist; that degrades honestly and is not
a reason to invent a key.

### Bubble readings

Ruled: **lead when present, plain role/status fallback when SHINGO is absent.** Concretely,
each bubble draws from three tiers, and each tier is independently allowed to be blank:

1. **Free, off the event stream** — `session_role` mark (blank draws as no mark, never a
   synthesized icon), name, age from `created`, and the **lead designation** when
   `leads` includes this Team.
2. **Core enrichment, from `/api/home`** — `status` (`ready` / `thinking…` / `awaiting
   input`) and `model`. These are `capture-pane` scrapes, not a service.
3. **Service enrichment** — the SHINGO ladder position, only when `michi` is on
   `S.services`. Gated by the existing `serviceMissing('michi')`, so on the free build it is
   **not fetched at all**, per the standard-states rule.

Fallback order per bubble: SHINGO position if present → else status → else nothing beside the
age. A bubble that can say only its name and age is a valid bubble.

## Responsive behaviour

- **Desktop** — `repeat(auto-fill, minmax(265px, 1fr))`, as reviewed. Cards keep a stable
  minimum height so a Team with a blank objective is still a comfortable drop target.
- **Tablet** — same grid, fewer columns. Drag is retained; the touch path below is also live,
  because a tablet is both.
- **Phone** — one column. The board scrolls; cards never shrink below legibility.

**Membership without a drag handle.** HTML5 drag is unusable on touch and invisible to a
keyboard. One control answers all three: each bubble carries a membership affordance that
opens a **Teams sheet** — every Team as a checkbox (many-to-many, so several may be checked),
plus an explicit *Clear all memberships* action which is the drop-onto-Unassigned equivalent.
It is reachable by tab, operable by Enter/Space, and it is the same code path as the drag.
Drag remains the fast path on pointer devices; it is never the only path.

Keyboard focus order: toolbar → each Team card (one stop, since the whole card is one target)
→ its bubbles → the dotted New Team card. The Unassigned card takes no navigation stop —
it is a drop target — but its bubbles do.

## Dependencies on the Workspace Kit

Named asks, so no substitute foundation is built locally. Checked against the runtime as it
stands in `public/js/workspace.js` today, not as it stood when this audit began — the Kit
moved during the writing of this document.

**Already satisfied — League consumes these as-is:**

- **Navigation from inside a view.** `navigate` and `patchState` arrive on the context object
  handed to `mount` / `enter` / `title`. League reaches Team, New Team and the Sessions
  compatibility route through it and never touches `location` or `history` itself.
- **Legacy workspace migration.** `migrateWorkspaceState` already folds `tmuxgrid.sessions`
  and `tmuxgrid.layout` in, forgivingly. League inherits it and plans no migration of its own.
- **Return navigation.** `back()` is the shell-history return; League uses it rather than
  remembering a previous location.
- **Lifecycle containment.** `register` returns an unregister handle, `enter` fires only when
  the id or param actually changed, and every hook is wrapped so a League failure cannot take
  the compatibility Sessions view down. Journey 21 tests against this behaviour.

**Still outstanding:**

1. A registered view id `league` with a root element in the ViewHost, and one `@import` line
   for `public/css/league.css` [planned]. `#viewhost > [data-workspace-view]` styling already exists;
   only the element and the import are missing.
2. **One field in `ronin.workspace.v1` for League's `rostersHidden`.** Framed smaller than
   this document first had it: `@eye_team` pointed out the schema already provisions
   per-view state as **top-level fields** — the (pre-ruling, misnamed) `panes{left,kanban,right}` and
   `widths{left,right}` exist there for the Team workbench alone. So the ask is not a new
   namespacing mechanism, it is one more field provisioned the same way five already were.
   League must not add it itself; the contract forbids a view inventing storage.
   `@eye_new_team` carries the heavier version of this — League loses one bit and degrades
   honestly, while an unpersisted New Team draft loses an objective and every typed prompt.
3. One owner of `document.title`. Both writers are still live: `state.js:190` (`syncTitle`,
   fired from every `saveState`) and `workspace.js:154` (from the active view's `title`).
   Whichever ran last wins, which is not a policy.
4. **The `Card` primitive's remaining states.** The kit now hands off through **one
   reachable namespace** — `public/js/workspace-kit.js` exports a frozen
   `WorkspaceKit = { primitives, layouts, adapters }` over `workspace-primitives.js`,
   `workspace-layouts.js` and `workspace-adapters.js`. All four are **uncommitted**, and
   the export shape changed from bare named exports to frozen namespaces during the writing
   of this document — so this is a moving floor rather than a frozen gate, and League
   imports `WorkspaceKit` alone rather than reaching into the three modules. What is there
   already serves League: `createCard`
   supports heading, summary, mark, metadata, the dotted variant, and an `action` that makes
   the whole card one `<button>` — full-card navigation, satisfied by the primitive.
   `createPane` carries all six standard states, and `createLeagueBoard(cards)` exists.
   What is **not** there yet, and what Leg 3 needs:
   - `createCard` has only `selected`; the kit contract also promises **active, warning and
     stale** card states. League needs `stale` at minimum (a card surviving a failed refresh).
   - `createLeagueBoard` exposes **one region, `cards`** — there is no `toolbar` region for
     the global `Show rosters` / `Hide rosters` control. League will place the toolbar inside
     `cards` and span it, as the fixture did with `grid-column: 1 / -1`; a dedicated region
     would be cleaner but is not a blocker.
   - The board regions are plain `div`s with no `setSurfaceState`. League wraps the board in
     a `createPane` to get loading / empty / stale / failed / unavailable, rather than
     inventing a second state vocabulary. `@eye_customize` reached the same answer
     independently for Customize's lists — staleness is a property of a fetched list, not of
     one card — so **neither Eye is adding a card-state ask to the foundation owner's
     queue.** Two consumers converging is the answer.
5. Confirmation on Leg 1's home (Eye 1 vs the Kit).

Until each lands, League degrades honestly rather than working around it, and the working
around is what this list exists to prevent.

## Constraints

- **No code until the Workspace Kit freeze is announced** (owner, 2026-08-23). That is a
  named event, not a judgement call: not "the files look settled", not "the untracked modules
  stopped moving" — announced. This document is the deliverable until then.
- Eye 1 does not own terminal internals, customization APIs, launch orchestration, the
  `Teams ▾` chrome, or Commons/Configuration extraction.
- No second session store, no second terminal transport, no second launch payload.
- No view reaches into another view's DOM.
- No view invents a localStorage key.
- Feature CSS stays namespaced beneath the League view root; shared primitives change only
  through the Kit owner.
- The existing coworkspace stays usable throughout — the compatibility grid is not disturbed,
  and League is not made the default entry (that is Phase 5, and not Eye 1's call).
- Follow `docs/ui.md` and KOTOBA vocabulary. The user-facing words are **Team**, **League**,
  **Unassigned**, **roster**, **session** — no house Japanese reaches a user's face.
- **The foundation vocabulary, as ruled by the owner (2026-08-23).** This supersedes the
  earlier "pane is retired" note in this document. (`WORKSPACE_KIT.md` and `FIVE_EYES.md` have
  since been normalized to the same ruling, so they no longer disagree with it.)
  - **pane** — *only* the tmux object inside the tmux server. Nothing in the browser is a pane.
  - **Tile** — what Ronin renders session output into.
  - **Surface** — a larger coworkspace region, which *may* host a terminal Tile, a Kanban, or
    Channel services.
  - **Channel services** — Chat, Wipeboard, Docs, Team Configuration. Their contents are
    never called panes or panels.

  **The usage rule, recorded so it survives this document's author.** Fixing the instances is
  not enough: without the rule written down, the next editor has no way to know which word to
  reach for and the collision grows back.
  - **Surface**, capitalised, for the ruled region. **Destination** for a first-class view in
    the shell's route registry — League is both, and they are not synonyms.
  - **Ordinary English is kept**, including the *verb*: "surface the notices" stays. This
    is why the pass was done by hand, use by use — **a blanket sweep mangles the verb**, and
    it also silently rewrites quotations of the owner's and the contracts' own words.
  - Watch for phrases the promotion *poisons* without making wrong: "full-surface navigation"
    meant the whole card face and now reads as a Surface claim. Rewritten to "whole-card".
  (Structure and the survives-the-author argument are `@eye_agent_config`'s.)

  **League is a Surface — that is Eye 1's reading, not the owner's words**, and it is worth
  marking because League is the one place in the five that tests the definition. It hosts
  **none** of the three named hosts: no terminal Tile, no Kanban, no Channel service. It hosts
  Team cards and session bubbles. The ruling says a Surface *may* host those three, so hosting
  none is permitted and League is an ordinary Surface. But if the taxonomy is ever tightened to
  "a region *around* a Tile", League is the case that breaks it. Flagged rather than assumed.

  League writes this taxonomy in all prose, all class names of its own, and everywhere a
  person reads. **Two traps beyond the obvious grep.** First, `pane`/`panel` is the check that
  *passes while the model survives*: the old model hides in ordinary words the ban does not
  cover — "tab" is where it lives for anyone describing Channel services. **But do not sweep
  that word**: it has three uses and only one is wrong.
  - *browser tab* — per-tab persistence, a Team tab wearing the Team name. Untouched by the
    ruling, and the majority of hits.
  - *Commons tab* — **blessed house vocabulary.** `KOTOBA_GLOSSARY.md:47` says of
    `commons_tab`: *"One section of the commons, reached from its tab strip. Say the Roster
    tab, the Docs tab. **Never 'pane' or 'panel'**."* The glossary names `tab` as the right
    word in the same row that bans the other two. Sweeping these replaces correct vocabulary
    with something already ruled against.
  - *tab as the service itself* — the only wrong one.

  The cheap test: **reached by a tab is an affordance and is fine; *being* a tab is the old
  model.** "The Chat tab is selectable" describes how you get there; "the fourth tab is dead"
  says the service *is* a tab. League's three uses are all browser tabs and the Tab key,
  read individually rather than counted. Second, the ruling **promotes**
  `Tile` from a casual word to a defined noun, so League capitalises it where it means the
  ruled thing and leaves it lowercase only inside quotations of existing text and file names
  (`public/js/tile.js`, Gate C's "global tiles"). (First trap named by `@eye_new_team`, who found three in their own file after
  reporting it clean; the three-uses caveat and the affordance test are `@eye_team`'s, who
  checked the advice instead of adopting it and found the glossary blessing.) `capture-pane` stays as written: it is the tmux command, operating on the tmux
  object, which is the one place the word is still correct.

  **This collides with landed Kit symbols and that is now a Gate A item, not League's call.**
  `createPane`, `createChannelPane`, `setSurfaceState` and the `panes{}` field in
  `ronin.workspace.v1` all predate the ruling. League names them as symbols where it must and
  never adopts them as vocabulary; if the foundation owner renames them, League changes call
  sites and nothing else. (`@eye_team` filed the collision before the ruling; the ruling
  settles the direction, not the rename.)
- **Verification is `bin/ronin-byoin` only** (`docs/test-protocols.md`), and **League owes
  both repo tiers**. The page reached its present three modes at commit `3f2499c`, landed 2026-08-23 12:26
  — after this session began, so an earlier reading of it is stale. `--gates` is the ordinary
  developer / pre-push / PR mode; `--ui` is run "when a change can affect rendered UI,
  browser journeys, layout, or visual composition", which League is in every one of those
  four respects — a new destination, a card grid, drag and drop, and three breakpoints. So:
  `--gates` before landing on `dev`, and `--ui` before landing. Full `bin/ronin-byoin` is the
  installed-box tier and is not League's repo verdict to claim.

  **`--ui` is not an extra step for League — it is the only thing that looks at the views.**
  Verified: `.githooks/pre-push:37` runs `--gates`, `.github/workflows/verify.yml:46` runs
  `--gates`, and `bin/ronin-byoin:84-85` skips `smoke-ui` and `visual-ui` outright under that
  mode. So **no automated gate looks at rendered UI**: not the pre-push hook, not the PR gate.

  Two precisions, because this document twice told a cruder version. **CI never covered
  browser UI at all** — the comment `3f2499c` deleted said so: *"verify ends in the render
  check, which needs a live server and a real browser. A runner has neither, so
  `ronin-byoin --gates` SKIPs that one check with its reason and passes the rest."* Before the
  tiers, the runner skipped for want of a browser; after, it skips by mode. **The reason
  changed, not the coverage.** And **pre-push already ran `--gates`** (`3f2499c^:.githooks/pre-push:36`),
  so the hook is the one place coverage genuinely moved — and only for a developer whose
  machine has a headless browser, where `--gates` used to run those gates and now does not. This is deliberate, documented and **announced at runtime**, so nothing is
  broken and nobody left a gap. Three places say it: `.githooks/pre-push:23-25`,
  `.github/workflows/verify.yml:9-11`, and — the one that matters most —
  `bin/ronin-byoin:85`, which prints on every fast run: *"fast repo mode does not drive
  browser UI; run `bin/ronin-byoin --ui`"*. The command names its own gap and its own fix,
  every time it fires.

  **And the standing house rule already covers the rest:** *"A SKIP is not a pass"* —
  `docs/test-protocols.md:45`, and in the boot-shelf page at `:7`, which every session reads
  at birth. So a `--gates` run emits a SKIP naming `--ui`, and the rule every session was
  handed says that SKIP is not verification. Followed correctly, the boot page defuses this
  on the first run. This document earlier framed it as "documented but not enforced"; that
  was wrong in the same direction as everything else in this footnote, and is corrected here
  rather than quietly removed.

  **The one artifact that contradicts all of that is the CI step name.**
  `.github/workflows/verify.yml:45-46` at HEAD reads:

  ```yaml
  - name: BYOIN — every check, then one verdict
    run: bin/ronin-byoin --gates
  ```

  The step **name** asserts every check; the line under it runs the tier that skips browser
  UI. That name is what a person sees on a PR when deciding whether it passed. **So a green
  CI on a League PR proves nothing about the League views**, and the one place a reader looks
  says otherwise. (Found by `@eye_agent_config`, relayed by `@eye_team`; verified here at
  HEAD, both enforcement files clean.)

  Worth one more turn of the crank, because it changes who to blame and therefore what to
  fix: **`3f2499c` did not cause this.** Its diff to `verify.yml` rewrites only the comment
  block — the `run:` line already said `--gates`, and the step name is untouched. Before that
  commit `--gates` had *no* mode guard on the UI checks: they ran, and honestly skipped on a
  runner with no browser. So "every check" was defensible then and became misleading the
  moment the mode guard landed — in a file that commit edited, on a line it did not. Nobody
  wrote a false step name; a true one went stale two lines from an edit.

  What survives is only about the reader: the tier a hook runs is the tier a person assumes
  is sufficient, and four of five Eyes never opened either file — both of which were listed
  as modified in the first `git status` of this session. **League still owes a `--ui` verdict
  before landing**, and that conclusion never depended on the hazard being undocumented. But it means browser coverage for League is **manual-only**, and
  the instinct to reach for the tier the hook uses is exactly the instinct that leaves every
  rendered view unlooked-at. (Found by `@eye_team`, who overturned their own earlier
  "cost, never coverage" conclusion to get there; verified here against the pre-image.) No hand-rolled test sequence. A SKIP is reported as unverified, never as a pass.
  Browser review is design
  acceptance, not a test harness.

## Verification — acceptance journeys

**How to report a gate, before reporting one.** Three sessions produced a false green in one
afternoon, and every case had the same cause: **an instrument whose success and failure look
identical at the point of reading.** `tail -1` is blank either way; a no-match `grep` is silent
either way; a fenced path is exempt either way. **Prefer an instrument that must say something
to pass** — an exit code qualifies, silence never does. Then:
- **Capture once, report from the capture.** Running the gate for the exit code and again for
  the failure list reads *two different instants* and can contradict itself in one message.
- **Separate the two claims and vouch only for the stable one.** "`LEAGUE.md` is clean" is
  stable — Eye 1 is its only editor. "The repo is green" is a claim about four documents other
  sessions are editing right now; it is a reading of one instant and is stale before the
  sentence describing it is finished. (Both `@eye_team`'s, who caught the gate returning four
  different answers in ninety seconds.)

**Before any code: re-read `docs/test-protocols.md` from the repo.** It is short, it is the
whole contract, and it names three modes. **League owes `--gates` before landing and `--ui`
before landing** — `--ui` because the page says to run it "when a change can affect rendered
UI, browser journeys, layout, or visual composition", and League is all four. Full
`bin/ronin-byoin` is the installed-box tier and is not League's verdict to claim.

**`--ui` is the only tier that looks at these views.** `.githooks/pre-push:37` and
`.github/workflows/verify.yml:46` both run `--gates`, and `bin/ronin-byoin:84-85` skips
`smoke-ui` and `visual-ui` under that mode. **A green pre-push and a green CI prove nothing
about the League board.** The CI step is even named "BYOIN — every check, then one verdict"
(`verify.yml:45`) — that name is what a reviewer reads on a PR, and it is not true of the tier
beneath it.

Nothing here is broken and nobody left a gap: the trade is deliberate, documented at
`pre-push:23-25` and `verify.yml:9-11`, and **announced at runtime** — `bin/ronin-byoin:85`
prints *"fast repo mode does not drive browser UI; run `bin/ronin-byoin --ui`"* on every fast
run. The standing house rule closes it: **"A SKIP is not a pass"** (`docs/test-protocols.md:45`,
and in the boot page at `:7` that every session reads at birth). Followed correctly, the
briefing you were handed at birth defuses this on the first run.

<details>
<summary>Why this section is longer than "run two commands" — five corrections, kept visible</summary>

This document got the story wrong five times before getting it right, and the corrections stay
because a build-out that tidies itself teaches its next reader nothing.

1. It said the shelf summary "became false". **It is accurate but incomplete** — `:7` defines
   bare `bin/ronin-byoin` as "every repo check, every readout, then one verdict", which is
   exactly what the summary describes. Followed literally the shelf makes you *over*-verify.
2. It said `3f2499c` "added three modes". **It added one.** `--gates` already existed; that
   commit added `--ui` and redefined `--gates` as the fast tier. So "one command, one verdict"
   was the *correct developer instruction* until 12:26 on 2026-08-23 — which is why it
   propagated to four of five Eyes without anyone smelling anything.
3. It said the page's H1 proved the phrase current. It does — and `3f2499c` **kept** that
   title rather than writing it, which is the stronger reading.
4. It said the hazard was "documented but not enforced". **It is announced at runtime**, and
   "a SKIP is not a pass" was in the birth reading all along.
5. It said pre-push and CI "stopped" covering browser UI. **CI never covered it** — the
   deleted comment says a runner has no browser, so the render check always skipped, first for
   want of a browser and now by mode. And `pre-push` already ran `--gates`
   (`3f2499c^:.githooks/pre-push:36`). The only place coverage genuinely moved is a developer
   machine that *has* a headless browser.

The operational answer never changed through any of it: **run both tiers, quote both verdicts,
and treat every SKIP as unverified.**

One mechanism worth carrying, because it outlives this section: `src/session-boot.ts:237` —
"a role change is not a rebirth", the `all/`, root and `team_role` levels are read once at
birth, while the role level *is* "resolved at the moment of the change". So the
`DraftPlan → CutCode` switch that starts this work refreshes the `ronin_session_boot/role/`
level for the new session_role and leaves every
`all/` page exactly as it was. A running session cannot tell it is behind. Re-reading the real
page from the repo is the only thing that defeats that, which is why it is step one above and
leg 8.1 on the ladder.

</details>

Each is a browser-review journey. The repository verdict is `bin/ronin-byoin --gates` before
landing and `bin/ronin-byoin --ui` as the rendered proof — both, because League is UI work by
definition. Neither replaces the other and no journey below is a substitute for either.

**Board and the null invariant**
1. A Team with a blank `team_role` and a blank `objective` renders as an ordinary card with
   nothing synthesized in either place, and is a valid drop target.
2. A `team_roster` with zero live members is visible, ordinary, and reads `0` / "Resting Team".
3. A session with a blank `session_role` renders with no mark and sorts after its marked
   peers within the same Team.
4. A tag-only Team renders as an ordinary card with no objective and no `team_role`, sorted
   after every rostered Team and before the holding area.
5. An archived roster does not appear.
6. A fresh install with no Teams and no sessions shows the dotted New Team card and nothing
   else — the empty state, not a failure state.

**Navigation**
7. Clicking anywhere on a Team card — heading, working context, objective, whitespace — opens
   that Team. Clicking a bubble or a `×` does not.
8. The Unassigned card offers no navigation and does not navigate when clicked anywhere.
9. The dotted card opens New Team.

**Rosters**
10. One toolbar control switches every card's bubbles together; there is no per-Team
    disclosure button anywhere on the League Surface.
11. The choice survives a refresh in the same tab, and a second tab keeps its own.

**Membership**
12. Dragging a session onto a second Team leaves the first membership intact; the session
    then appears under both.
13. The red `×` removes one membership only. The session stays alive.
14. Removing a session's last real membership re-projects it into the holding area.
15. Dropping onto the holding area clears every real membership in one action, and the
    resulting wipeboard join/leave notices are surfaced.
16. Membership can be changed with touch only, and with the keyboard only, by the same path.
17. Two rapid membership changes on one session both survive — neither is lost to the
    whole-list replacement.
18. A failed membership write rolls the board back and says so; it does not leave an
    optimistic lie on screen.

**Liveness**
19. A session born or killed elsewhere appears or disappears on the board without a refresh.
20. A membership changed from Commons or from `tejun-team` reaches the board.
20a. A roster created for a name that live sessions **already carry as a tag** appears
    **born populated** — its bubbles are present the moment the card is, because membership
    is derived and was already true. The board renders it correctly with no special case.
    **This is the ordinary first use, not an edge case**: since every Team made through
    today's launcher is tag-only (audit item 5), giving one a roster is the migration path
    off tag-only, and it is how most rostered Teams will come into being. `@eye_new_team`
    reframed their stage 1 from a collision warning to an adoption on the same reasoning —
    their form must read as adopting an existing Team, and this board must show it arriving
    already staffed rather than momentarily empty.
20b. A tag-only Team and a rostered Team sit on the same board without the tag-only one
    looking broken, degraded or unfinished.
21. Navigating to a Team and back repeatedly adds no duplicate sockets, listeners, observers
    or polls.
22. A failed refresh keeps the last good board, labelled stale, rather than emptying it.

**Services**
23. On a build without `michi`, bubbles fall back to role and status, and the SHINGO field is
    **not fetched** — verified by the absence of the request, not by the absence of the text.
24. A lead designation is visible on the bubble of a session that leads that Team.

**Responsive**
25. Desktop, tablet and phone each render a usable board; nothing shrinks below legibility
    and the phone never depends on a drag handle.

**The live fixture**
26. The board as this box actually stands — one rostered Team, three tag-only, one untagged
    session in the holding area — renders correctly with no card looking damaged, no
    synthesized field, and the tag-only three indistinguishable in quality from the rostered
    one. This is the first journey to walk, because it needs no setup: it is simply what is
    there.

## Definition of done

- The six legs land on `dev` as small integrated slices — no long-lived Eye 1 branch.
- Every acceptance journey above is walked in a browser and its outcome recorded.
- No new backend route was added, no shared file was edited outside the named asks, and no
  second store, transport or storage key exists.
- The `roster-toggle` residue and the `unassigned` name collision are posted to `@view_mgr`,
  with their dispositions recorded here.
- The compatibility grid still works and League is not yet the default entry.
- `docs/test-protocols.md` was re-read from the repo at implementation start rather than
  trusted from the boot shelf.
- **Both repo tiers are clean once the work is complete** — `bin/ronin-byoin --gates` and
  `bin/ronin-byoin --ui` — and each verdict is reported as given, with any SKIP reported as
  unverified rather than passed. A clean `--gates` alone does not finish League, because
  `--gates` runs no browser UI and League is nothing but rendered UI.
- This document is deleted when the work lands.

## What an Eye 1 successor is born believing, wrongly

The session that implements this may not be this session, and a fresh one is born holding
facts from its birth reading, the two build-outs and the reviewed fixture — several of which
are superseded. `all/`, root and `team_role` reading is birth-only (`src/session-boot.ts:237`)
and nothing watches any directory, so **none of this can correct itself in a running
session.** Each row is verified in source; the detail is in the section named.

| Born believing | Actually |
|---|---|
| verification is one command, one verdict | Three tiers, and League owes **`--gates` and `--ui`**. The stale summaries are harmless — they name *bare* byoin, so following one over-runs. **The live risk is the opposite:** `--gates` is what the pre-push hook (`:37`) and CI (`verify.yml:46`) run, and it *skips* `smoke-ui` and `visual-ui` (`bin/ronin-byoin:84-85`). No automated gate looks at rendered UI — deliberately, and BYOIN says so at runtime (`:85`) every fast run. "A SKIP is not a pass" is the standing rule that covers it. `--ui` is manual and is League's only browser coverage — **a green CI proves nothing about these views**, though its step name says "every check". → *Verification* |
| the kit exports bare named functions | A frozen `WorkspaceKit = { primitives, layouts, adapters }`. The bare exports are **gone, not supplemented**. Consume that namespace alone. → *Dependencies* |
| `Unassigned` is a Team you can open | A holding area and drop target, ruled. It takes no `action`, so it renders as the `article` form of the card, not the `button` form — structural, not a suppressed handler. → *Audit 2* |
| the fixture's per-Team roster toggles are real | Inert — deleted by the fixture's own first statement. One League-level control switches all rosters. → *Audit 1* |
| a Team has a roster | Three of four Teams on this box are **tag-only**, and that is permanent, not transitional. The tag-only card is most of the board and must look complete. → *Audit 5* |
| the `Teams ▾` menu is League's | Team workspace chrome, ruled. League does not draw it. → *Audit 3* |
| `GET /api/teams` is the board's seam | Unused. The session list and the `/events` push already carry `tags`, `leads` and `session_role` per session. League adds **no backend route**. → *State and API* |
| `team_role` has definitions to render | Stock ships **zero**, permanently, by doctrine — and `GET /api/team-roles` has zero callers anywhere in `public/js/`. Render the name as text; do not fetch. → *Audit 10* |
| `role_family` is a live axis | Dismantled at R35. Presentation grouping only. |
| the browser has panes | **Superseded by owner ruling, 2026-08-23.** `pane` is *only* the tmux object inside the tmux server. Ronin renders session output into a **Tile**. A **Surface** is a larger coworkspace region that *may* host a Tile, a Kanban, or **Channel services** (Chat, Wipeboard, Docs, Team Configuration) — whose contents are never panes or panels. League is read as a Surface that hosts none of the three (Eye 1's inference, not the owner's words). `WORKSPACE_KIT.md` has since been normalized and now says Surface / terminal Tile / Channel services; this row stands for anyone holding an older copy. The landed Kit symbols predate the ruling; name them, do not adopt them. → *Constraints* |
| Eye 1 owns the session store, so launch-side routes too | No. The charter excludes launch orchestration **by name**. `POST /api/launch/preflight` was offered to Eye 1 and declined; it is Eye 4's. → *Still open* |
| archived Teams appear in League | Hidden in v1, ruled. |
| `write_tegami` merges what you send | It **replaces**, over five keys only — `ronin_bin/write_tegami:417`, `ALLOWED = {objective, session_role, repos, ladder_state, ladder}`. Three cases, and conflating them is how both traps get sprung: **(a)** omit `objective`, `session_role`, `repos` or `ladder` and you silently lose real content — three of five Eyes lost `repos` this way; **(b)** omit `ladder_state` and nothing is lost, because the source at :417 says "absent means `on_track`, so the normal case costs nobody a keystroke" — this is the default, not a drop; **(c)** include `docs`, `teams`, `at` or `role_family` and the **entire write is refused**, exit 3, each with its own printed reason (run this turn; the letter was untouched). So neither "send everything" nor "send exactly the five" is right — **send what you mean to state, of the four that hold content.** `docs` has its own two verbs precisely so a ladder rewrite can never drop it. Rebuild the block from `read_tegami`, and read it back after. |

## Still open, and owned elsewhere

- **Leg 1's home** — Eye 1 or the Workspace Kit. Blocks nothing until Leg 1 lands.
- **Document-title policy** — Kit. Two writers today.
- **The `unassigned` roster-name collision** — a domain guard, upstream of League. The
  creation path belongs to `@eye_new_team`, who refuses the name server-side in preflight;
  the `isValidTeamName` guard remains the upstream ask. League's sentinel key is an
  independent second line and holds either way.
- **`POST /api/launch/preflight` is not Eye 1's.** `@eye_new_team` asked for a route owner on
  the grounds that Eye 1 owns the session store. Declined: the charter excludes launch
  orchestration from Eye 1 by name, and League writes exactly one route. They have since
  claimed the dry-run resolve as their own preflight and `@eye_agent_config` has accepted it
  — settled between them, correctly, without Eye 1.
- **When League becomes the default entry** — Phase 5 cutover, owner's call, not Eye 1's.
