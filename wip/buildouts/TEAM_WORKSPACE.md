# TEAM WORKSPACE — Eye 2: the Team destination and the terminal host

## WORKSPACE KIT HARDENING DELTA — 2026-08-24

Team now consumes the Kit-owned `TerminalTileHost` lifecycle and the existing `Tile`
transport/render stack rather than reserving a feature-local placeholder. Session-card selection
switches that host; leaving parks it; destroying tears down its wire, observer and timers. Team
also consumes the shared Team controller, typed Team workspace state, shared actions/metadata,
explicit Workbench responsive geometry, and Channel-service lifecycle hooks. Feature behavior
beyond this compatibility proof remains on Team's own ladder.

## CURRENT STATE / RESUME HERE

**As at 2026-08-23T17:36Z. Repo HEAD `989daa5`.** Facts only; the reasoning is below.

### What is built and working

The **Team destination** (`#/team/<name>`) renders and is registered on the frozen Workspace
Kit. Browser-measured, not asserted:

| State | Measured | Ruled |
|---|---|---|
| all three surfaces open | 40 / 19 / 40 | 40/20/40 |
| Kanban collapsed | 49 / 0 / 49 | 50/50 |
| terminal Tile collapsed | 0 / 39 / 59 | Kanban 40 / working 60 |
| Channel surface collapsed | 59 / 39 / 0 | working 60 / Kanban 40 |

Also confirmed in-browser: collapse **and reopen** via the feature's own rails; width and
collapse persistence surviving a reload (`surfaces.channels: true` in `ronin.workspace.v2`);
document title from the Team name; Channel service tabs reading **Chat · Wipeboard · Docs ·
Team Configuration**; Chat carrying `data-reserved` with **zero children**; the terminal Tile
placeholder present with no socket; the Kanban's `failed` state exercised. No page errors.

### Files this Eye owns

- `public/js/team-view.js` — 279 lines, sha256 `d94d6926a8b39837…`
- `public/css/team-workspace.css` — 71 lines, sha256 `fbb7810be8b9e4ba…`

Both are **untracked** (`??`). Byte-copies are held outside the repo for restore.

### Shared seams touched — three lines, not owned

- `public/js/main.js:16` — `import { createTeamView } from './team-view.js';`
- `public/js/main.js:93` — `guard('register the Team destination', …)`
- `public/index.html:32` — the `team-workspace.css` stylesheet link

### Uncommitted

Everything above. **This session has run no git write command.** Root is integrating all
preview slices centrally and has been told not to expect commits from here.

### Integration already applied to an owned file

`team-view.js` was edited outside this session between 16:41Z and 17:36Z — one deliberate
change, `title:` now returns the bare Team name because the runtime gained
`tabTitle()` (`workspace.js:135`), which adds the house. Verified correct and adopted; the
local baseline was refreshed to match.

### Verification actually run, and against what

- `bin/ronin-byoin --gates` — **exit 0**.
- `check-modules` — exit 0. `check-docs` — exit 0.
- `bin/ronin-byoin --ui` — passed earlier **but tested the wrong target**: `defaultUrl()`
  resolves to `http://100.101.235.17:3006/`, served from the separate `ronin-cowork-live`
  checkout, which returns 404 for `team-view.js` and has no `register('team')`. **No `--ui`
  verdict in this rollout has gated this tree.**
- The geometry table above was measured by serving `public/` from a plain threaded static
  server on 127.0.0.1 and driving chromium directly.

### Known limitations — deliberate, per the authorized scope

No terminal host, no socket, no xterm (the Tile is a placeholder). No Chat protocol. No
mutations — Team Configuration reads only. No Sessions mode. Kanban SessionCards are inert
shells: selection needs the terminal host. Gates C and D remain later work, and the frozen
runtime exposes no `park()`.

### Known environment problems

- The documented staging route (`src/index.ts:199-216`) does **not** work here: `STAGING`
  resolves against the *serving* process's root (`ronin-cowork-live`), whose
  `public-staging/` does not exist and whose `/staging/` returns 404. `npm run stage` has
  **not** been run — it writes into the tree root is integrating.
- Starting a second Ronin from this checkout **runs its janitor against the live tmux
  server** (observed: ten viewer sessions cleaned; no real session lost).
- `smoke-ui` is unstable when several sessions drive the one shared server.

### Branch rule — owner, 2026-08-23, standing

`master` is **owner-controlled**. Do not push `master`, merge any PR into `master`, enable
auto-merge, repoint the owner-facing service away from the master checkout, or take an
equivalent release action **unless Glen gives a fresh explicit instruction naming that
specific merge or release in the current task**. Work and pushes stay on `dev`; **opening a
PR does not authorize merging it**. Before executing any authorized release command, record
that command **and the session name** in the relevant handoff first — the shared GitHub
identity `gosmond3` is not attribution, so the handoff is the only record of who acted.

Nothing in this plan requires a `master` action. This Eye has run no git write command at
all.

### Fix applied after the first commit — the HTML `hidden` contract

**2026-08-23, named staging gate fix.** The committed snapshot failed at `/staging`: a
hidden `main.tw-view` still participated in layout, so a hidden `.tw-rail` sat on top of the
Sessions destination and swallowed clicks, and the fingerprinted tile moved from
`x=8 w=690` to `x=912 w=236`.

**Cause, in this Eye's own CSS:** `hidden` is expressed by the UA sheet as
`[hidden] { display: none }`, and *any* author rule setting `display` beats it — author
styles win over UA styles outright, specificity is not involved. `.tw-view { display: flex }`
and `.tw-rail { … display: flex … }` therefore un-hid this destination whenever the shell
hid it, which it does at registration and on every `leave()`. Two rules, one fault; only
`.tw-rails` had been guarded.

**Fix:** one exemption block at the top of `public/css/team-workspace.css` listing every
`.tw-*` element this feature may hide. No shared file touched.

**Verified against the actual failure mechanism**, before and after, by serving `public/`
statically and driving chromium:

