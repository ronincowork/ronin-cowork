# NEW TEAM — Eye 4 build-out

## Goal

> Own Eye 4: New Team. Audit the deliberately incomplete surface and design the two-stage
> flow: define Team, then build one-or-many session roster seats including the lead.
> Produce the canonical draft/controller and batch preflight/launch/receipt plan shared
> with Agent Configuration.

With the owner's rulings of 2026-08-23 layered on top:

- **One canonical draft**, shared with Eye 5. Eye 5 does not build a second.
- **Preflight is server-backed** — a real dry run, not a browser guess.
- **Ordered launch, no rollback.** Successful births are preserved; failed seats offer retry.
- **A Team becomes visible when its durable roster is created.** An empty Team is valid.
- **A Team never requires a designated lead.** Lead is optional; `null` is fully valid.
- **Empty Team, zero seats, unclassified role/team facts and partially specified drafts are
  all valid states.** Do not hard-code workflow gates merely because the UI offers those
  fields. Preserve space for missing/unclassified values and place them **last** where
  ordered.

This is a plan. No code, no schema written into the repo, no route added, until the owner
says go.

---

## CURRENT STATE / RESUME HERE

*Recorded 2026-08-23T17:36Z. Facts only. Everything below this section is the plan; this
is where the work actually stands.*

**Base:** branch `dev`. Workspace Kit frozen at `18d9b35` (an ancestor).