| | before | after |
|---|---|---|
| hidden `.tw-view` computed display | `flex`, box 1321×627 | `none`, box 0×0 |
| hidden `.tw-rail` computed display | `flex`, box 42 wide | `none`, box 0×0 |
| `elementFromPoint` over the Sessions grid | **`button.tw-rail`** | no `.tw-*` element |
| tile/home | displaced | `x=6 w=691` (the 2px offset is the static server's failbar, absent a backend) |

Team destination re-checked after the fix and unchanged: 40/19/40, 49/0/49 collapsed,
collapse and reopen both working — so the guard does not disturb the visible case.

### Current blocker

**None technical.** Holding by instruction: root is integrating centrally, owned files are to
stay stable, and this Eye is standing by for *named* gate fixes.

### Single next action

**Wait for root to name a gate and a file.** If it names `team-view.js`,
`team-workspace.css`, or one of the three seam lines above, fix that and re-run
`bin/ronin-byoin --gates` plus the static-server geometry check. Take no other action on the
shared tree.

---

## Goal

**Own Eye 2: Team workspace, both Team and Sessions modes, and the terminal-host
contract.** In the owner's words: build the Team destination against the reviewed
Workspace Kit and Five Eyes contracts — `40/20/40` sizing with collapse and resize,
SessionCards, a focused terminal, the Channel services, a Team-scoped 1/2/4 Sessions mode,
Commons extraction, and terminal lifecycle.

The Team destination is where a Team is actually worked. Everything else in Five Eyes
gets you to a Team or defines one; this is the destination you sit in all day. It is also the
only Eye that owns machinery two other Eyes consume, so the terminal host is the first
leg and not the last.

## The rulings this plan is built on

Owner, 2026-08-23, in review of the audit. These are settled and are not reopened below.

1. **Chat v1 is an intentionally empty reserved Channel service.** Its future owner is a voice/Koshi
   flow reading Kaki summaries from monitored pane output, and that contract is being
   refactored elsewhere. No placeholder protocol, no polling, no composer wiring, no
   inferred fallback, and specifically **not** RIREKI's Conversation projection — the
   earlier recommendation is withdrawn. This plan records the empty state and the future
   integration seam and stops there. Ronin never forces workflow; a null or unclassified
   state is a valid state and is drawn as one.
2. **The Kanban gets a real collapse control**, and the documented geometry is
   implemented: `40/20/40`, `60/40` and `50/50`.
3. **A minimal `@session` identity label stays**, as part of the actions rail. It is a
   label on a rail, not a second header, and it is the only identity the focused terminal
   carries.
4. **Team mode preserves the current session actions** through a compact rail with an
   overflow. Nothing is dropped for want of room; things move into the overflow.
   **Sessions mode keeps the full familiar controls.**
5. **The Team Commons tile in Sessions mode retains Add Member.**
6. **One aggregated Team-session reading seam.** N members × three per-session fetches is
   refused. The ruling's target is the `N`, not a particular call shape — and Leg 3 found
   the satisfying mechanism already landed as `/api/home`, which is **one call for the whole
   box** rather than one per Team. That is fewer requests than the ruling asked for, not a
   departure from it; membership is projected client-side, so no per-Team call is needed at
   all.

## What this Eye owns

- the terminal host and terminal lifecycle (Gate D), for every consumer;
- WorkbenchLayout: geometry, collapse, bounded resize, per-tab persistence;
- the Kanban and its SessionCards;
- the focused terminal and its compact actions rail;
- Channel-surface geometry and its four services, Chat's empty state included;
- Team-scoped Sessions mode and the Team Commons tile;
- the aggregated Team-session reading seam's shape;
- removal of the status light, the context gauge and their support code;
- membership-change fallback in both modes;
- Team workbench and Sessions-mode CSS, namespaced beneath the feature root.

## What this Eye does not own

The route registry, browser history, titles, workspace persistence and migration, the
canonical session store and Team selectors, and the Commons/Configuration extraction —
all Eye 1's. The Team draft and launch profile — Eye 4's. Customization APIs — Eye 3's.
This Eye creates no second Team store, no second launch profile, and no second terminal
transport.

## Starting state — what is actually landed

Measured against the tree, not assumed. Three things are further along than the
build-outs imply and one is further behind.

**Further along.** The tile's four internals are already separated: `public/js/tilewire.js`
(the socket and its reconnect), `public/js/termview.js` (xterm), `public/js/tapeview.js`
(the RIREKI render) and `public/js/composer.js` (text entry). The host contract is
therefore an extraction of `Tile`'s *orchestration* of four existing modules, not a
rewrite of any of them. The six Output modalities landed on 2026-08-23 (`c57d96d`,
documented in `docs/tile.md` by `411d623`) and the host must carry `output` as a first
-class parameter, because changing it reopens the socket. The Team domain's durable half
(`src/team-rosters.ts`, `src/routes/teams-api.ts`) and live half (`/api/teams`,
`/api/teams/:name/live`) are both landed and are the contracts this view consumes.

**Further behind.** `public/js/workspace.js` registers exactly one view — `sessions`,
which is the existing `#grid` — and its lifecycle is `mount / enter / leave` only:
**there is no `park` and no `destroy`**, and there is no migration from
`tmuxgrid.sessions` / `tmuxgrid.layout`, which `state.js` still writes. Its per-tab state
record already carries `team`, `teamMode`, `focusedSession`, `panes {left, kanban, right}`,
`widths {left, right}`, `sessions {map, layout}` and `returnTo`, which is the right shape;
`widths` has no `kanban` entry, and by ruling 2 it does not need one — the Kanban
collapses but is not independently draggable.

**Still tangled.** `Tile` mounts the admin desk inside itself (`installDesk` in
`tile.js`), so Configuration is per-tile chrome today. Terminal extraction cannot finish
until Eye 1 lifts it out.

## Legs

Nine legs, ordered by what unblocks what. Legs 1–3 are foundations two other Eyes wait
on; 4–9 are the destination itself.

### Leg 1 — The terminal host (Gate D)

One module owning the lifecycle `Tile` orchestrates today.

```text
mount(host, {session, output})
switchSession(session)
park()
destroy()
fit()
send(text)
```

It owns: the `TileWire` socket and its reconnect timer, the `TermView` / `TapeView` /
`composer` trio and which is live for the current Output, the `ResizeObserver`, keyboard
focus, the drop flash, and teardown. It does not own chrome — the rail, the header, the
picker and the Commons are the caller's.

`park()` is the one genuinely new verb and it is what stops repeated navigation
multiplying sockets. Parked means: socket closed, tape offset (`tapeAt`) retained, DOM
retained, observers detached, timers cleared — cheap to resume, costing nothing while
away. `destroy()` releases the DOM as well.

**Decision this leg settles: one host per slot, keyed by slot, not a pool keyed by
session.** Team mode has one slot; Sessions mode has up to four. Switching mode parks the
mode you left rather than destroying it, so the count of live hosts is bounded at
`1 + 4` and never grows with how often you navigate. A pool keyed by session grows with
the roster and is the resource duplication the verification contract forbids.

Touches `public/js/tile.js` (the extraction), and reads the four existing modules
unchanged. Blocked on nothing.

**Its consumers are now two, not three.** `WORKSPACE_KIT.md` names three deliberate
compositions — full `SessionPane` for Sessions mode, a reduced Tile for the focused Team
session, and a clean Tile for Agent Configuration. @eye_agent_config posted on the
five-eyes wipeboard (2026-08-23) that Eye 5 ships **no terminal at all**: a proposed seat
has no session to attach to, and the owner ruled its preview to be a composed brief plus a
dry-run resolved profile. So **the clean composition has no consumer in v1** and is not
built. The host still clears the Kit's two-named-consumers bar on the focused terminal and
Sessions mode alone, so the extraction stands unchanged.

@eye_agent_config confirmed the dependency is **zero**, not merely deferred: before launch
there is no session and so no transport, and after launch the seat *becomes* a live session
rendered by this Eye's ordinary compositions in Team workbench or Sessions mode. There is no
moment where Agent Configuration mounts a terminal. They also found that **four** contract
lines carry the stale assumption, not the two named here — `WORKSPACE_KIT.md:207` and
`:368`, and `FIVE_EYES.md:190` and `:300` — all predating the owner's no-fake-terminal
ruling. Listed for the owner; no Eye edits another Eye's build-out.

### Leg 2 — WorkbenchLayout: geometry, collapse, resize, persistence

Three regions, all collapsible, with the documented geometry:

| State | Terminal / Kanban / Channel |
|---|---|
| all open | `40 / 20 / 40` |
| one working surface collapsed | working surface `60` / Kanban `40` |
| Kanban collapsed | `50 / 50` |
| both working surfaces collapsed | Kanban takes the remainder |

**This geometry is no longer mine to build — it landed in the tree while this document
was being drafted.** `WorkspaceKit.layouts.createWorkbenchLayout(terminal, kanban, channel)`
exists (untracked, uncommitted), and `public/style.css` carries all
three ruled ratios keyed off a `[data-open]` attribute: `40/20/40` by default,
`2fr / 3fr` and `3fr / 2fr` for a collapsed working surface, and `1fr / 1fr` for a collapsed
Kanban. Ruling 2 is therefore already satisfied in shared code, and the claim in an earlier
draft that `50/50` went beyond what was reviewed is withdrawn — it exists.

**So this leg consumes the Kit's layout and owns only what sits on top of it:** the
collapse affordances, the splitter drag, persistence, and calling the host's `fit()` after
any geometry change. It does not re-express the ratios.

Widths and collapsed states persist in the current tab through `workspace.js`'s existing
`panes` and `widths` keys — **this view invents no localStorage key of its own.** Three
other Eyes are blocked on the absence of a namespaced per-view storage slot; **Eye 2 is
not**, because `panes {left, kanban, right}` and `widths {left, right}` were already
provisioned at the top level of `ronin.workspace.v1` for exactly this view. Recorded so the
foundation owner knows this leg is not waiting on that slot. Phone
layouts swipe and stack (`.wk-region { flex: 1 0 80% }` at the narrow breakpoint); the
splitters are not drawn there.

**Four findings against the landed geometry.** Raised, not worked around, because the file
is the Kit's and a private fix would fork it:

1. **`setCollapsed` hides the region outright** (`target.hidden = true`), so a collapsed
   region contributes no column and carries no expand control. The reviewed fixture and
   both build-outs specify a **42px rail** holding that control. As it stands, collapse is
   a one-way door unless the caller keeps an external affordance — the same defect the
   ⛩ toggle was fixed for on 2026-08-17 and recorded in `tile.js`.
2. **Collapse does not remember the expanded width.** `setCollapsed` never touches
   `setWidths`, so the ruled "restore the prior width within current bounds" is
   unimplemented. This half is mine (it rides my persistence), but it needs `setWidths` to
   stay idempotent across a collapse cycle.
3. **Bounds are percentages where the reviewed artifact states pixels.** `clamp` holds each
   edge to 25–60%; the fixture bounds the left edge to 240–520px and the right to
   240–480px, and the CSS floors the Kanban at `10rem`. Below roughly an 960px viewport the
   25% floor falls under the reviewed 240px minimum.
4. **A comment and its code disagree.** `setWidths` says "the last changed edge yields when
   necessary" but always subtracts the excess from `right`, whichever edge actually moved.
   Dragging the left splitter silently shrinks the channel.

### Leg 3 — The aggregated Team-session reading seam

By ruling 6, one call per Team per poll. `/api/teams/:name/live` today returns
`{name, dial, session_role, team_lead}` per member. A SessionCard additionally wants the
`session_role` mark, SHINGO position and age, agent/model, working state, and a short
recent status — which today are three further per-session routes (`/tegami`, `/ctx`, and
the status scrape). Drawn per member per poll that is `3N` requests for one Surface.

**Most of this seam already exists, and this leg was over-specified before the tree was
read properly.** `GET /api/home` is the aggregated reading: it takes the session list and
enriches it with the status classification (ready / thinking / awaiting-input), the context
figure and the **model**, at *one capture-pane per session shared by all three scrapes* —
one request for the whole box, which the existing grid already polls every 8s through
`refreshHome()`. And `withAxes` (`src/tegami.ts`) puts `session_role` on **every**
client-facing session list — `/api/sessions`, `/api/home` and both ws pushes — while
`listSessions` already carries `tags` and `leads`. @eye_league's independent finding is
correct: membership, leadership and role need no new route and should be projected
client-side so the board tracks the live event stream instead of racing a second
server-side derivation.

**So the only reading genuinely missing is SHINGO position and age.** It lives in the
letter, reachable only at `/api/sessions/:name/tegami`, one call per session — which is
what `tile.js` does today at four tiles and is exactly the `N` that ruling 6 forbids at
Team size. The narrowed ask is therefore one of:

- `/api/home` grows an optional SHINGO block on the same pass (it is already the enrichment
  point, and the letter read is cheaper than the capture-pane it sits beside); or
- the Kanban draws SHINGO for the **focused** session only, and other cards show position
  and age as absent.

The first is better and is a small addition to an existing aggregator rather than a new
route. Either satisfies ruling 6. **This is the one backend ask in Eye 2's plan.**

**It has a second named consumer.** @eye_league posted that League's session bubbles want
the same reading off the same seam, with the same fallback already planned: absent SHINGO
degrades to plain role and status, and is not fetched at all when michi is off the service
roster. That meets the Kit's own two-consumer bar, so the addition is a shared seam rather
than one view's convenience.

Whichever lands, two honest properties hold:

- **It degrades by service, silently and visibly.** SHINGO is MICHI's, and a build with no
  michi has no `/tegami` route at all. An absent reading is omitted from the payload and
  the card draws nothing in its place — never a placeholder, never a zero. This is the
  `serviceMissing` rule in `state.js` applied to a Team-shaped payload.
- **It is one poll, owned by the Team view**, feeding the Kanban, the Commons tile roster
  and Team Configuration from the same answer, and paused while the tab is hidden — the cadence
  the existing grid already uses.

**This leg is a shared-code seam and is not written unilaterally.** `/api/home` is read by
the existing commons readers, so growing it touches a live surface. Eye 2 specifies the
addition; the foundation owner agrees it before it is written. Named in § Cross-Eye seams.

### Leg 4 — The Kanban and its SessionCards

No redundant "Team roster" header — the destination already says which Team this is. Each
card carries the `session_role` mark, SHINGO position and age, agent/model and working
state, and a short recent status paragraph. Selecting a card switches the focused terminal
and is the visible statement of which session the focused Tile belongs to.

The final card is `＋ Add team member`, offering an existing Unassigned session or a new
session. Raising a new session reuses the existing single-session launch machinery
(`public/js/launcher.js`); this Eye clones no launcher DOM.

**That reuse carries a live defect, raised by @eye_new_team and verified here.**
`public/js/launcher.js:564` sends the team as `tags: [name]` — a bare membership tag —
while `POST /api/launch` accepts a first-class `team` key (`src/routes/launch.ts:69`) that
is what actually resolves the roster. So a session raised through today's launcher joins
the Team but inherits **none** of its durable defaults: no roster project root, no
`team_role` reading shelf, no objective in its brief. `＋ Add team member` would reproduce
that silently. Eye 4 is fixing the same line for its own path; this Eye's card depends on
that fix and does not ship a second one. Until it lands, adding an **existing** session
(a tags write) is correct and raising a **new** one is not.

**And that fix exposes a second refusal underneath it**, raised by @eye_agent_config and
verified here at `src/spawn.ts:283-288`: once a launch actually carries `team:`,
`resolveForm` **throws** for a Team with no roster — *"Team X has no roster on this box.
Create it first (POST /api/team-rosters), or launch without a team and tag the session
afterwards."* On a box that is three-quarters tag-only, that is not one refusal among many;
it is the common one. So the two halves of this card resolve differently, and the code's own
comment states the doctrine:

- **Add an existing session** — a tags write, and explicitly *"the tags route's ordinary
  business"*. Works on any Team, rostered or not, today.
- **Raise a new session onto the Team** — a launch fact, which *"deserves the durable half
  to exist"*. It needs Eye 4's launcher fix **and** a roster. On a rosterless Team the card
  routes to Team Configuration's offer-to-create first, rather than reporting a throw.

Three Eyes reached three faces of one missing path: @eye_new_team's create form,
@eye_agent_config's seat refusal, and this card. None of them is the defect — the defect is
that nothing in the ordinary UI creates a roster.

Cards read from Leg 3's seam only.

The `session_role` mark resolves through `taskIcon` in `public/js/home.js`, which was fixed
at `fba6e34` — landed after this session started — from a stale `taskData` reference to
`roleData`. Before that fix the mark silently resolved to `''` for every session. `roleData`
is the source; the SessionCard draws nothing when a session has no `session_role`, which is a
real answer rather than a gap.

### Leg 5 — The focused terminal and its compact actions rail

The focused terminal carries **one** piece of identity: the minimal `@session` label on
the rail (ruling 3). No status light, no context gauge, no session_role restated, no
model, no connection state, no Team name — all of that is on the selected card or the
application header.

By ruling 4 the rail preserves the current session actions and moves what does not fit
into an overflow rather than dropping it. Inventory, from the landed `tilehead.js`:

| Control | Team-mode home |
|---|---|
| ⚡ macros, Output (mode/lock), 🏷 Teams, 🎛 Control, 📝 note | the rail, as in the fixture |
| 🗑 kill, and the rest of the destructive set | overflow |
| メ mentions, branch, 📄 this session's Docs | overflow — see § Open questions |
| SHINGO chip and the ladder it opens | the SessionCard carries position and age; where the **full ladder** opens is an open question |
| session picker | replaced by the Kanban |
| session_role mark button | the card carries the mark; setting it moves to the overflow |
| the status light (`dot`) and the context gauge | **removed** — Leg 8 |

The fixture's rail titles メ "More session actions"; in the landed head メ is the
*mentions* drop and `moreBtn` is a separate control. Flagged, not silently resolved — see
§ Open questions.

### Leg 6 — the Channel surface: Chat, Wipeboard, Docs, Team Configurationuration

Four Channel services, one at a time, within one Channel surface. Not columns, not a second page header.

**Chat — reserved and deliberately empty (ruling 1).** The tab exists and is selectable.
It renders an empty state saying what the room is for and that it is not yet built, and it
does nothing else: no fetch, no socket, no timer, no composer, no send, no inferred
content from any other surface. It is not disabled and not hidden — a reserved room is a
real state, and Ronin does not force a workflow into an empty one.

The **integration seam**, recorded so the future owner finds it rather than re-deriving it:
Chat's eventual content is a voice/Koshi flow reading **Kaki** summaries produced from
monitored pane output. That contract is being refactored elsewhere and is not this Eye's
to design. What this Eye guarantees for it is a mount point with the standard
surface states available, Channel-surface geometry and tab behaviour already settled, and no
squatting implementation to unpick. The Kit's uncommitted `createReservedPane` is exactly
this state and is what the tab mounts — a reserved room is a first-class primitive here,
not an improvisation. Nothing in this plan reads `koshi_kaki`, and the
`agent_summary` Output modality stays where it is — on a tile's Output selector, not in
this service.

The empty-state sentence is proposed for owner review rather than coined here: the
glossary's rule is that a UI word already in use wins, and *Chat* is already the reviewed
fixture's tab name, so **Chat** stays as the label.

**Wipeboard** — chronological agent-to-agent posts and a composer, and nothing else. The
**Brief does not appear here**; it lives on Team Configuration. The landed
`public/js/wipeboard.js` draws a brief field inline (`wb-brief`), so this is a real change
to an existing room, not a new build: the Team Channel surface mounts the thread half only.

**Docs** — the Team's working documents.

**Team Configuration** — the durable `team_roster` fields (brief, `team_role`, objective, root,
repositories, branch, wipeboard link) writing through `PUT /api/team-rosters/:name`, plus
the **derived** live roster with membership removal. It never posts `members` or
`team_lead` into a roster: the route refuses those by name, correctly, and this service must
not try. Membership is written on the session (`POST /api/sessions/:name/tags`) and
leadership beside it (`POST /api/sessions/:name/team_lead`).

Two honesty rules on those writes, both from @eye_new_team's register and both landing on
this service:

- **A lead hand-over that reports "not delivered" is not an error.** `team_lead` delivers
  `ronin_sops/teams.md` only when the dial is 🤖, and the canonical lead seat resolves to
  👁 read — that session already had the SOP at birth. Team Configuration prints the delivery verdict
  verbatim with a line saying so, and never renders it red.
- **Renaming a Team can adopt a wipeboard thread.** `renameTeamRoster` moves the roster and
  the board follows by the adoption rule — the team wins its name. Rename from this service
  shows what it is about to adopt before it does it.

A Team also needs no lead at all: null is fully valid, for an empty Team and a staffed one
alike, and this service offers no gate that says otherwise.

**And a Team very often has no roster at all — which lands hardest here.** @eye_league drew
the inference from @eye_new_team's launcher finding: because today's launcher sends only a
tag, every Team made through the current UI is **tag-only**, so on an existing box the
rostered Team is the rare one. Measured on this box: **four live Teams, one roster.**
`buildout`, `viewers` and `walk` have no durable record; only `five-eyes` does, and it was
made for this rollout.

Both peers drew that consequence for their own destination — League's board and New Team's
create form. Neither drew it for **the Team destination**, which is the one you actually
open, and it is sharper here than in either:

- `GET /api/team-rosters/:name` **404s** for a tag-only Team, so every durable field this
  service shows has nothing behind it;
- `PUT /api/team-rosters/:name` **400s** with "Team X has no roster. Create it first."
  (`writeTeamRoster`), so Team Configuration's save fails on the majority case;
- the Kanban, the focused terminal and Sessions mode are all **unaffected** — membership is
  derived from tags and needs no roster — which is exactly why this is easy to miss until
  someone opens the fourth service.

So the Team destination **opens cleanly on a rosterless Team**, and Team Configuration's empty
state is an *offer to create the roster* — the adoption path, reached from inside the Team
you are already working in — never an error and never a dead form. A Team with no durable
record is an ordinary state today, not a broken one, and this service says so.

**Two doors, one controller — settled with @eye_new_team.** Their answer to the question
posed here was to keep both and share the machinery: bouncing someone out of the Team they
are sitting in to fix the service they are looking at is worse than a second door, and this door
is the better one for the migration case. So `TeamDefinition`, the preflight and the
`POST /api/team-rosters` call are **one controller with two mount points** — Eye 4's stage 1
and this empty state. **This Eye renders it and builds no second create path and no second
payload**, the same pattern Eye 5 follows for the launch payload.

Adoption and creation read the same two preflight facts oppositely, which is worth having
written down before either is built:

| Preflight fact | New Team (stage 1) | Team Configuration (here) |
|---|---|---|
| Team name | free | **fixed** — it is the Team you are in |
| `name_available` | must be true or it refuses | must be true or this service would not be empty |
| `adopts_sessions` | a **preview** of who arrives | already **true** — the members are why you are here |
| wipeboard adoption | previewed before commit | previewed before commit, identically |

One contract serves both readings with no branch in the route.

**Editing `team_role` here teaches the running Team nothing, and this service must not imply
otherwise.** Raised by @eye_customize and verified here in source. Two levels of the reading shelf sit
side by side — both pushed adjacently at `src/session-boot.ts:224-225` — and behave
oppositely:

- `role/<session_role>/` **is** re-resolved on a committed `session_role` change and injected
  into the running session (`roleFiles`, `src/session-boot.ts:234-247`, called by
  `observeRoleChange`), resolved *at the moment of the change* — so a book added since birth
  is picked up.
- the universal, root, connected-service and **team_role reading levels are birth-only.**
  The authority is the `roleFiles` comment: *"Team_role reading in particular is birth-only
  by ruling."* Nothing watches any directory. (The team_role level is a path
  `session-boot.ts` **builds from the token** — no such directory ships, because stock
  carries no team_role definitions by doctrine, which is the same fact Team Configuration's
  empty picker rests on.)

**Cite `session-boot.ts` for this, not `role-watch.ts`** — a precision this plan got wrong on
first writing and is correcting. `role-watch.ts`'s header is written in **pre-R35
vocabulary**, where *task* was the mutable axis and *role* meant the retired `role_family`.
Read in today's words it says the opposite of what its own file does: line 7 sends a moved
session to a **task-level reading path under the retired axis** — a location that names
nothing in the tree, which is the point — and lines 21-23 say *"Role reading is birth-only by
ruling — a role cannot change while the session lives"*, when `session_role` **is** mutable
and delivering that change is the entire purpose of the file. The behaviour is right; the
prose beside it teaches the wrong model. @eye_agent_config filed it as the seventh face of
the retired-axis sweep, and it is the sharpest one — it is the comment an agent would read to
learn whether reading levels refresh.

So a `team_role` written or changed from this service reaches **only sessions born onto that
team afterwards**. Its live members never read it, and neither do members adopted into a
roster by the offer-to-create above — they become full members immediately and never get the
brief. What *does* update is the derived `teams` block in each member's letter, refreshed by
`writeTeams` and surfacing on their next reread, which changes what their letter **says**
about the team without delivering the team's **reading**. This service states that plainly
rather than letting a save read as "the team now works this way".

`team_role` is a **suggestion picker over free text, never a hard select.**
`GET /api/team-roles` serves the definitions (raised by @eye_customize and verified here),
but the route's own contract says a roster may name a `team_role` with no definition behind
it — the reading shelf is then simply empty — and `team-rosters.ts` types the field as a
plain mutable string where blank is valid. A closed dropdown would refuse a state the store
accepts. @eye_league verified further that stock `ronin_catalogs/team_roles/` ships **zero**
definitions — only a README — so on every box today the picker's list is empty and the
field degrades to plain text.