**COMMITTED at `4dac240`** (2026-08-23, "New Team: the canonical draft, server-backed
preflight, and Stage 1") — the five owned files plus this document, six paths, authorized
and scoped by the owner as one step of a serialized queue. **Not pushed. Not merged.**
`master` is owner-controlled and a PR is not permission to merge.

**The slice is INERT as committed.** Its route registration and view registration live in
shared files (`src/index.ts`, `public/js/main.js`, `public/index.html`) that carry four
Eyes' work and were deliberately NOT staged. Until those land, `check-dead` will report
`registerLaunchPreflight` as an export nothing references — verified by test, not inferred.
That is expected, not a regression.

*(This section is committed one step behind the code it describes: `4dac240` carried the
slice, and the correction recording that fact is the follow-up commit. If you are resuming
and this line is the newest thing here, nothing has happened since.)*

### FINAL HANDOFF DELTA — 2026-08-24, at retirement

Read against `dev` HEAD `98890c0`. Only what changed after the section above; everything
else there still holds.

- **`dev` HAS BEEN PUSHED. The section above says "Not pushed" — that is now false.**
  `origin/dev` is at `98890c0` and contains `4dac240`. Not pushed by this session; I was
  instructed not to and did not.
- **Still NOT merged, and `master` is untouched.** `origin/master` is `818959f`; `4dac240`
  is on no master branch (checked). `master` remains owner-controlled: no push, no merge,
  no auto-merge, no release action without a fresh instruction naming it.
- **Three commits landed after mine**, so the section above's closing line ("if this line is
  the newest thing here, nothing has happened since") no longer applies: `47cb962`,
  `a519209`, `98890c0`. The handoff was written against `47cb962`; HEAD had moved two
  commits past it by the time it was read.
- **THE SHARED SEAM IS STILL UNCOMMITTED — this is the load-bearing fact for the
  successor.** `src/index.ts`, `public/js/main.js` and `public/index.html` are all still
  modified in the working tree, carrying several Eyes' registrations. So the slice remains
  INERT exactly as described above, and `check-dead` will still name
  `registerLaunchPreflight` as an unreferenced export. Unchanged, not stale.
- **No verification was re-run at retirement** — coding, editing, staging and testing were
  frozen. The last verdicts stand as recorded above and were not re-measured against
  `98890c0`.

**Single next action for the successor:** get the shared seam committed (it is not one
session's to land alone), then the roster stage — seat editor over `createSeat`, per-seat
preflight rendering — and only then multi-launch and receipts, in that order.

### Completed behaviour

- **`POST /api/launch/preflight`** — server-backed dry run. Calls the real `resolveForm`;
  creates no session and no roster. Returns 200 with structured data even when every seat
  refuses; non-2xx means the preflight itself broke. Seat-local `reasons[] {code, field,
  message}` carry the server's words verbatim; batch-level `team{}` and `capacity{}` are
  separate. Reserved name `unassigned` refused.
- **Canonical draft** (`new-team-draft.js`) — frozen Gate E shape. `null` = unset on
  exactly `mcp, cmd, project_root, name`; `''`/`[]` are stated values; `mode` always
  stated. `bodyOf` drops nulls, so an unedited seat round-trips byte-identical.
  `createSeat` / `clearSeatField` / `NULLABLE_SEAT_FIELDS` are consumed by Eye 5.
- **Stage 1 Surface** — seven durable roster fields, live name sanitation with settle-on-
  blur, preflight-driven adoption preview (members, wipeboard thread, birth-only
  `team_role` limit), create gated on a valid name ALONE, durable transaction state, no
  double-create.
- **Zero-seat save works.** A Team with a name and nothing else is created and reported.

### Files owned (all untracked)

`src/routes/launch-preflight.ts` (302) · `public/js/new-team-draft.js` (208) ·
`public/js/new-team-preflight.js` (82) · `public/js/new-team.js` (287) ·
`public/new-team.css` (54)

### Shared seams touched — additive only, all declared before editing

- `src/index.ts` — 1 import + 1 `registerLaunchPreflight(app)` line
- `public/js/main.js` — 1 import + 1 `workspace.register('new-team', …)` block
- `public/index.html` — 1 `<link>` for the feature stylesheet, 1 `<section id="new-team-view">`

### Verification actually run, and against what

- **New Team gate — exit 0, 21/21.** Written for this slice, run against **this checkout**
  (`public/` served locally, endpoints stubbed, chromium driven). Not a repo gate; not
  committed. This is the only verification that has tested this code's rendering.
- **`bin/ronin-byoin --gates` — exit 0**, 16 ok, 2 skipped (the two browser checks).
- **`check-dead` exit 0 · `check-docs` exit 0** (captured 17:36Z; four sessions share this
  tree, so this vouches for these files at that instant and not for the repo).
- **Preflight route — 11 cases end-to-end** against the live box, including OpenShell with
  an empty prompt (valid), agent seat with no prompt (refused on `field: "prompt"`), and an
  unknown role (resolver message arrives naming its file).

### Known failures and limitations

- **`bin/ronin-byoin --ui` has NOT produced a verdict for this slice and cannot.**
  `scripts/smoke-ui.mjs` targets `defaultUrl` → the live box, a different checkout;
  `js/new-team.js`, `js/new-team-draft.js` and `new-team.css` all return **404** there.
  Verified by curl. A green `--ui` would mean nothing about this code.
- **The Surface renders with the wrong geometry on purpose.** `public/style.css:6473`
  groups `.wk-new-team-layout` with the explorer rail at `minmax(12rem,2fr) minmax(0,5fr)`
  — inverted against the reviewed fixture's wide-left `.builder`. Not overridden from
  feature CSS by choice (D14).
- **No multi-seat launch, no receipts, no lead designation** — out of this slice by
  instruction.
- **The draft does not persist** across reload or navigation. No per-view slot exists
  (D12).

### Current blocker

None for this slice. Outstanding asks, none blocking: the D14 kit ratio, a workspace-state
slot for draft persistence (D12), and `stated_by` cascade attribution.

### Single next action

Have this slice reviewed, then land the roster stage: seat editor over `createSeat`, per-seat
preflight rendering, and only then multi-launch and receipts — in that order, because the
owner gated multi-launch on the draft and preflight contracts being verified first.

---

## Vocabulary — the ruled taxonomy

Owner ruling, 2026-08-23, and this document is normalized to it:

- **pane** — *only* the tmux object inside the tmux server. It is not a house word and is
  not used in this document's prose.
- **Tile** — what Ronin renders session output into.
- **Surface** — a larger coworkspace region, which may host a terminal Tile, a Kanban, or
  Channel services. New Team is a Surface; its two stages and its receipt are regions of it.
- **Channel services** — Chat, Wipeboard, Docs and Team Configuration. Their contents are
  never called panes or panels.

**What New Team is, in those words.** It is **one Surface**. It hosts **no Tile** — a
proposed seat has no session, so there is nothing rendering session output and nothing to
attach to; seats become Tiles only after birth, and only in *other* Surfaces (the Team
workbench, Sessions). It hosts **no Channel services** of its own. Its regions are stage 1
(Team definition), stage 2 (the roster), and the Team receipt.

**One exception, and it is a mount, not a region.** The adoption controller (§ Adoption has
two doors) has a second mount point inside **Team Configuration** — which *is* a Channel
service, and Eye 2's. New Team does not own it or render there; it supplies the controller
and Eye 2 hosts it.

Kit identifiers that carry the retired word (`createPane`, `createChannelPane`, `Pane`,
`SessionPane`, `ChannelPane`) appear below only in `code font`, as the current names of
landed symbols, and are expected to change at the Workspace Kit freeze (§ D16). This section
is the only place the taxonomy is stated; Constraints and the register point at it rather
than restating it, so there is one authority here and not two that can drift.

## Audit of the reviewed Surface

Source: `../ronin-lab/concepts/five-eyes.html` line 341, at reviewed commit `f9510ef`
("Clarify New Team concept boundary"), preview `http://100.101.235.17:8099/five-eyes.html`.
The working tree is clean at that commit; the fixture read here is the reviewed one.

The fixture carries its own boundary notice: *"Concept boundary only. The New Team Five Eye
owns role_family choices, session composition, validation and the final creation flow."*
It is therefore correct that it is thin. What follows separates **reviewed intent that must
be preserved** from **gaps this build-out fills** from **fixture detail that is wrong
against the landed contracts**.

### Reviewed intent — preserved

- Two visibly separate stages, side by side: `1 · Define the Team` as a form card,
  `2 · Build the roster` as an adjacent card.
- The roster stage is explicitly **"Sessions · one or many"**.
- Seats are cards, the first is visually distinguished, and a full-width
  `＋ Add another session` grows the list.
- Reached from League's dotted creation card
  (`＋ New Team — Define the Team, then build its session roster`).

### Gaps this build-out fills

| Gap | Consequence |
|---|---|
| No per-seat **prompt** field anywhere | `POST /api/launch` returns 400 *"Say what the session is for"* for every agent seat |
| No per-seat **name** field | `mode: manual` returns 400 *"Name the session."* |
| No **mode** control (manual / assisted) | The two modes mean different things about the owner's words; a batch cannot pick silently |
| No preflight, receipt, failure or retry surface | Gate E's whole subject |
| No empty-roster affordance | A zero-seat Team is valid and must be reachable |
| No wipeboard or lifecycle field in stage 1 | Two of the roster's seven durable fields |

### Fixture detail wrong against the landed contracts

1. **`Developer role_family · QuarterBack session`** on the seat card reads as two payload
   axes. Post-R35 the family is presentation only (§ Discrepancies, D1).
2. **`Opus 5 · MCP off · dial read`** reads as three editable seat controls. `dial` has no
   launch field at all and is fixed by the cascade; `model` is not a launch field either —
   the launch takes a `cmd` from the `session_launch_spec` table. Only MCP is a per-seat
   choice. All three belong on the card as **resolved readings**, and MCP additionally as a
   control.
3. **Team role is a `<select>` of `Release team / Product team / Research team`.** Those are
   invented. `ronin_catalogs/team_roles/` ships **no definitions at all** — only a README,
   which states the rule plainly: Build Team offers what `GET /api/team-roles` returns "and
   accepts a fresh label all the same". The control is a combobox over a possibly-empty
   list, free text accepted, blank accepted.
4. **`Repositories and branches` is one text input** (`ronin-cowork:dev, ronin-services:dev`).
   The roster stores `repos: string[]` and `branch: string` as separate fields.
5. **`Session 1 · Team lead`** presents the lead as structural and mandatory. Overruled: lead
   is optional and `null` is valid (§ Lead).

---

## Discrepancies reported to @view_mgr and @eye_agent_config

**D1 — `role_family` precedence in the Eye 5 charter. RESOLVED UPSTREAM, 2026-08-23.**
Filed here and by @eye_agent_config because `FIVE_EYES.md` stated the pre-R35 cascade inside
Eye 5's own charter. **It now reads correctly** (`:294-295`): *"field precedence from system
through `session_role` and explicit per-seat overrides; `role_family` is presentation and
contributes no precedence layer."* Verified this turn. Gate E is no longer blocked on it.

What the code enforces, unchanged and still worth knowing before anyone "fixes" it: the real
cascade is `system < team_roster (context only) < session_role < explicit launch`, and four
places refuse the retired axis by name (§ D2a). The Eye 4 charter's *"seat editor driven by
`role_family` and applicable `session_role`"* (`:277`) **stands as written** — read as
presentation, which is what a family now is: the seat menu, and the `default_lead_role` pin.
It was never the wrong half.

**D2 — Two catalog READMEs still print the dead four-layer cascade.**
`ronin_catalogs/role_families/README.md` and `ronin_catalogs/session_roles/README.md` both
show `system < role_family < session_role < explicit choice on this launch`, and the former
says a family is *"chosen at birth, carried in the session's letter"*. Contradicted by
`role_families/developer.md` ("A family is PRESENTATION, not structure (R35) … Nothing here
rides a launch or a letter"), by KOTOBA, and by the code. Doc drift, not mine to fix
unilaterally.

**D2a — The `role_family` sweep's real scope. CORRECTED TWICE; read the method note.**
Enumerated with an **unfiltered** grep this turn, after @eye_league showed my first
enumeration was wrong.

*Refusals — four doors, all correct, do not "fix" them:* `src/routes/launch.ts:60-65`;
`src/routes/catalogs.ts:324-326`; `src/routes/sessions-api.ts:215` (410 on the retired
route) and `:248-251` (400 in the `session_role` write body); `ronin_bin/write_tegami:446-449`.

*The saved-launch path still carries the axis **end to end** — six sites, two files:*
`src/catalog.ts:277` (typed on the record), `:294` (read), `:305` (filtered on), `:313`
(in `LAUNCH_FIELDS`), `:326` (validator accepts it as sufficient); and
`src/routes/catalogs.ts:355` (iterated as a writable field on the save route). **Not one
function** — type, read, filter, field list, validator, route. This is @eye_customize's
P2/P3, unmoved since their first post.

*One stale comment inside the resolver itself:* `src/spawn.ts:362` describes the cascade as
`system < role_family < session_role < this launch` — the dead four-layer model, in the file
that implements the live one. Prose, not behaviour, but it is what someone reading the
resolver to learn the cascade would read.

*Legitimately still present, not drift:* `src/definitions.ts:299` and
`src/routes/catalogs.ts:249` — `role_families` remains a live presentation catalog.

**Method note, kept because it is the transferable part.** My first enumeration claimed
"four refusals, one writer — edit six documents, change one function." It was wrong because
I grepped `role_family` and filtered on `retire|refus|not yours|400|error`. **That filter
cannot return an acceptance site.** The check was shaped to pass, and I caught `catalog.ts:326`
only because its throw happens to contain the word "error" — luck, not method. Do not search
for the answer you expect; search for what would falsify it. One unfiltered grep, first
screen of output. Anyone scoping R35 should treat every refusal-site collection on the
five-eyes board, this one included, as non-exhaustive until re-run unfiltered.

**D3 — No batch launch exists, and no transaction.** One session per `POST /api/launch`;
the roster is a separate `POST /api/team-rosters`. Gate E's preflight / ordering /
partial-failure / retry has no server support today. Addressed by § Preflight and
§ Orchestration.

**D4 — The lead's SOP hand-over reports "not delivered" in the canonical case.**
`POST /api/sessions/:name/team_lead` delivers `ronin_sops/teams.md` **only when the
session's dial is `write`**. `QuarterBack` — `developer`'s pinned `default_lead_role` —
resolves `dial: read` (`ronin_catalogs/session_roles/QuarterBack.md`). So designating the
canonical lead returns
`delivery: "not delivered — \"x\" is dial read; flip it to 🤖 and re-designate…"`. It is
**not a failure**: that seat already received the SOP at birth through `bootReading`
(`src/spawn.ts`). Reported honestly, never rendered as an error (§ Lead).

**D5 — The existing launcher never sends `team:`.** `public/js/launcher.js:562` sends the
team as `tags: [name]`. The roster is therefore never resolved on today's launches: no
roster root default, no `team_role` reading shelf, no objective in the brief. Eye 4 sends
the real `team:` key, which is also why stage 1 must commit before stage 2 launches — the
route refuses a `team:` with no roster.

**D5a — Fixing `launcher.js` alone would convert a silent degradation into a hard refusal.**
Drawn by @eye_team from D5, and it is a sequencing constraint on how D5 gets acted on.
Because today's launcher sends only a tag, `resolveForm` never sees a `team` and never
throws — a new session is simply born with no roster defaults, quietly. **The moment anyone
makes the launcher send `team:`, that silence becomes `resolveForm`'s hard throw** — *"Team X
has no roster on this box. Create it first"* — on the three quarters of Teams here that have
no roster.

Eye 4's own flow is safe by construction: stage 1 creates the roster **before** stage 2 sends
`team:`, so the throw is unreachable from this surface. But D5 must not be read as an
invitation to patch that one line in isolation. **A roster-creation path has to exist in the
ordinary UI first** — this build-out's stage 1 and @eye_team's Team Configuration offer-to-create are
the two — and the launcher fix follows it. The code's own comment states the doctrine the
split follows: being born onto a team is a launch fact that *"deserves the durable half to
exist"*, while *"joining a tag-only team afterwards is the tags route's ordinary business."*

**D5b — Adopted members never read the `team_role` shelf, and the surface must not imply
they did.** Follows from @eye_customize's 13:13 self-correction — they had filed the
`team_role` reading level as ending in a silent skip, re-read their own claim, found
`resolveForm` refuses a rosterless `team:` launch loudly, and wrote that there is no silent
failure in that path. The birth-only half of that correction is what this finding stands on.
`team_role` reading is **birth-only by ruling** — *"a session that joins the team
later is not re-briefed"* (`ronin_catalogs/team_roles/README.md:16`). Adoption creates a
roster over sessions that were tagged, never born onto anything. So the moment stage 1
adopts, those members are **fully members** — derived membership is real, the Kanban and
Sessions mode work — but none of them has read the `team_role`'s build brief, and none ever
will. Only seats launched afterwards through stage 2 do. That is correct behaviour, not a
gap; it is listed here so the adoption preview states it plainly rather than letting the
owner infer that naming a `team_role` briefed the people already on the Team.

**D6 — Naming.** The catalogs and KOTOBA call this surface **Build Team**
(`role_families/developer.md`, `team_roles/README.md`, `src/definitions.ts`); the
build-outs and fixture call it **New Team**. KOTOBA_GLOSSARY's rule is that the UI word
wins. @kotoba's ruling; this doc says New Team and notes the catalogs would follow.

**D7 — `seat` is not a KOTOBA noun.** `WORKSPACE_KIT.md` names `AgentSeatCard`, the settei
record already carries `schema.seat`, and the schema below says `seat` throughout. It wants
a row before it spreads further.

**D8 — Saved launches still carry retired keys.** `SavedLaunchInfo`
(`src/catalog.ts:269`) has `role_family` and `group`. Adjacent drift; noted, not Eye 4's to
fix, but it constrains any reuse of saved launches as draft seeds.

**D9 — `NewTeamLayout` has two regions; this surface needs three.**
Gate A landed `createNewTeamLayout(definition, roster)` in
`public/js/workspace-layouts.js` — two slots, matching the fixture's two cards. The batch
**receipt is persistent and outlives stage 2** (§ The Team receipt), so it needs a region of
its own rather than displacing the roster. Request to the kit owner: a third `receipt`
region, or a recorded rule that the roster region hosts a transaction surface after commit.

**D10 — Gate A is moving in the working tree, uncommitted.** `workspace-primitives.js`,
`workspace-layouts.js` and `workspace-adapters.js` are untracked as this is written; the
tracked set changed under this session mid-draft. Independently reported by
@eye_agent_config, @eye_league and @eye_team, and verified here each time — and it moved
again during this drafting: `public/js/workspace-kit.js` appeared, exporting a frozen
`WorkspaceKit = { primitives, layouts, adapters }` as *"the one reachable Gate A hand-off"*.
**This build-out consumes `WorkspaceKit` alone** and reaches into none of the three modules
directly, matching @eye_league's decision. This build-out plans against those contracts and
**must be re-checked against them when they are committed and frozen** — a moving floor is
not a passed gate, and legs 4–10 do not start before it is one.

**D11 — A roster may legally be named `unassigned`, and New Team is where that happens.**
Raised by @eye_league from the board side; the creation path is mine.
`isValidTeamName('unassigned')` returns `true` (`src/team-rosters.ts`), so nothing stops this
surface creating a durable Team whose name collides with League's holding projection. League
defends itself by keying the holding area on a sentinel rather than the string, which is
right, but the collision should not be creatable in the first place. **Eye 4's guard:**
preflight returns a `refuse` on `unassigned` and on any name League reserves, and stage 1
says why. A guard upstream in `isValidTeamName` would be better and is the ask; the preflight
refusal stands whether or not it lands, because a client-side-only guard is exactly the kind
that gets bypassed.

**D12 — The draft has nowhere to persist, and a lost draft costs the owner their typing.**
*Corrected down from how this was first filed.* @eye_team pointed out, and it is verified
here, that `ronin.workspace.v1` **already does per-view state by top-level provisioning** —
`panes: {left, kanban, right}` and `widths: {left, right}` at `public/js/workspace.js:17-18`
exist for the Team workbench alone. So the ask is **one more field provisioned exactly the
way five already were**, not a new namespacing mechanism. @eye_league has reframed their own
version the same way. The kit contract still forbids a view inventing its own storage key,
which is why this is an ask rather than something Eye 4 does locally. League degrades honestly by not persisting a
show/hide bit. **New Team cannot degrade as cheaply:** a partially specified draft is an
explicitly valid resting state (§ Blank, unclassified and partial), and losing it on refresh
loses an objective and N prompts the owner typed. Until a slot exists, leg 10 is blocked and
the surface must warn before a navigation that would discard a dirty draft rather than
pretend it is saved.

**D13 — `createCard` has only a `selected` state; a seat card needs `warning` per card.**
The kit contract promises `selected, active, warning, stale`; the landed primitive carries
one. @eye_league and @eye_customize both hit this and both dissolved it by wrapping the
container in the kit's generic region primitive (currently `createPane`), reasoning that
staleness is a property of a fetched *list*.
**That resolution does not work here, and @eye_agent_config reached the same conclusion
independently.** A refused seat is a property of the **individual card**: one seat in a roster
of five is the one that will not launch, and a stale state drawn around the whole roster
Surface cannot express which. `AgentSeatCard` now has two named consumers wanting per-card `warning`
— the kit's own two-consumer bar for building a primitive. Not a new ask; already written.

**D14 — The landed CSS gives `NewTeamLayout` a rail ratio, and it is the *inverse* of the
reviewed one.** `public/style.css:6470` puts `.wk-explorer-layout`,
`.wk-compact-terminal-layout` and `.wk-new-team-layout` in one rule at
`minmax(12rem, 2fr) minmax(0, 5fr)` — narrow left, wide right, the shape of a nav rail and
its content. The reviewed fixture's `.builder` (line 222) is
`minmax(0, 1.2fr) minmax(270px, .8fr)` — **wide left, narrower right**: Team definition is
the major column and the roster the minor one.

@eye_agent_config reports this rule as a wrong ratio for their surface. For mine it is
**reversed**: stage 1's seven-field definition form would be squeezed into a 12rem rail while
the seat list took `5fr`. Fixture and kit contract agree; the landed CSS is the outlier, and
it is one shared rule serving three layouts that want three different shapes. Ask:
`.wk-new-team-layout` gets its own rule, matching the fixture, as `.compact-layout` already
does there (fixture line 230).

**D15 — No form, field, notice or validation-state primitive exists.** `WORKSPACE_KIT.md`'s
own "What each Eye receives" table promises New Team *"NewTeamLayout, AgentSeatCard, forms,
notices and validation states"*. Landed in `workspace-primitives.js`: `setSurfaceState`,
`createPane`, `createCard`, `createReservedPane`, `createChannelPane`, `createExplorerRail`.
None of the four. **Stage 1 is entirely a form**, every field needs three states plus a
per-field refusal message from preflight, and @eye_agent_config's surface is a form too —
two named consumers, the kit's own bar. Independently found by both of us. I build no local
substitute and fork no primitive; leg 5 is blocked on it.

**D16 — `pane`: RULED by the owner, 2026-08-23. Not an open question.**
The ruling, in the owner's words: **`pane` means only the tmux object inside the tmux
server.** Ronin renders session output into a **Tile**. A **Surface** is a larger coworkspace
region that may host a terminal Tile, Kanban, or Channel services. **Chat, Wipeboard, Docs
and Team Configuration are Channel services** — their contents are not panes or panels.

This resolves the collision Eye 2 raised (`KOTOBA_GLOSSARY:42` and `:212` retire the word;
`WORKSPACE_KIT.md` and the landed code name primitives for it) **against the primitives**:
there is no architectural-name exception. `createPane`, `createChannelPane`, `Pane`,
`SessionPane` and `ChannelPane` are misnamed under this ruling and are expected to change at
the Workspace Kit freeze. **This build-out is normalized to the ruling**: Tile / Surface /
Channel service in all prose, and a kit identifier appears only in `code font`, as the name
of a landed symbol, never as a house word. Where such a symbol is cited below it is cited as
what it is currently called, not as what the thing is.


---

## The canonical draft — shared with Eye 5

One object. Eye 4 owns it and its persistence. Eye 5 edits **one seat of it** and returns
that seat. There is no second schema, no second launch payload, and Eye 5 never constructs
a launch body.

```text
TeamDraft
  draft_version   1
  draft_id        stable id, so a draft survives navigation and refresh
  team            TeamDefinition
  seats           Seat[]            — [] is valid
  lead_seat_id    string | null     — null is valid, always
  roster_created  boolean           — has stage 1 been committed
  outcome         DraftOutcome | null

TeamDefinition                       — mirrors the roster's seven durable fields exactly
  name            string             — '' while drafting; ^[a-z0-9][a-z0-9_-]{0,63}$ to create
  team_role       string             — '' valid: an unclassified Team
  objective       string             — '' valid
  project_root    string             — '' valid: launch falls through to the top active root
  repos           string[]           — [] valid
  branch          string             — '' valid
  wipeboard       string             — '' means "the Team's own name"
  state           'active'           — 'archived' is not a creation state

Seat                                 — exactly the fields /api/launch already accepts, plus draft bookkeeping
  seat_id            string                — stable within the draft; the retry key
  presented_family   string                — PRESENTATION BREADCRUMB. Never sent. See below.

  session_role       string                — '' is a STATED value: a blank-role launch is real
  mode               'manual' | 'assisted' — always stated, never unset (see below)
  prompt             string                — '' is stated; required at launch iff the profile has an agent
  inject             string                — '' is stated (assisted only)
  reference          string                — '' is stated (assisted only)
  tags               string[]              — [] is stated; memberships BEYOND the birth team
  seed               string[]              — [] is stated (assisted only)

  name               string | null         — null = unset → the server derives (assisted only)
  cmd                string | null         — null = unset → bias, then install default
  project_root       string | null         — null = unset → Team default, then top active root
  mcp                boolean | null        — null = unset → whatever the resolved profile says

  resolved           ResolvedSeat | null   — server truth, never authored
  outcome            SeatOutcome | null    — controller truth, never authored
```

The Team is **not** a seat field. It lives once on `TeamDefinition`; the controller supplies
`team:` to every launch. A seat's `tags` are additional memberships beyond the birth team,
which rides first and is never at risk of being truncated by the 16-tag cap.

### Unset is not the same as empty, and it round-trips

**Confirmed to @eye_agent_config: the draft stores unset distinctly from set-to-a-value.**
The marker is `null`, and it appears on exactly the four fields where the server itself
distinguishes an absent key from a stated one:

| Field | `null` (unset) resolves to | `''` / `false` means |
|---|---|---|
| `mcp` | the resolved profile's `mcp:` default | an explicit opinion that overrides the definition |
| `cmd` | the `model:` bias, then the install default | — (the route reads `''` as absent; use `null`) |
| `project_root` | the Team default, then the top active root | — (same) |
| `name` | slugged from role + prompt | — (same) |

Everywhere else `''` and `[]` are **stated values, not absence** — most sharply
`session_role: ''`, which is a real launch with no role reading and no mark, and must never
be conflated with "the owner has not picked yet".

`mode` is **always stated** and never `null`. The wire defaults an absent `mode` to
`assisted` (`src/routes/launch.ts`), while the launcher's honest default is `manual`. A
draft that left it unset would quietly change what happens to the owner's words.

**The round-trip guarantee:** the draft is the authority and the wire body is *derived* from
it — serialization drops `null`s rather than materializing them. Opening a seat, drawing
every control, and saving it back unedited therefore produces a byte-identical draft. No
default may be written into the draft because the UI drew a control for it. A per-field
clear returns exactly one field to `null`.

### Rules the schema enforces by shape

- **`role_family` never appears.** `presented_family` records which shelf the seat was
  picked from so the card can show its breadcrumb and so `default_lead_role` can be
  suggested. It is stripped before any request. Named `presented_` precisely so nobody
  mistakes it for an axis (D1).
- **`mcp` is three-valued.** `null` means inherit, per the route's own rule that only an
  explicit boolean is an opinion (`src/routes/launch.ts`). A two-valued field would connect
  or disconnect a session by omission.
- **`resolved` and `outcome` are server truth**, kept beside the authored fields rather than
  merged into them, so an edit can never overwrite a reading and a reading can never look
  like an edit.

### What happens when a definition changes under a drafted seat

Raised by @eye_agent_config: a seat is drafted, then its `session_role` definition is edited
in Customize. Does the draft re-resolve, or hold what it saw?

**Authored fields hold. `resolved` always re-resolves. Neither ever moves the other.**

The owner's typing is the one thing a background edit may never rewrite — if a seat says
`prompt: "…"` and `mcp: false`, an edit to `CutCode.md` must not silently change it. But
`resolved` is a **cache of a reading, with no independent authority**, and the doc already
says preflight is advisory and the server re-checks at launch. A stale reading is therefore
never trusted; it is re-fetched.

The interesting case is where the two now conflict: the owner adds `mcp: always` to a role a
seat had explicitly set `mcp: false` on. The seat is unchanged and still says what the owner
meant. The re-resolve refuses it — and **preflight is exactly where that refusal should
become visible**, at a moment the owner can still act, rather than at launch. That is the
same reason `reference` is re-validated inside `/api/launch` today: the world moves between
the dry run and the wet one, and a Customize edit is simply another way it moves.

Settled between Eye 4 and @eye_customize; no ruling needed.
- **Every field except `team.name` is optional at every moment.** `team.name` is required
  only at the instant of roster creation, not while drafting.

### The Eye 5 contract (Gate E)

Eye 5 receives, per invocation:

```text
{ seat: Seat, team: TeamDefinition (read-only), resolved: LaunchProfile }
```

and returns a mutated `Seat` with the same `seat_id`. Eye 5 may write every authored field
on that seat. Eye 5 may **not** write `seat_id`, `resolved`, `outcome`, any field of `team`,
`seats[]` ordering, or `lead_seat_id`. Eye 5 may work against a fixture draft of this shape
once it is frozen.

**Field precedence Eye 5 renders** — the real one, not the charter's:

```text
system default  <  session_role definition  <  explicit choice on this seat
```

with the Team contributing **context, never a definition field**: its `project_root` seeds
the seat's root, its `repos`/`branch` seed the working context, its `team_role` adds a
reading shelf, its `objective` enters the brief. That is `src/spawn.ts` and KOTOBA's
`launch cascade` row, and it is what Eye 5's resolved-profile summary must show.

---

## Stage 1 — Define the Team

One form card. Fields, in order, each mapping one-to-one onto the roster:

| Field | Control | Blank |
|---|---|---|
| Team name | text, live-sanitized to the tag rules | required **only at create** |
| Team role | combobox over `GET /api/team-roles`, free text accepted | valid — unclassified |
| Objective | textarea | valid |
| Default project root | select over `GET /api/project-roots` | valid — falls through at launch |
| Repositories | list input, one repo per entry | valid |
| Branch | text | valid |
| Wipeboard | text, placeholder = the Team name | valid — defaults to the Team's own name |

The combined `Repositories and branches` input from the fixture splits into two fields
(§ Audit, item 4). `state` is not offered: creation is always `active`.

**Committing stage 1 is `POST /api/team-rosters`.** On success the Team is durable and
**visible in League from that moment** — before any seat exists, and whether or not any ever
will. That is the owner's ruling and it matches the store: a roster with zero live members
is a normal, openable state.

Two adoption side effects must be shown **before** the commit, from preflight, never
discovered afterwards:

- **Session adoption.** Live sessions already carrying the tag `name` become members the
  instant the roster exists, because membership is derived from tags. The Team is born
  populated.
- **Wipeboard adoption.** Naming a Team after an existing custom wipeboard **adopts that
  board's thread** — *"the team wins its name"* (`docs/wipeboards.md:40`).

Neither is an error. Both are surprises without a preview.

**Measured on this box: four live Teams, one roster.** Verified independently by @eye_team
and re-run here — the team-rosters store (resolved by `bin/ronin-store`, written by
`src/team-rosters.ts`) holds one roster, `five-eyes`, while `tejun-team` lists
`buildout`, `five-eyes`, `viewers` and `walk`. *(A point-in-time reading of a user-scope
store, not the repo. `check-docs` cannot verify it — the gate checks claims written in path
syntax and says nothing about ones phrased in English, so re-measure rather than trust this
line. Distinction owed to @eye_customize.)* Three quarters of the Teams on the box the
five Eyes are standing on have **no durable record**, and the one that does exists only
because it was made for this rollout.

**And session adoption is the migration path, not an edge case.** @eye_league drew the
consequence of D5 that neither of us had stated: since today's launcher never sends `team:`,
**every Team created through the current UI is tag-only**. On any existing box the rostered
Team is the rare one and New Team is the only surface that produces one. So "create a roster
whose name already has live tag-holders" is the *ordinary* first use of stage 1 — the
adoption preview is a primary path, and stage 1 must read as *adopting an existing Team*
rather than as a collision warning when it fires.

### Adoption has two doors, and one controller

@eye_team found the other door and asked whether Eye 4 wants to own adoption whole. **Answer:
the controller is mine; the surface can be theirs.**

Their finding, verified: on a tag-only Team, `GET /api/team-rosters/:name` 404s and
`PUT` 400s with *"Team X has no roster. Create it first."* — `writeTeamRoster` refuses before
it writes. So Team Configuration's save fails on the majority case, while the Kanban, the focused
terminal and Sessions mode all work perfectly, because membership is derived from tags and
needs no roster. That asymmetry is why it was easy to miss.

Two doors onto the same act is **correct**, and bouncing someone out of the Team they are
working in to fix the Channel service they are looking at would be worse. What must not
happen is two Surfaces inventing adoption separately. So this build-out applies the Gate E pattern it
already agreed with Eye 5: **`TeamDefinition`, the preflight, and the `POST
/api/team-rosters` call are one controller with two mount points** — New Team's stage 1, and
the Team Configuration Channel service's empty state. Eye 2 renders it; Eye 2 builds no second create path and no
second payload, exactly as Eye 5 builds no second launch payload.

**Adoption is not creation, and the validation differs** — the same two preflight facts, read
oppositely:

| | New Team stage 1 | Team Configuration adoption |
|---|---|---|
| Team name | free, owner types it | **fixed** — it is the Team they are in |
| `name_available` (no roster yet) | must be **true**, else refuse | must be **true**, else the service would not be empty |
| `adopts_sessions` (live tag-holders) | a **preview** of who arrives | already **true** — the members are why they are here |
| Wipeboard adoption | previewed before commit | previewed before commit, identically |

The preflight response already carries both facts separately, so one contract serves both
readings with no branch in the route. Two named consumers, which is the kit's own bar for
building the thing once.

---

## Stage 2 — Build the roster

Zero or more seats, in explicit order. The order is the launch order (§ Orchestration).

Each seat card carries, in three bands:

1. **Identity** — `session_role` picked from the family shelves (`GET /api/role-families`,
   `GET /api/session-roles`), with the family shown as a breadcrumb only. Roles in no
   family are loose and draw in the tail, as they do on the New Session board.
2. **Words** — `mode`, `prompt`, `name`, and in assisted mode `seed` / `inject` /
   `reference`. This is the band the fixture omits entirely and the one the server refuses
   without.
3. **Resolved readings** — from `GET /api/launch-profile?session_role=…`: dial, lifecycle,
   ack, posture, whether an agent launches at all, and the `mcp` default and lock. Read-only.
   Beside them the two real controls: the `session_launch_spec` pick (`cmd`) and the MCP
   toggle, the toggle hidden when `mcpAlways`.

**Seat menus are the family shelves, with `default_lead_role` pinned first** — that is the
family's whole remaining job in this surface, plus its role as a Build-Team template
(`role_families/developer.md`: *"doubles as a Build-Team template: building a developer team
starts from this family, its roles as the menu"*).

**Adding a seat is never required.** A Team defined with zero seats is a complete, valid
outcome of this surface, reachable in one action from stage 1.

---

## Blank, unclassified and partial — the owner's rule

This cuts across every other section, so it is stated once, here, and every section defers
to it.

- **Blank is valid at every field except `team.name` at the instant of create.** `team_role`
  blank is an unclassified Team. `session_role` blank is a real launch with no role reading
  and no mark. `lead_seat_id: null` is valid always. `seats: []` is valid.
- **`GET /api/team-roles` may legitimately return an empty list** — the house ships none, by
  design ("a stock guess would be furniture"). Verified on this box: there is no user-scope
  `team_roles/` store at all, so the route answers **empty today** — while the live
  `five-eyes` roster carries `team_role: development`, a label with no definition behind it.
  That is the README's own stated case, not a fault. The combobox must be useful and complete
  with zero options, and must accept a label that will never have a file.
  *Not a conflict with @eye_league:* League renders `team_role` as its own text and does not
  fetch the route in v1, because it only ever displays one. New Team is the authoring
  surface, so the route is its picker's data source — the catalog README names Build Team as
  the caller. Display and authoring, one doctrine.
- **A partially specified draft is a valid resting state.** It survives navigation away and
  back, and refresh. Nothing may refuse to save a draft because a field is empty.
- **No workflow gate exists merely because the UI offers a field.** The only gates are the
  ones the server actually enforces:
  - a valid Team name at roster create;
  - a `prompt` on a seat whose resolved profile has an agent;
  - a `name` on a seat in `manual` mode.
  Everything else — team_role, objective, root, repos, branch, wipeboard, lead, seat count —
  is advisory. Preflight may **warn**; it may not **refuse**.
- **Where anything is ordered, missing and unclassified values sort last** — never first,
  never hidden, never silently dropped. In the `team_role` combobox, blank is an explicit
  last entry, not an absent option. In League groupings, unclassified Teams follow classified
  ones. In the receipt, seats never attempted follow those that were.

---

## Preflight — a server-backed dry run

**Proposed, does not exist. Eye 4 owns it** — settled with @eye_league (declined, charter
excludes launch orchestration) and @eye_agent_config (accepted). It is Gate E's dry-run
resolve, and Gate E is mine.

`POST /api/launch/preflight` — takes the same bodies the real calls take, creates nothing,
answers per seat.

### Why server-backed rather than browser-side

Several checks are only answerable by the server, and the browser would have to race or
guess at each:

- cascade refusals from `resolveLaunchProfile` — a contradicted `mcp: always` lock, an
  `agent: none` seat handed agent fields, an illegal `dir:`;
- unknown `session_role`, unknown `project_root`;
- whether the chosen `cmd`'s launch-table row declares `mcp_off:` flags — an **explicit** off
  with none declared is refused, while a merely-defaulted off degrades to connected;
- name collisions against live tmux sessions, and what a derived name would actually resolve
  to under `slugName`;
- session-max headroom against the seat count, with `cap: exempt` seats excluded;
- whether the Team name already has a roster, already has live tag-holders, or already has a
  custom wipeboard.

### Response shape

```text
{
  ok: boolean                       — false iff any seat verdict is 'refuse'
  team: {
    name_valid: boolean
    name_available: boolean         — no roster of this name yet
    adopts_sessions: string[]       — live sessions already tagged with this name
    adopts_wipeboard: boolean       — an existing custom board of this name
  }
  capacity: { max, live, exempt_seats, would_be, over_by }
  seats: [{
    seat_id
    verdict: 'ok' | 'warn' | 'refuse'
    resolved: LaunchProfile
    derived_name: string            — what the server would actually name it
    reasons: [{ code, field, message }]
  }]
}
```

- **A reason is NEVER dropped.** If its `field` names no control the consumer drew — or is
  `''`, which is how a whole-seat refusal arrives — it goes to the form notice instead.
  Closed by @eye_agent_config from the consumer side; recorded here as part of the frozen
  contract rather than as one implementation's detail, because anyone consuming this
  response inherits it.
- **`warn` never blocks.** Adoption, a defaulted MCP that will degrade to connected, a lead
  seat whose dial will refuse the SOP hand-over — all true, none blocking.
- **Every refusal names its field**, and where the server's own message names a file it is
  carried verbatim. The house rule is that a refusal names a file, and a batch that
  paraphrases loses exactly the part that helps.
- **Preflight is advisory, never authoritative.** The server re-checks everything at launch.
  A stale preflight must not be able to skip a check — the world moves between the dry run
  and the wet one, which is precisely why `reference` is already re-validated inside
  `/api/launch`.

### It is the dry-run resolve, and Eye 4 owns it

@eye_agent_config asked whether the dry-run resolve rides Eye 4's launch work or the shell.
**It rides this preflight**, because it is the same thing: *`resolveForm` without creating a
session*. There is no second resolver and no second payload; Eye 5 consumes this response.

`GET /api/launch-profile` cannot answer, and Eye 5 is right that it cannot: it resolves the
**`session_role` layer alone**. Everything else a truthful summary needs lives in
`resolveForm` (`src/spawn.ts`) and runs today only when a session is actually created —
the Team context, the `project_root` fallback chain, the `model:` bias resolved through the
launch table, the derived name, and every MCP refusal. So the per-seat answer must carry the
resolved **form**, not just the profile:

```text
ResolvedSeat        — the Resolved shape from src/spawn.ts, minus the side effects
  name  dir  cmd  tags  dial  lifecycle  session_role  team  team_role
  project_root  mode  agent  capExempt  mcp  launchAgent
  brief             — the composed boot brief, for Eye 5's preview
  stated_by         — cascade attribution; see below (NOT catalog provenance)
```

`brief` is included deliberately: with no session to attach to, the honest preview of a
proposed seat is **the composed brief plus this resolved summary**, which is also the
owner's ruling on Eye 5's preview.

**Two honest caveats, stated rather than glossed:**

- **A dry run is not perfectly side-effect-free.** `resolveForm` calls `ensureShelf(...)`,
  which `mkdir`s a shelf folder per project_root. Idempotent, and it would happen at the
  next real launch anyway — but the claim is "creates no session and no roster", not
  "touches nothing".
- **Cascade attribution does not exist on either endpoint today.** Eye 5 needs each read-only
  field to name **the file that stated it**; `resolveLaunchProfile` knows this internally
  (`stated()` finds the last layer to state a key) but returns none of it. Adding a
  `stated_by` map is a small, contained change to an existing resolver, and Eye 4 and Eye 5
  request it **together** rather than either of us inferring it browser-side.

  **It is called `stated_by`, not `provenance`.** Vocabulary collision caught by
  @eye_customize: `provenance` is already taken, and taken for a different fact — catalog
  origin, stock vs yours, the ◆/◈ marks in `public/js/provenance.js`. Cascade attribution is
  not catalog origin, and two facts under one word in a house whose words are the product is
  the defect KOTOBA's spelling law exists to prevent. `stated_by` is the resolver's own verb.

---

## Orchestration — ordered, no rollback

The controller is **non-DOM and testable without a browser**: it takes a `TeamDraft`, makes
requests, and returns the draft with outcomes written. No view module drives it.

### Order

1. **Preflight** the whole draft. Refusals are shown against their fields; the owner fixes or
   proceeds past warnings.
2. **Create the roster** (`POST /api/team-rosters`). On failure nothing else runs — the
   launch route refuses a `team:` with no roster, so there is nothing to be born onto. The
   draft survives intact and the owner retries.
3. **Launch seats in draft order, strictly sequentially.** Not parallel:
   `createSession` enforces the session max internally, and `slugName` de-duplicates derived
   names against the live set at resolve time. Parallel launches race both, and a receipt
   that cannot state a real order is not a receipt.
4. **Designate the lead**, if and only if `lead_seat_id` is set and that seat was born.

### No rollback

The owner's ruling: **preserve successful births; offer retry for failed seats.** A refused
seat leaves every born seat alive and the roster in place. Nothing is killed, nothing is
deleted, nothing is undone. A partially staffed Team is a real Team, and the Team was already
visible from step 2 regardless.

### Continue vs halt

Continue past `400` and `409` — those are one seat's problem, and the next seat may be fine.

**Halt the remaining queue on `429` (`AtSessionMax`)**, marking the rest `skipped` rather
than `refused`: every subsequent non-exempt seat would fail identically, and reporting five
identical capacity refusals teaches nothing that one does. Skipped seats were never
attempted and retry cleanly.

*This one is my call, made because the alternative is noise. Stated here so the owner can
overturn it in a sentence.*

### Retry

Retry re-launches **only seats whose outcome is not `born`**. It never re-creates the roster
and never re-launches a born seat — the `seat_id → session_name` map is the guard. A retried
seat is preflighted again first, because the box has moved.

### The seat outcome

```text
SeatOutcome
  status        'pending' | 'born' | 'refused' | 'skipped'
  session_name  string?      — set on 'born'
  receipt       Receipt?     — the route's own receipt, verbatim
  error         string?      — the server's message, verbatim
  http          number?
```

---

## Lead — optional, post-birth, honest

**A Team never requires a designated lead.** `lead_seat_id: null` is valid for an empty Team,
a staffed Team, and every Team in between. No gate anywhere blocks create, launch, or
completion on a missing lead. The fixture's `Session 1 · Team lead` is presentation of a
common case, not a structure.

What actually happens, stated honestly in the surface:

- **Designation is a separate call after birth** — `POST /api/sessions/:name/team_lead
  { teams: [team] }`. There is no lead field on `/api/launch`. The Team therefore exists
  without a lead for the length of the batch; that window is normal, not a failure state.
- **Leading implies membership.** The route tags the session into the team if it is not
  already on it.
- **The SOP hand-over is dial-gated.** It is delivered only when the session's dial is
  `write`. `QuarterBack` resolves `dial: read`, so the canonical designation returns
  `delivery: "not delivered — … flip it to 🤖 and re-designate…"`. **This is not an error.**
  A `default_lead_role` seat already received `ronin_sops/teams.md` at birth through
  `bootReading`. The receipt prints the delivery string as reported, plus a plain line saying
  the reading was already delivered at birth when the seat's role is its family's
  `default_lead_role`.
- **If the lead seat was refused, designation is skipped and reported.** Never auto-promoted
  to another seat: leadership is designated, never derived.
- **Leadership can be designated later, from the Team surface.** New Team is one route to it,
  not the only one.

---

## The Team receipt

One receipt for the batch, not N toasts. The existing `showReceipt` (KOSHI_DASHI,
`public/js/home.js:140`) is a single-session toast that fades at 12s and removes itself at
15s. Five of those would expire before they were read.

The Team receipt is **persistent within the New Team Surface**, dismissed by hand:

- the Team line — name, `team_role` (or *unclassified*), wipeboard, and any adoption that
  actually occurred;
- one row per seat, **in draft order**:
  - `born` — session name plus the route's own receipt fields (mode, session_role, team,
    project_root, cmd, dial, lifecycle, tags, mcp), with a kill;
  - `refused` — the server's message verbatim, with a retry;
  - `skipped` — *never attempted*, with the reason, and a retry;
- the lead line — designated / not designated / skipped, with the delivery string as reported;
- **ordered so that skipped rows follow attempted ones**, per the blank-values rule.

It reuses the receipt's *fields*, not its toast.

---

## Legs

**Where the code goes.** `public/js` is flat — 64 modules, no subdirectories — and the kit's
new modules share a prefix, so this feature's do too. One module per leg; the server side is
one file. Named so a successor does not have to rediscover the layout — the implementer may
place them better, but "namespaced beneath the feature root" is not a location.

- `new-team.js` — the Surface, its two stages and routing [planned]
- `new-team-draft.js` — the canonical draft and its controller, the half Eye 5 round-trips against [planned]
- `new-team-preflight.js` — dry-run calls and per-seat verdict rendering [planned]
- `new-team-launch.js` — ordered orchestration, Team receipt, retry [planned]
- `src/routes/launch-preflight.ts` — the dry-run route (§ Preflight) [planned]

**Read that list as what this plan intends to create, never as where the kit has agreed this
goes.** The distinction is @eye_league's and it names the hole a green gate papers over:
`[planned]` exempts a path because it is *not yet built*, not because it is *agreed*. These
names are derived from a convention I verified — `public/js` is flat, 64 modules, no
subdirectories, and the kit's own new modules share a prefix — **not** from any ruling. Two
Eyes independently assumed flat and one assumed nested; nobody has ruled, and the first file
written decides it for everyone. That question, and the parallel one about where a feature
stylesheet lives, are unasked structural questions this plan does not settle and should not
be read as settling.

1. **Reconcile vocabulary and precedence.** Report D1–D16 to @view_mgr and
   @eye_agent_config; get the Eye 5 precedence line in `FIVE_EYES.md` corrected before
   anything is frozen.
2. **Freeze the canonical draft** (Gate E) with Eye 5 — the schema above, its Eye 5 contract,
   and the three-valued `mcp`.
3. **Build the preflight route — Eye 4 owns it.** It belongs beside the door it dry-runs:
   `src/routes/launch.ts` already registers `POST /api/launch`, so the natural home is there
   or a sibling `src/routes/launch-preflight.ts` [planned]. Named concretely as a starting
   point, not a requirement — the implementer may place it better, but a successor should not
   have to rediscover where it goes. Settled 2026-08-23: @eye_league declined on
   charter grounds (Eye 1 *"must not own … launch orchestration"*, and League writes exactly
   one route in v1), and @eye_agent_config accepted that it rides this build-out. It is the
   dry-run resolve, and the dry-run resolve is Gate E's, which is mine. No longer an open
   question.
4. **NewTeamLayout composition** against Workspace Kit's form / card / notice / validation
   primitives. No local geometry.
5. **Stage 1** — form, team preflight, adoption preview, roster create, League visibility.
6. **Stage 2** — seat editor, family shelves with the pin, per-seat preflight, Eye 5 handoff.
7. **The controller** — non-DOM, ordered, no rollback, halt-on-429, retry by `seat_id`.
8. **Team receipt and retry.**
9. **Blank / partial / unclassified pass** across every surface, including sort order.
10. **Draft persistence** — a partial draft survives navigation and refresh **within its own
    browser tab**. The workspace record is *per-browser-tab* by kit contract
    (`WORKSPACE_KIT.md:116`), so a draft is not visible in a second tab and two tabs can hold
    two independent drafts. That is the correct behaviour and not a limitation to design
    around — but it must be stated, because "my draft is gone" and "my draft is in the other
    tab" are the same experience to the owner. See D12 for the slot this is blocked on.

Legs 4–10 do not start before Workspace Kit's ready-to-unleash gate and Gates B, C and E.

---

## Constraints

- Reuse the existing single-session launch machinery. Do not clone the launcher DOM, and do
  not overload one `session_role` into a list.
- `role_family` never enters a request body. It is a menu and a template.
- One canonical draft. Eye 5 may not create a competing launch schema.
- Send the real `team:` key, not a bare tag (D5).
- Total tags per seat, birth team included, cap at 16; the team rides first.
- Feature CSS namespaced beneath the feature root; shared primitives change through the
  foundation owner.
- Follow `docs/ui.md` and KOTOBA vocabulary. New nouns (`seat`) go to @kotoba before they
  spread.
- **Verification is BYOIN, and this build-out owes two tiers.** New Team is UI work by
  definition — a whole new view — so: `bin/ronin-byoin --gates` before landing on `dev`
  (`.githooks/pre-push:37` runs it again; `.github/workflows/verify.yml:46` runs it on every
  PR to `master`), **and** `bin/ronin-byoin --ui` before landing, as the rendered proof. Full
  `bin/ronin-byoin` is the installed-box tier. Run once, when the work is done; never a
  hand-rolled `scripts/check-*` sequence. A SKIP is reported as unverified.

  `--ui` is **repo policy, not this doc's inference**: `.githooks/pre-push:25` and
  `.github/workflows/verify.yml:11` both require it for UI-affecting work.

- **A green CI proves nothing about a rendered view, and every slice of this view is
  rendered.** `verify.yml` runs `--gates`, which does not drive browser UI; tier 2 — a real
  render check on a runner — is explicitly *"a separate, later piece of work. Not this
  file."* CI has in fact **never** covered browser UI: before the tiers landed the runner
  skipped those checks for want of a browser, so only the *reason* for the skip changed.
  **Therefore the `--ui` verdict is local-only and must be QUOTED in the PR** — nothing else
  produces it, and an unquoted `--ui` on a five-view rollout means nobody ran it.

  *(One caveat a reader will hit: `verify.yml:45` titles that step "BYOIN — every check, then
  one verdict" while running the tier that skips two. It was true of the pre-`3f2499c`
  command and went stale two lines from an edit — nobody wrote a false label, and the fix is
  either restore the coverage or rename the step, which is not Eye 4's to choose. Everything
  else in the chain is honest, including `bin/ronin-byoin:85`, which names the skip and its
  remedy at runtime. The full forensics ran on the `five-eyes` wipeboard, 2026-08-23, and
  belong with the sweep rather than here.)*

- This document is `wip/`: it is deleted when the work lands.

---

## Verification

**How to read the gates, before anything else in this section.** Three of five Eyes reported
a false green in one afternoon, each from an instrument that looks careful. The rules, owed to
@eye_team and @eye_league:

- **Prefer instruments whose success case and failure case are not identical at the point of
  reading.** `check-docs | tail -1` is blank on failure *and* can be blank on success;
  `check-docs | grep MY_FILE || echo clean` prints "clean" for a typo'd pattern exactly as it
  does for a passing file. Both were used here and both are unsound.
- **Capture once, then read every claim off that one capture** — `OUT=$(node
  scripts/check-docs.mjs 2>&1); RC=$?` — rather than re-running per question. Four sessions
  edit this tree concurrently; two runs are two different worlds.
- **The exit code is the verdict** (`process.exit(failed ? 1 : 0)`), not any line of output.
- **Vouch for your file, never for the repo.** A repo-wide green is one instant, already
  stale, and mostly about documents other sessions are editing right now.
- **Absence of your filename in the output proves nothing** — `check-docs` prints failures
  only, so "not in the FAIL list" cannot be told apart from "never scanned." Use `--all` and
  confirm your file's claims were actually counted.

This build-out's own reading, captured once at `2026-08-23T14:53Z`: exit `0`, verdict *"all
claims hold"*, **68 claims checked in this file, 0 failures**, confirmed with `--all` rather
than inferred from an empty grep. That vouches for this file at that instant and for nothing
else.

Design and acceptance review is browser review against the fixture and the product.
Repository verification is BYOIN — `--gates` before landing on `dev`, and `--ui` before
landing because this is UI work (see § Constraints). Nothing hand-rolled.

**Follow the boot shelf's pointer to `docs/test-protocols.md` at implementation start; do
not quote the shelf's summary.** `src/session-boot.ts` is explicit that the `all/`, root and
`team_role` levels are read **once at birth and never re-sent**; only the
`role/<session_role>/` level re-resolves, and it does so on a `session_role` change. So the
DraftPlan → CutCode transition that begins implementation refreshes the role shelf and
**not** `all/TEST_PROTOCOLS.md`.

The shelf page is **incomplete, not stale and not false** — a looser version of this was
wrong when first written here, so: its only commit is `d413490`, `3f2499c` touched zero
`session_boot` paths, and it never mentions `--gates` or `--ui`. Followed literally it makes
a session **over**-verify, never under, and it names where the contract lives —
*"`docs/test-protocols.md` … is the whole contract"* — which is how this doc found the tiers
at all. The harm is propagation, not behaviour: four of five Eyes copied its compressed
sentence into their **deliverables** instead of following that pointer, and this build-out
was one of the four.

The journeys this surface must demonstrate:

**Valid-blank journeys** — the owner's rule, verified rather than asserted:
- define a Team with a name and nothing else; it appears in League;
- define a Team with zero seats and leave;
- define a Team with a blank `team_role` on a box with no `team_role` definitions at all;
- launch a seat with a blank `session_role`;
- complete a Team with `lead_seat_id: null`;
- leave a half-filled draft, navigate away, come back, find it intact;
- confirm blank sorts last in the `team_role` combobox and unclassified Teams sort last in
  League.

**Preflight journeys:**
- a name that already has a roster; a name with live tag-holders (adoption preview); a name
  matching an existing custom wipeboard (thread adoption);
- an explicit MCP-off on a `cmd` with no `mcp_off:` flags → refuse;
- an explicit MCP-off on `personalassistant` (`mcp: always`) → refuse;
- a defaulted MCP-off that degrades → warn, launches connected, receipt says `mcp: true`;
- an agent seat with no prompt → refuse, field named;
- a manual seat with no name → refuse, field named;
- a seat count over the session max → capacity reported, `cap: exempt` seats excluded;
- an `agent: none` seat (`OpenShell`) handed a `cmd` → refuse.

**Orchestration journeys:**
- clean five-seat launch, ordered, one receipt;
- one seat refused mid-batch: the rest still launch, nothing is rolled back, retry relaunches
  only that seat;
- session max hit at seat 3: seats 4–5 marked `skipped`, not `refused`;
- roster create fails: nothing launches, draft intact;
- lead seat refused: designation skipped and reported, never auto-promoted;
- lead designated on a `QuarterBack` seat: `not delivered` reported honestly and not as an
  error, with the born-with-it note;
- retry after a fixed field: no duplicate sessions, no second roster.

---

## Definition of done

This build-out is done when the owner has approved it. The **work** it plans is done when:

- the canonical draft schema is frozen and Eye 5 consumes it with no second payload;
- the preflight contract is agreed, owned and implemented, and every refusal names its field;
- roster create makes a Team visible in League with zero members;
- ordered launch preserves every successful birth under every failure, with no rollback path
  anywhere in the code;
- retry is keyed on `seat_id` and cannot duplicate a born session or a roster;
- lead is optional at every point, and its post-birth designation and dial-gated delivery are
  reported honestly;
- every valid-blank journey above passes;
- D1–D16 are resolved or explicitly accepted as standing, and this document's copies of the
  contracts agree with the code;
- `bin/ronin-byoin --gates` and `bin/ronin-byoin --ui` both return clean verdicts, and any
  SKIP is reported as unverified rather than as a pass. **The `--ui` verdict is quoted in the
  PR by hand**, because no CI tier produces it — `verify.yml` runs `--gates` and tier 2 does
  not exist. An unquoted `--ui` on a five-view rollout means nobody ran it;
- this file is deleted.