**And this service would be the client's first consumer of that route.** Verified here:
`GET /api/team-roles` has **zero callers** anywhere in `public/js/`, and the only client
mention of `team_role` at all is `shingo.js:161`, which renders it as text off the letter's
derived teams block. So the picker is a **new call site**, not the reuse of an existing
fetch, and it inherits no caching or failure handling from anywhere. @eye_customize's
sentence for the combined state is better than either half alone: today, editing a
`team_role` definition moves nothing on any surface *and* delivers no reading — two silences,
two causes, one nothing. It is drawn as text with suggestions when suggestions exist,
never as an empty dropdown.

### Leg 7 — Team-scoped Sessions mode and the Team Commons tile

The familiar 1/2/4 arrangement, with the eligible set constrained to the selected Team.
By ruling 4 **the tiles keep the full familiar controls** — the current head, not the
fixture's mini-head — with the session picker scoped to Team members plus the Commons.
Restored slots are revalidated against current membership on entry (Leg 9).

The Team Commons tile is a real non-terminal tile occupying an ordinary slot, with its own
tabs: Roster, Wipeboard, Docs, Team Configuration — and, by ruling 5, **Add Member**, so a Team
can gain a session without leaving Sessions mode. It carries no session header, because it
has no session.

Its Roster tab is `public/js/roster.js`, which @eye_league reports duplicates League's
membership logic and is being left untouched in v1. That duplication therefore surfaces
**here**, in this tile, and this Eye inherits it rather than resolving it: the Team Commons
roster is Team-scoped where League's is global, and reconciling the two is a cleanup slice
after both destinations exist, not a v1 leg.

The tab list is a filtered read of the shared registry `public/js/panes.js`, which today
knows two values in its own `surface` column (`commons`, `desk`) — **the registry's word,
not a Surface in the ruled sense**. A Team commons needs a third. Editing that registry
is a shared-file change and goes through the foundation owner — named in § Cross-Eye seams.

### Leg 8 — Removals

The status light (`dot`), the context gauge, and the support code that exists only to feed
them: `refreshCtx`'s gauge half, the 30-second gauge poll in `layout.js`, the gauge widget
in `tilehead.js`, and the `setFooter` reading where it is gauge-only. `/api/sessions/:name/ctx`
is a server route and stays — a service owns its own endpoints, and this client ceasing to
be a consumer is not a reason to remove one. Neither reading comes back in another form.

### Leg 9 — Membership-change fallback in both modes

A session can leave a Team, die, or join while the destination is open, and both modes must
behave without a reload:

- **Team mode** — the focused session leaves or dies: the Kanban drops its card, focus
  falls to the first remaining member, and the terminal host `switchSession`es rather than
  remounting. A Team with no live members shows the Kanban's `＋ Add team member` card
  alone and an empty focused Tile — a normal state, since a roster with zero members is a
  normal state.
- **Sessions mode** — a slot whose session left the Team is revalidated: the slot empties
  to the Commons rather than silently continuing to show a non-member's terminal.
- Membership changes made from the Channel surface's Team Configuration are reflected in both modes
  from the same reading, not from a local guess.

## Files this Eye creates

**A 900-line contract that never says where the code goes is half a plan.** An earlier draft
described every behaviour and named not one new file; a successor would have known exactly
what to build and nothing about where to put it. Named here concretely and marked with the
checker's planned-marker, which it exempts by design precisely so a document can name a thing
before it exists. The exemption lives in `scripts/check-docs.mjs` at line 251.

The house convention is **flat** — `public/js/` holds 63 modules and no subdirectories — and
the Kit's own new modules follow it with a shared prefix (`workspace-kit.js`,
`workspace-layouts.js`). These take the same shape.

**`[planned]` means not-yet-built, NOT agreed** — @eye_league's distinction, and it applies
to this table. The marker is the checker's sanctioned way to name a thing before it exists;
it says nothing about whether anyone has ratified the layout. **These six names are this
Eye's proposal**, derived from the house convention rather than from a ruling, and the
foundation owner may want them elsewhere. A successor should read the table as *what this
plan intends to create*, not as *where the Kit has agreed this goes*.

**A third marker failure, found here and not previously filed by anyone: the word of the
marker exempts the line that discusses it.** `check-docs:251` tests `line.includes('[planned]')`,
so a sentence *about* the marker carries the literal string and is skipped — along with any
real claim sharing that line. Proven by breaking it: an earlier draft of this paragraph cited
the checker's own path on the same line as the quoted marker, and a deliberate typo in that
path produced `exit=0`, zero failures. Moving the citation to its own line makes the identical
typo fail immediately. **The more carefully a document explains the exemption, the more claims
it accidentally exempts** — this was the least-checked paragraph in this file precisely because
it is the one explaining the checker. Distinct from a *dead* marker (one with nothing to
exempt, which is wasteful and harmless); this one is silent and dangerous.

The marker is also **per line** — `check-docs.mjs:251` tests `line.includes`, so it must sit
on the same physical line as the path it exempts, which is easy to get wrong in a wrapped
paragraph. Verified load-bearing here rather than assumed: stripping the six markers makes
`check-docs` report exactly six failures against this file, and restoring them returns it to
*all claims hold*.

| File | Leg | Holds |
|---|---|---|
| `public/js/team-host.js` [planned] | 1 | the terminal host — `mount/switchSession/park/destroy/fit/send`, one per slot |
| `public/js/team-workbench.js` [planned] | 2 | collapse affordances, splitter drag, persistence, `fit()` on geometry change |
| `public/js/team-kanban.js` [planned] | 4 | the Kanban and its SessionCards, including `＋ Add team member` |
| `public/js/team-rail.js` [planned] | 5 | the focused Tile's compact actions rail and its overflow |
| `public/js/team-channel.js` [planned] | 6 | the Channel surface and its four services |
| `public/js/team-sessions.js` [planned] | 7 | Team-scoped Sessions mode and the Team Commons tile |

**The CSS has no honest home yet, and that is a seam, not an oversight.**
`WORKSPACE_KIT.md:398` says feature CSS is namespaced beneath the feature root and warns
against "five edits to a global stylesheet" — but this repo has exactly **one** stylesheet,
`public/style.css`, and **no per-feature stylesheet directory under `public/`**. So either the
Kit's warning implies such a directory, which nothing has created, or feature CSS lives in
namespaced blocks in the one stylesheet and the warning means "namespaced, not scattered".
**@eye_league has already planned a League stylesheet in that not-yet-existing directory**,
which would create it — so this is one decision affecting at least two Eyes and it belongs to
the foundation owner, not to whichever of us writes a stylesheet first. Listed in § Cross-Eye seams.

## Constraints

- No code, no builds, no commits until the owner says go. This document is the deliverable.
- One application header. Local chrome earns its space; the rail's `@session` label is the
  one identity exception and it is a label, not a header.
- No second terminal transport, no second Team store, no second launch profile.
- No view module reaches into another view's DOM.
- No new `localStorage` key. Per-tab state goes through `workspace.js`.
- Feature CSS is namespaced beneath the feature root. Shared primitives and shared shell
  files change through the foundation owner, not by five parallel edits.
- Membership stays many-to-many and session-owned. Removing membership never kills a
  session.
- An absent optional service leaves its surface opaque and unfetched; an absent reading is
  omitted, never placeholdered.
- **The foundation vocabulary, ruled by the owner 2026-08-23** and used throughout this
  document: **pane** means only the tmux object inside the tmux server. Ronin renders session
  output into a **Tile**. A **Surface** is a larger coworkspace region that may host a
  terminal Tile, the Kanban, or Channel services. **Chat, Wipeboard, Docs and Team
  Configuration are Channel services** — their contents are never called panes or panels.
  This Eye writes *pane* only for tmux's own object (`capture-pane`, monitored pane output)
  and where quoting a landed code symbol verbatim; those symbols are named in
  § Open questions 6.
- **"Tab" is not a banned word and must not be swept blindly.** Three distinct uses live in
  this document and only one was wrong. The **browser tab** (per-tab persistence, the Team
  name as the document title) is untouched by the ruling. A **commons tab** is blessed house
  vocabulary — KOTOBA_GLOSSARY's `commons_tab` row says *"One section of the commons, reached
  from its tab strip. Say the Roster tab, the Docs tab. Never 'pane' or 'panel'"* — so the
  Team Commons tile's Roster/Wipeboard/Docs/Team Configuration tabs keep the word. What was
  wrong was using *tab* as the **noun for a Channel service itself** ("the fourth tab is
  dead"), which encodes the model the ruling replaces: four services **hosted by** a Surface,
  not four tabs **of** a thing. Reached-by-a-tab is an affordance; being a tab is the old
  model.
- **Surface is now a defined term, so the loose word is a collision.** Where this document
  means a first-class view it says **destination** — the shell's own word — and where it
  means the ruled region it says **Surface**. Ordinary English survives ("the surface a
  reader meets first", "that duplication surfaces here"), and `panes.js`'s own `surface`
  column is called out by name wherever it appears, because it predates the ruling and does
  not mean Surface.
- The existing coworkspace stays usable throughout. Legs land as small integrated slices on
  `dev`, not one long-lived branch.
- **Legs 2, 6 and 7 do not start until the Workspace Kit files are committed and frozen.**
  They consume `workspace-kit.js` and the three modules behind it, all four untracked in the
  working tree, which changed under this session twice mid-draft — once in content, once in
  export shape. Building
  on a moving floor is how two implementations of one geometry appear. This plan is
  re-checked against those files when they land.
- Repository verification is `bin/ronin-byoin` and nothing hand-rolled.

## Cross-Eye seams

Named so they are agreed rather than discovered mid-slice.

**The addressee changed on 2026-08-23.** @eye_league posted that the owner narrowed Eye 1
to League integration only, with the Workspace Kit a separately supervised workstream. Four
seams this plan had addressed to Eye 1 are therefore the **foundation owner's**, not Eye 1's.

| Seam | Who | What is needed |
|---|---|---|
| `park()` / `destroy()` on the view lifecycle | foundation owner | `workspace.js` has `mount/enter/leave` only. Leg 1's host contract depends on `park`. |
| legacy workspace migration | foundation owner | `state.js` still writes `tmuxgrid.sessions` / `tmuxgrid.layout`; `workspace.js` does not migrate them. |
| the admin desk leaving the Tile | foundation owner | `installDesk` is mounted inside `tile.js`. Leg 1 cannot finish the extraction around it. |
| four findings against `createWorkbenchLayout` | foundation owner | Leg 2. The file is the Kit's; a private fix would fork it. |
| ~~`createCard` lacks `active`~~ | ~~foundation owner~~ | **Withdrawn on inspection.** `createCard` already carries `selected`, and the Kanban card whose terminal is focused *is* the selected card — a second concurrent state was not needed. @eye_customize declined to queue the same ask and @eye_league wraps the list in a `createPane` instead; the "two named consumers" argument made here was unsupported and is retracted rather than left in the foundation owner's queue. |
| `document.title` has two writers | foundation owner | Finding 3 below. Sessions mode makes it fire constantly. |
| SHINGO on `/api/home` | foundation owner | Leg 3's one backend ask. |
| where feature CSS lives | foundation owner | One stylesheet exists (`public/style.css`) and no per-feature stylesheet directory; the Kit warns against five edits to a global sheet. Affects at least Eye 1 and Eye 2. |
| a third value in `panes.js`'s `surface` column | foundation owner | Leg 7's Team Commons tab list. That column's word predates the ruling and does not mean Surface. |
| `＋ Add team member` → launch | Eye 4 | Reuses existing single-session launch machinery; no cloned launcher DOM. Depends on the `team:` fix, and on a roster existing. |
| roster-create controller | Eye 4 | One controller, two mount points — their stage 1 and this Eye's Team Configuration empty state. Settled 2026-08-23. |
| ~~terminal host for the config preview~~ | ~~Eye 5~~ | **Withdrawn.** Eye 5 ships no terminal; see Leg 1. |

**Everything is reached through one namespace.** The Kit's export shape changed under this
session mid-draft: the three modules went from bare named exports to frozen namespace
objects, and `public/js/workspace-kit.js` now exports a frozen
`WorkspaceKit = { primitives, layouts, adapters }` described in its own header as "the one
reachable Gate A hand-off". This plan consumes `WorkspaceKit` alone and reaches into none of
the three modules directly.

Landed Kit pieces this plan now consumes rather than builds:
`layouts.createWorkbenchLayout`; `primitives.createChannelPane` (with `channelTabs` already
spelling chat / wipeboard / docs / team-config); `primitives.createReservedPane` — which is
precisely Chat's empty state; `primitives.createPane` and its six `states`;
`layouts.createSessionGrid`; and `adapters.createCommonsWorkspaceView` for the Commons
extraction Leg 7 waits on. Legs 2, 6 and 7 shrank accordingly.

**The four findings in Leg 2 survive that reshape verbatim** — re-read after it, the
`createWorkbenchLayout` body is byte-for-byte what it was; only its export moved. A reshape
that changes the reachable surface without touching the behaviour underneath is worth
recording as such, because it would be easy to assume the findings had been addressed.

## Open questions

Raised, not guessed at. Ruling 4 gives all three of the first group a home in the overflow,
so none of the first three blocks a leg — but each has a better answer than "overflow" and the answer
is not this Eye's to invent.

1. **Where does the full ladder open?** The SessionCard carries SHINGO position and age.
   Tapping the chip is *always* the ladder today. In a Team workbench the ladder wants
   room, and the card is small.
2. **メ names two different things.** The reviewed fixture titles it "More session
   actions"; the landed head uses メ for *mentions* with a separate `moreBtn`. One glyph,
   two meanings, and the fixture is the reviewed artifact.
3. **📄 this session's Docs versus the Channel surface's Team Docs.** They are different sets —
   one session's listed documents, and the Team's working documents. Folding one into the
   other loses the per-session list.
4. **`document.title` has two live writers, and Sessions mode makes them fight.**
   `state.js`'s `syncTitle` fires from **every** `saveState()` and sets the title to the
   first tile's session; `workspace.js` sets it from the active view. Last write wins,
   which is not a policy. The settled contract is that a Team browser tab wears the **Team
   name** — but every slot change, connect, detach and layout cycle in Sessions mode calls
   `saveState()` and would overwrite it. @eye_league raised this from the League side; it
   is listed again here because Sessions mode is where it fires most often. Title is the
   Kit's by contract, so `syncTitle` should go rather than be worked around. @eye_league
   agrees the ruling should be driven from this destination: League navigates rarely and is
   clobbered occasionally; Sessions mode is clobbered continuously.

5. **The BYOIN verification change — this Eye's to own, and not a "sweep" at all.**

   **What actually happened, corrected twice and now checked against the diff.**
   `3f2499c` **grew one mode, not three.** `--gates` already existed, as *"the repo half
   only — for a machine with no live install"*; the commit **added `--ui`** and
   **redefined `--gates`** as the fast tier. This plan said it "made BYOIN three tiers",
   which is the same true-fact-with-an-unearned-quantifier shape corrected four times
   elsewhere in this document — and the pre-image was in a diff this Eye had already read.

   **And the summaries were not stale — they were correct until 12:26 today.** The page
   before `3f2499c` instructed, in its own words: *"Run BYOIN before landing work on `dev`
   … **Landing work and testing it are the same single call.**"* So "one command, one
   verdict" was **the contract's own developer instruction**, not a compression that
   drifted from it. Every summary carrying it was accurate when written and accurate when
   this session was born. The doctrine changed under all five Eyes at once, ninety minutes
   in. That is why it propagated cleanly and why nobody smelled anything — there was
   nothing to smell. **"Sweep" is the wrong word**, and the earlier drafts of this item
   used it throughout.

   The H1 — *"one command, one verdict, nothing else to run"* — was likewise **kept by that
   commit, not written by it** and not left behind by it: `3f2499c` rewrote the code block,
   the run-mode paragraph and the developer paragraph, and touched line 1 not at all.
   A deliberate retention.

   **What survives, undiluted:** four of five Eyes wrote a verification section from a
   summary that correctly pointed at the contract page, without opening the page. The
   summaries did their job. We did not do ours — and that they were *right* this morning
   makes the omission clearer, not more excusable, since the page had been rewritten ninety
   minutes before we cited its summary and opening it was one command.

   **The earlier draft's overstatement, kept visible.** This plan said the boot
   page's sentence was *"now false at the word that matters"*. **It is not false.**
   `docs/test-protocols.md:7` describes bare `bin/ronin-byoin` as *"every repo check, every
   readout, then one verdict"* — so a shelf sentence reading *"every check, one verdict"* is
   an accurate description of **the bare command**, which is exactly what it names. It is
   **incomplete**, not wrong: it teaches one mode where three now exist. Following it
   literally makes you **over**-verify — bare BYOIN is both repo tiers plus readouts, more
   than a repo change needs, never less. **There is no correctness hole here and this plan
   asserted one.** @eye_customize retracted the same claim from the other direction; the
   error shape was identical and shared — verify something true (the page was never swept)
   and attach a stronger conclusion than the evidence carries.

   What survives is **propagation, not falsity**: four of five Eyes copied a compressed
   summary into their deliverables as the verification contract instead of following a
   pointer one clause away — and the pointer works, since following it is how the tiers were
   found at all. That is a real defect with a different fix and a lower severity than
   "stale and false".

   The git evidence is untouched and remains verified: `3f2499c` widened the contract and
   **did not update** the pages that summarise it — `git log -1` on the boot page returns
   `d413490` alone, and `3f2499c`'s six files include none on the boot shelf. The faces,
   derived in the tree rather than taken from a peer's list:

   | Face | What it still says |
   |---|---|
   | `CLAUDE.md:3` | "one command (`bin/ronin-byoin`), one verdict" |
   | `ronin_session_boot/all/TEST_PROTOCOLS.md:3` | "every check, one verdict" |
   | `FIVE_EYES.md:387` | "run only `bin/ronin-byoin` … report its single verdict" |
   | `WORKSPACE_KIT.md:393` | "Repository verification is only `bin/ronin-byoin`" |
   | `WORKSPACE_KIT.md:411` | "the final `bin/ronin-byoin` verdict" |

   Plus four of the five Eye build-outs, since corrected by their authors. Every one of these
   is a summary that was **accurate to the doctrine live until 12:26 today**, not a false
   statement and not a neglected one, and
   each correctly points at `docs/test-protocols.md` as the contract. The ask is to widen the
   summaries, not to fix an error.

   **And the error only ever runs in the safe direction** — @eye_agent_config's claim,
   verified here across all five faces rather than accepted for four: **not one of them names
   a flag.** Anyone following any of them literally runs bare `bin/ronin-byoin`, which is the
   most complete tier. So the defect is **cost and precision, never coverage**; none of these
   lines can cause unverified work to ship.

   **Two of them differ on axes worth separating:** `CLAUDE.md` has the widest reach — every
   CLI auto-reads it, not only Ronin sessions — but it is *repairable*, re-read each session.
   The boot page reaches fewer readers but is **birth-only**, so a widening never reaches
   anyone already running. Widest versus unrepairable. Given the severity is now
   "incomplete", neither is urgent on correctness grounds; the case for doing them is that a
   compressed summary is the part that gets copied, which five sessions demonstrated in an
   hour.

   This is a **different sweep** from the retired-`role_family` one, a point @eye_customize
   was right to insist on: same failure mode, different ruling, different commit. Filing it
   under their count would have made the number mean "all documentation drift", which nobody
   can act on. This plan had it wrong as "the ninth face" and no longer does.

6. **RULED (owner, 2026-08-23) — the foundation vocabulary.** This Eye raised the collision
   between KOTOBA_GLOSSARY's retirement of *pane* and the Kit's `Pane` / `SessionPane` /
   `ChannelPane` primitives. The owner has ruled the taxonomy:

   | Term | Means |
   |---|---|
   | **pane** | **only** the tmux object inside the tmux server |
   | **Tile** | what Ronin renders session output into |
   | **Surface** | a larger coworkspace region, which may host a terminal Tile, the Kanban, or Channel services |
   | **Channel service** | Chat, Wipeboard, Docs, Team Configuration — their contents are never panes or panels |

   This document is normalized to it. The question is closed and this row is kept only to
   record the ruling and what it leaves outstanding.

   **What it leaves outstanding, for the foundation owner and not for this Eye.** The ruling
   names the concepts; the landed Kit still names its code symbols the old way —
   `WorkspacePrimitives.createPane`, `createChannelPane`, `createReservedPane`, plus
   `SessionPane` and `ChannelPane` in `WORKSPACE_KIT.md` and the `panes {left, kanban, right}`
   key in `ronin.workspace.v1`, and the `panes.js` registry whose own `surface` column now
   collides with the ruled meaning of **Surface**. This Eye consumes those symbols and does
   not rename them: renaming shared Kit API is the foundation owner's, and doing it privately
   would fork the namespace five Eyes just agreed to consume through `WorkspaceKit` alone.
   Flagged, not actioned — and cheaper before the freeze than after.

   **One label discrepancy against the reviewed artifact**, raised not resolved: the ruling
   names the service **Team Configuration**; the reviewed fixture's tab strip reads
   **Team Config**. A tab is one string in a four-tab strip, so the short form may be the
   deliberate on-screen label — but the glossary's rule is that the UI's own word wins, and
   two spellings are how a closed set stops being closed. @kotoba's, or the owner's.

7. **@view_mgr can be read to, not written to — and that changed mid-session.** When this
   plan was written, `view_mgr` was live on team `viewers` at dial 👁 and was not a member
   here, so `tejun-send` answered DENIED and five Eyes' registers were undelivered. **It is
   now a member of `five-eyes`**, still at 👁 — so the tool reports it *"not notified — dial
   👁 (watch-only); it can read the wipeboard itself"*. Sending is still refused and no dial
   has been flipped by anyone. What changed is that everything posted to this team's board is
   now reachable by them without a dial change, so nothing needs re-filing for their benefit.
   Recorded because an earlier draft of this row said flatly that the registers could not
   reach them, and that is no longer true.

## What a successor is born believing, wrongly

**Read this first if you are picking up Eye 2 and did not write this document.** Reading
levels are birth-only except `role/<session_role>/`, and nothing watches a directory — so a
successor session is handed the contracts as they were, with no signal that any of it moved.
Every line below was true in a document you will be given and is false in the tree today.
Each row states its claim **and where to check it**, so any single row can be verified
without trusting the table — a table whose rows all look verified makes a wrong row look
verified too, and one of these was wrong until @eye_customize checked it rather than copying
it. The section each belongs to carries the detail.

| You will be told | What is actually true |
|---|---|
| Verification is one command, one verdict (`CLAUDE.md:3`) | Three tiers (`docs/test-protocols.md:5-15`), and **`--gates` no longer drives browser UI** (`bin/ronin-byoin:84-85`) though CI and pre-push use it. Eye 2 owes `--gates` **and** `--ui` — it is rendered UI, browser journeys, layout and visual composition, four for four |
| Agent Configuration consumes the terminal host (`WORKSPACE_KIT.md:207`, `:368`; `FIVE_EYES.md:190`, `:300`) | Eye 5 mounts **no terminal at all**. The clean composition has no consumer and is not built; Gate D serves two |
| Eye 2 builds the WorkbenchLayout geometry | `createWorkbenchLayout` and all three ratios already exist (`workspace-layouts.js`; `style.css:6471-6474`). This Eye **consumes** them and owns only collapse, drag, persistence and `fit()` |
| The Kit is a set of bare named exports | It is a frozen `WorkspaceKit = { primitives, layouts, adapters }` (`public/js/workspace-kit.js`). Consume that namespace alone; the bare exports are gone, not supplemented |
| `role_family` is a live axis | Dismantled at R35 — but **the code is split, and an earlier draft of this row got it exactly backwards.** The *launch and letter* paths refuse it by name (`src/routes/launch.ts:60-65`, `src/routes/sessions-api.ts:215` and `:248`, `ronin_bin/write_tegami:449`, `GET /api/launch-profile`). The *saved-launch* path still **carries it end to end**: `src/catalog.ts:277` types it, `:294` reads it, `:305` filters on it, `:313` lists it in `LAUNCH_FIELDS`, `:326` accepts it as **sufficient** on its own, and `src/routes/catalogs.ts:324`/`:355` read and write it. So this is **not** a documentation-only sweep — check before you edit, and do not take any list of refusal sites as exhaustive |
| `role-watch.ts` describes the reading shelf | **Do not cite its header.** Pre-R35 vocabulary; it says the opposite of what its own file does. Cite `session-boot.ts:224-247` |
| Chat is a live protocol (the fixture shows a thread) | Owner-ruled a **reserved empty Channel service**. No protocol, no composer, no polling, no fallback |
| `/api/teams/:name/live` is the seam for card readings | `/api/home` is the aggregated seam and already exists (`src/routes/launch.ts:265+`; `withAxes`, `src/tegami.ts:426`). Only SHINGO is missing |
| A Team has a roster | Three of four Teams on this box are **tag-only** (`tejun-team` vs the `team_rosters` store; refusals at `src/team-rosters.ts` `writeTeamRoster` and `src/spawn.ts:283-288`). Team Configuration must offer to create one, not 400 |
| A `check-docs` failure in your run is about your work | **Five sessions share one gate.** Measured: four different answers in ninety seconds, as peers edited their own build-outs — a failure naming another document is somebody mid-edit, not your problem, and *repo-wide green* is a reading of one instant that is stale before you finish describing it. Capture once and report from that capture; vouch for your own file, never for the repo. One Eye nearly spent real time chasing a peer's deliberate test probe |
| `write_tegami` merges what you send | It **replaces** the block, which is exactly five keys — `objective`, `session_role`, `repos`, `ladder_state`, `ladder` (`ronin_bin/write_tegami:417`). **Three distinct behaviours, not one** — omitting `repos`, `objective`, `session_role` or `ladder` loses real content, and that is the trap that caught three of five Eyes; omitting `ladder_state` is the **documented normal case**, since absent means `on_track` and "costs nobody a keystroke"; and including `docs`, `teams`, `at` or `role_family` **refuses the whole write** (`:449-457`), each with its own printed reason. `docs` has its own two verbs and is carried through by design. Rebuild from `read_tegami`, stripping the refused four — do **not** conclude "always send all five" |

## Verification

**What to run, and it has not changed once all day:**

1. `bin/ronin-byoin --gates` before landing on `dev`. This is what pre-push and CI run.
2. `bin/ronin-byoin --ui` before landing, as the rendered proof. **This is the only tier
   that looks at these views at all.** `--gates` does not drive browser UI; `visual-ui`
   is the gate that measures the `40/20/40`, `60/40` and `50/50` compositions.
3. Report both verdicts. **A SKIP is not a pass** — a skipped `visual-ui` means this Eye's
   geometry has **not** been measured, and must be reported as unverified rather than passed.
4. **A safeguard you have not broken is a safeguard you have not verified.** @eye_agent_config's
   rule, and it generalises past markers to any protection: a gate you have not seen fail, an
   exemption you have not tested, a check whose failure mode you have never observed. It is
   the rule that found every other item in this list — the inert marker, the fence, and the
   word-of-the-marker exemption above were all invisible to reading and obvious the moment
   something was broken on purpose. Break it, watch it fail, put it back.
5. **Read a gate by its exit code, not by a filtered view of its output.** Three sessions
   reported a false green in one afternoon, and none of it was carelessness with a good
   instrument — it was instruments whose success case and failure case are *identical at the
   point of reading*. `check-docs 2>&1 | tail -1` prints a blank line whether it passed or
   failed (the script ends with one); `… | grep <myfile> || echo CLEAN` prints CLEAN both
   when the file is clean and when the pattern is wrong. Both were in use here. The reliable
   form is `node scripts/check-docs.mjs >/dev/null 2>&1; echo $?` — `0` clean, `1` failures —
   with `tail -2` for the verdict line. **"Is the repo green" and "is my file clean" are
   different questions**; answer the first by exit code before asking the second.

**The general rule, which is worth more than any of the specific gates:** every false green
in this rollout came from a check that is *silent when something is wrong*, and silence reads
as success. Prefer instruments that must say something to pass.

**A green pre-push and a green CI prove nothing about the Team workspace.** Both run
`--gates`. CI additionally has no browser at all, and never had one. The `--ui` verdict is
local-only and quoted by hand; there is no CI tier for it yet (`verify.yml:13`).

Full `bin/ronin-byoin` is the installed-box tier — both repo tiers plus machine readouts.
Running it satisfies the above and more; it is never less.

No per-session shell sequence is invented. Browser review of the fixture remains design
acceptance, not a substitute for the gates.

### How that was established, and what this plan got wrong reaching it

Kept because the citations are worth having and because the corrections are part of the
record — but the instruction above is the deliverable, and it never moved.

`3f2499c` landed after this session began. It **added `--ui` and redefined `--gates`**;
`--gates` already existed (`3f2499c^:bin/ronin-byoin:5`). The page's own instruction is
complete: *"`--gates` is the ordinary developer/pre-push/PR mode. Run `--ui` when a change
can affect rendered UI, browser journeys, layout, or visual composition"*
(`docs/test-protocols.md:12-14`).

Coverage moved in exactly one place: a developer machine **with** a headless browser, where
`--gates` used to run the UI gates (`3f2499c^:bin/ronin-byoin:86`, no mode test) and now
skips them (`bin/ronin-byoin:84-85`). On CI nothing moved — the runner has no browser, so
the render check already skipped for want of one; the deleted `verify.yml` comment says so:
*"A runner has neither, so `ronin-byoin --gates` SKIPs that one check WITH ITS REASON."*

The trade is announced three times — `.githooks/pre-push:23-25`, `.github/workflows/verify.yml:9-11`,
and BYOIN itself at runtime. One place says otherwise: `verify.yml:45`, the CI **step name**,
reads *"BYOIN — every check, then one verdict"* above a `--gates` run. Nobody wrote a false
label; `3f2499c` changed **only comment lines** in that file, so a label that was true of the
old configuration went stale two lines from an edit. The honest options are **restore the
coverage the label claims** or **rename the step to the tier it runs** — different decisions,
different owners, and not this Eye's to propose.

**What this plan asserted and withdrew along the way**, listed so no reader trusts a
confident sentence here without checking it: that the boot page's summary was *false* (it is
accurate about the bare command, and incomplete); that the summaries risked under-verifying
(every one names bare BYOIN, so they over-run); that `3f2499c` "made BYOIN three tiers" (it
added one); that following the current page correctly is what skips browser UI (the page says
to run `--ui`); that the change was undocumented (three notices); that the CI label was "a
single string" to fix (it describes a configuration that no longer exists); and a heading here
that outlived its own caveat. Ten corrections, none of them caught by this session
unprompted. Check the citations rather than the prose.

**FIRST, BEFORE ANY OF IT: re-read `docs/test-protocols.md` from the repo.** Do not trust
the boot-shelf copy in your context. This is an instruction to whoever carries this plan
into implementation, not a note to the session that wrote it — the session that builds this
may not be this session.

The reason is mechanical, and @eye_new_team put it together from a fact this Eye had
verified but not followed through. `ronin_session_boot/all/TEST_PROTOCOLS.md` is an `all/`
level reading and is **birth-only**; it says *"every check, one verdict"*, which accurately
describes bare BYOIN but names one mode where three now exist, and it was not swept when
`3f2499c` widened the contract (see § Open questions 5, including this plan's correction of
its own earlier "false" claim). Meanwhile `role/<session_role>/`
**is** re-resolved at the moment of a committed role change (`src/session-boot.ts:234-247`).
Every Eye is `DraftPlan` today and becomes `CutCode` the moment the owner says go — so **the
single event that starts implementation refreshes the shelf that did not need correcting and
leaves the stale page in place**, with nothing to signal it is superseded. Correcting the doc
does not correct the copy already in a running session's context. One command defeats it;
nothing else does.

**The first journey needs no setup, because the box already is it.** @eye_league re-ran the
measurement above independently and it holds: one rostered Team, three tag-only, and a
non-empty holding area. That is not a scenario anyone has to construct — it is simply what is
there, which makes it the cheapest and most honest fixture available and the first thing to
walk. Open `buildout`, `viewers` or `walk`: the Kanban, focused terminal and Sessions mode
must all work, and Team Configuration must offer to create the roster rather than 400. Then open
`five-eyes` for the rostered path. @eye_league has made the same state their journey 26 and
first-to-walk for the same reason.

The browser-review journeys for this Eye:

- `40/20/40`, `60/40` and `50/50`; collapse and expand each of the three regions; bounded
  resize on left and right; a collapsed region restoring its prior width; widths and
  collapsed states surviving a refresh in the same tab and not leaking into another tab;
  phone swipe/stack composition with no splitters drawn.
- Selecting each SessionCard switches the focused terminal, with visible selection and
  keyboard focus order intact.
- The focused terminal shows the `@session` label and **nothing else** identifying: no
  status light, no gauge, no repeated role, model, connection state or Team name.
- Every current session action is reachable in Team mode, from the rail or its overflow.
- Sessions mode carries the full familiar controls, with the picker scoped to Team members.
- **Chat opens, is empty, and does nothing** — verified as no network request, no timer, no
  socket, no composer, in a build with and without each optional service.
- The Wipeboard service shows the thread and composer and **no Brief**.
- Team Configuration writes roster metadata and refuses to send `members` or `team_lead`;
  membership changes write to the session and are reflected in both modes.
- A Team with more than four members, and membership changing while both modes are open.
- The Team Commons tile occupies a slot with Roster, Wipeboard, Docs, Team Configuration and
  **Add Member**, and carries no session header.
- Repeated navigation between Team, Sessions and away: one terminal host per slot, with no
  duplicate sockets, listeners, observers, timers, polls, keyboard bindings or composers.
- One aggregated reading per Team per poll — verified in the browser's network view as one request,
  not `3N` — paused while the tab is hidden, and degrading cleanly on a build with no michi.

## Definition of done

- The terminal host is one module with `mount / switchSession / park / destroy / fit / send`,
  consumed by the focused terminal and Sessions mode — **not Eye 5, which mounts no terminal
  at all** — and no second transport exists anywhere in the client.
- Both Team modes work against live Team data, with the geometry, collapse, resize and
  persistence above.
- Chat is present, empty, inert, and carries a recorded seam for the voice/Koshi–Kaki flow
  with no placeholder implementation to unpick.
- The status light, the context gauge and their gauge-only support code are gone from the
  client and have not returned in another form.
- Every review journey above passes in the browser on desktop, tablet and phone.
- `bin/ronin-byoin --gates` passes before landing on `dev`, and **`bin/ronin-byoin --ui`
  passes as the rendered proof**, each run once at the end with its verdict reported and any
  SKIP named as unverified — `smoke-ui` and `visual-ui` in particular, since a skipped
  `visual-ui` means this Eye's geometry has not been measured.
- The open questions are ruled or explicitly deferred by the owner — not resolved by
  whichever slice reached them first.
- The existing coworkspace stayed usable at every landed slice.
- **This document is deleted when the work lands.** A build-out is what might be; when it
  is, the facts go to `docs/` and one line goes to the manifest **if this repository adopts
  one** — the library's documents page names that drawer as the default, and there is no
  manifest directory here today, so this is a question to answer at landing rather than a
  path to write into.
