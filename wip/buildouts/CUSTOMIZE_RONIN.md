# CUSTOMIZE RONIN — Eye 3 build-out

## Goal

> Own Eye 3: Customize Ronin. Audit the Customize surface and produce the v1 resource
> capability matrix: direct editor, guided agent handoff, or read-only for macros, SOPs,
> actions/tools, team roles, role families, session roles, skins, readings, and saved
> launches. Plan ExplorerLayout, provenance, APIs, failures, and file ownership.

Ruled by the owner on 2026-08-23, and the rule this whole document answers to:

> **`team_roles` is in v1. Treat the capability matrix as the authority: direct editing
> only where typed safe APIs exist; otherwise guided agent handoff or read-only, with no
> raw generic disk editor. Record the TOOLS parser and retired `role_family` saved-launch
> gaps as prerequisites.**

Customize is where a person **discovers and authors the recipes that change how Ronin
works**. The glossary already draws the line this destination is built on: *you set a
setting, you write a recipe.* Settings are the Admin Desk's. Recipes are Customize's.

## CURRENT STATE / RESUME HERE

*As at 2026-08-23 17:36Z. Facts measured this turn, not remembered. Replace this whole
section on each material change; do not append to it.*

**Repo:** `dev`, HEAD `989daa5`. **Nothing of mine is committed or staged.**

### Completed behaviour

A registered Customize destination on the frozen Kit (`18d9b35`), reachable at `#/customize`:

- ExplorerRail with **3 sections / 10 resources**; per-resource counts and a `◆`/`◈`
  provenance mark resolved **from the read**, absent when a read cannot answer.
- Content Surface renders one resource at a time; standard states wired
  (`loading` / `failed` / `unavailable` / `inert`).
- **Read-only views over the 5 truthful reads:** macros, role families, session roles,
  team roles, skins.
- **4 resources render `unavailable` and name the missing prerequisite** — SOPs, actions,
  tools, session readings. They do not render an empty list.
- **Saved launches renders `inert`** with the P2 reason. Deferred by owner.
- Guided handoff: seed-and-path for shadowable catalogs, README-as-worked-example for
  definition directories, and a read-only sentence where there is no write path.
- Re-entrancy guard: programmatic rail repaint suppresses `onSelect`.

### Files I own (all UNTRACKED)

```
public/js/customize.js            9126ab81  3983 B  15:49:31Z
public/js/customize-rail.js       547e630a  5426 B  15:34:52Z
public/js/customize-resources.js  a257b4cb  3694 B  15:39:20Z
public/js/customize-handoff.js    298af2d5  3645 B  15:39:20Z
wip/buildouts/CUSTOMIZE_RONIN.md  this document
```

### Shared seams touched — exactly two lines, both UNCOMMITTED

- `public/js/main.js:21` — `import { installCustomize } from './customize.js';`
- `public/js/main.js:111` — `guard('register the Customize destination', () => installCustomize(workspace));`

That file's working diff is 42 insertions and holds **all five Eyes' registrations**; only
those two lines are mine. Root relabelled my guard string during integration — keep theirs.

No shared catalog or route file touched. No CSS file added or edited. No frozen-Kit edit.

### Verification actually run, and against what target

| Gate | Result | Target it actually tested |
|---|---|---|
| `bin/ronin-byoin --gates` | **exit 0**, 0 failures naming customize | **This working tree.** Valid evidence. |
| `check-docs` | exit 0 | This working tree. Valid. |
| `node --check` on all 4 modules | pass | This working tree. Valid. |
| `bin/ronin-byoin --ui` / `smoke-ui` | reported green earlier | **INVALID — disregard.** `scripts/lib/ui-host.mjs:21` `defaultUrl()` points at `http://<tailscale-ip>:3006`, served from `/home/glen3/dohyo/ronin-cowork-live` — a **separate checkout with 59 modules to this tree's 77**, whose `main.js` greps **0** for customize. The gate has never loaded this slice. |

### Known failures and limitations

1. **No browser has ever executed this code.** The re-entrancy fix is sound by inspection
   and **unverified at runtime**. An earlier claim that `smoke-ui` failed *because of* this
   slice was **false attribution** — that gate cannot see this tree.
2. Four resources are `unavailable` until their read routes exist (P3); tools additionally
   needs the TOOLS table parser (P1).
3. No direct editors. Role-family membership and saved launches both deferred by owner.
4. Malformed definitions cannot be surfaced — `src/definitions.ts:111` logs and drops (P8).

### Current blocker

Two, both owner-held: the **shared-file hold** (P1/P3/P8 all land in `src/catalog.ts`,
`src/routes/`, `src/definitions.ts`), and **no UI gate points at this tree**, so runtime
verification is impossible from here. P7 is owner-assigned to me and is *not* blocked.

### Release posture

`dev`, 0 commits ahead of `origin/dev`. **Nothing committed, pushed, staged, or merged by
this session; no PR opened by it.** `master` is at `8e82df6`, untouched by me. Under the
standing owner rule above, no release action is authorized here and none is pending.

### Single next action

**Nothing — hold.** Files stay byte-stable at the checksums above while root integrates.
On a named gate failure against one of my four files, fix in place and change nothing else.

## Vocabulary — the foundation taxonomy

Owner's ruling, 2026-08-23. It supersedes the words `WORKSPACE_KIT.md`, `FIVE_EYES.md`
and the landed kit primitives still use, so it sits here rather than in the register: a
reader meets it before any finding below.

| Word | Means |
|---|---|
| **pane** | **Only** the tmux object inside the tmux server. Nothing in the browser is a pane. |
| **Tile** | What Ronin renders session output into. |
| **Surface** | A larger coworkspace region, which may host a terminal Tile, a Kanban, or Channel services. |
| **Channel services** | Chat, Wipeboard, Docs, Team Configuration. Their contents are **never** panes or panels. |

**Customize is a destination.** That word is the kit's own — `WORKSPACE_KIT.md` names the
production destinations as league, team, customize, new-team and agent-config — so it needs
no inference and is used throughout below for the first-class view.

**"Customize is a Surface" is a further Eye 3 reading, not part of the ruling.** The owner ruled
four terms and classified none of the five destinations; that distinction is
@eye_league's, who caught himself asserting it inside a relay. Recording mine as inference
so three relays of one ruling stay identical.

On that reading: its ExplorerRail and content host are parts of it, not panes. It hosts
**no Tile, no Kanban and no Channel service** — a Surface of cards and editors, which is
why the ruling costs this build-out a glossary and not a redesign.

**Two of the five destinations host none of the three named hosts** — League and Customize.
The ruling is permissive (*"may host"*) and defines a Surface as a **region**, not as a
container for those three, so both are ordinary Surfaces as written. But if the taxonomy is
ever tightened to *"the region around a Tile"*, it is these two that break, and it is not a
one-destination edge case. @eye_league raised it for League; noting the second instance
here rather than leaving it to look singular.

**Customize is one Surface; its resource views are views, not Surfaces.** The rail and the
content host are parts of it. A "Session Readings view" is a view on this Surface — calling
it a surface would multiply the ruled noun into every sub-region and empty it.

**Three passes normalize a document to this ruling, not one** (@eye_team and @eye_league):
grep the **retired** words (`pane`, `panel`); grep the words that carry the **old model**
without being banned (`tab`); and re-read the words the ruling **promoted**, because a
taxonomy that defines Tile and Surface turns every previously casual use of them into a
claim. **The third has no grep that finds it** — you have to know the ruling added terms
and not only removed one. This document's `tab` hit is the **Docs tab**, which
`KOTOBA_GLOSSARY` explicitly blesses (*"Say the Roster tab, the Docs tab. Never pane or
panel"*), so it stays.

`createPane`, `createChannelPane`, `wk-pane*` and the kit's `Pane` / `SessionPane` /
`ChannelPane` all predate the ruling. They appear below **only in code font, as the current
names of landed symbols**, never as house words. If the foundation owner renames them at
the freeze, this document changes call sites and nothing else.

## What Customize is not

Admin Desk keeps install-level configuration, services, project roots, hotwords,
appearance, updates and account. Customize does not clone a single one of them, and it
does not open a raw file editor onto the owner's disk.

Two boundaries are easy to get wrong and are settled here:

- **`team_role` is mine; `team_roster` is not.** The *definition* — the catalog file that
  says what a team role means and what reading its sessions get at birth — is a recipe and
  belongs in Customize. The *durable record of one team* (`src/team-rosters.ts`,
  `/api/team-rosters`, objective, defaults, wipeboard link) is Eye 4's and Team Config's.
  One is the template, the other is the instance.
- **Choosing a skin is a setting, not a recipe.** The chooser stays where it is, in the
  gear's appearance sheet. Customize shows the skin *catalog* — what each skin is, its
  tokens, whose it is — and hands authoring to an agent. I do not move the picker.

`PUT /api/file` — the generic absolute-path read/write pair behind the ▧ Docs tab —
is **out of bounds for this destination entirely**. It takes any absolute path and writes
it. Reaching for it would be exactly the raw generic disk editor the owner ruled out, and
no editor planned here calls it.

## The audit — what actually exists today

Ten resource shapes sit under the nine names in the brief, because *actions* and *tools*
are stored differently and have to be planned apart.

| Resource | Storage shape | Shadow rule | Read over HTTP | Write over HTTP |
|---|---|---|---|---|
| Macros | `MACROS.md`, `## name` blocks | entry-merge | `GET /api/macros` — typed, rich | seed only |
| SOPs | `ronin_sops/` ⊕ `sops` store, one `.md` each | whole file, by filename | **none** | none |
| Actions | `ACTIONS.md`, `## name` blocks | entry-merge | **none** | seed only |
| Tools | `TOOLS.md`, a **markdown table** | keyed on column 1 | **none — parser missing** | seed only |
| Team roles | `team_roles/`, one file per token | whole definition, by filename | `GET /api/team-roles` | none |
| Role families | `role_families/`, one file per token | whole definition, by filename | `GET /api/role-families` | **`PUT /api/role-families/:name/session_roles`** |
| Session roles | `session_roles/`, one file per token | whole definition, by filename | `GET /api/session-roles` | none |
| Skins | `SKINS.md`, `## name` blocks | entry-merge | `GET /api/skins` — typed tokens | seed only |
| Session readings | `session_boot` shelf, five levels of directories | by filename within a level | **none** | none |
| Saved launches | SAVED_LAUNCHES (user scope only — it ships nothing), `## name` blocks | user scope only | `GET /api/saved-launches` | **`POST` / `DELETE /api/saved-launches`** |

Stock today: 13 macros, 13 SOPs, 35 actions, 17 tools, 0 team roles (**by design and
permanently** — see the matrix), 3 role families, 11 session roles, 7 skins, and 4 universal readings on
the boot shelf — two of them symlinks out of it.

**Exactly two typed, validating write APIs exist**, and the owner's rule turns that count
directly into the matrix:

- `PUT /api/role-families/:name/session_roles` — validates the roles named, caps the
  count, refuses an edit that would orphan the family's pinned `default_lead_role`, and
  returns a 400 written for the owner.
- `POST /api/saved-launches` + `DELETE /api/saved-launches/:name` — a closed field list,
  handle validation, one block re-emitted with every other byte of the file passed
  through, and the result **parsed back before it is committed**. This is the pattern
  every future direct editor copies.

`POST /api/catalogs/seed` is not an editor. It makes the owner's copy of a shadowable
catalog exist and hands back the path. That is the handoff primitive, and it covers five
files: `MACROS.md`, `ACTIONS.md`, `TOOLS.md`, `SKINS.md`, and SAVED_LAUNCHES (user scope
only — it ships nothing, so no such file exists in the tree). It covers
**no definition directory and no shelf** — there is no seed path for `session_roles/`,
`role_families/`, `team_roles/`, the SOP store or the reading shelf.

Where there is no seed path and no stock entry to copy, **the directory's own README is
the worked example.** Each of the three definition directories ships one, and each states
its format and its field list — `team_roles/README.md` names `icon · label · blurb · order
· hidden` and explains the shelf behind it. A handoff for those resources shows the path,
renders the README's format, and hands over the briefed instruction; it cannot create the
file. Whether `seed` should be extended to cover a definition directory is **P6** below —
an option, not my decision.

**Two of those three READMEs currently teach the retired model, so this design cannot ship
until they are corrected — P7.** The moment the README becomes the worked example, a stale
README becomes a teaching surface for a dismantled axis.

## The v1 capability matrix

**This table is the authority.** Where it and any other document disagree — this build-out
included — the table is right and the other is the thing to fix.

| Resource | v1 capability | Why |
|---|---|---|
| **Macros** | Guided agent handoff | A macro's body is prose addressed to an agent — an instruction that opens with a prohibition, the actions it names, its params. That is not a form, and no typed writer exists. |
| **SOPs** | Read-only | Whole documents of house prose. No API of any kind today; a read route is a prerequisite. Authoring goes to an agent. |
| **Actions** | Guided agent handoff | Entry-merge catalog, seedable, but no reader and no typed writer. An action is a procedure in prose. |
| **Tools** | Read-only | Blocked twice over: no table parser on the TypeScript side (**P1**), and a tool is an executable in `ronin_bin/` — a markdown row cannot author one. |
| **Team roles** | Guided agent handoff | In v1 by the owner's ruling. **The house ships none, permanently and by design** — every team_role that will ever exist is the owner's own, so read-only would render a section with nothing in it, forever. Authoring is the entire content of this shelf. |
| **Role families** | **Direct editor — membership only** | The one typed, validating write that already exists. Everything else about a family — creating one, deleting one, its label, its pinned `default_lead_role` — is guided handoff. |
| **Session roles** | Guided agent handoff | The richest definition we have: its fields cascade into every launch through `src/launch-profile.ts`, with locked, additive and inapplicable classes. A form over that needs a typed schema that does not exist yet. |
| **Skins** | Read-only | A rich typed read already exists and the catalog is worth browsing. Authoring is token editing — handoff. Choosing stays a setting, elsewhere. |
| **Session readings** | Read-only | Five additive levels of directories, no API, and files that may be symlinks out of the shelf. Adding a reading is putting a file somewhere — the archetypal handoff. One of the five levels is empty on most boxes today, correctly; see Failures. |
| **Saved launches** | **Direct editor** | A saved launch *is* a form filled in ahead of time. Typed fields, validation, round-trip check, create and delete all already land. Gated on **P2**. |

Two direct editors. Four guided handoff. Four read-only — one of which, Tools, is
prerequisite-blocked even for reading.

**Team roles moved from read-only to handoff on 2026-08-23**, on a finding from
@eye_league that I verified and found stronger than reported. `ronin_catalogs/team_roles/`
ships only its README, and that README states the reason as doctrine: *"The house ships
none: a team_role is the owner's own vocabulary for their teams, and a stock guess would
be furniture."* Zero is not a gap waiting to be filled — it is the permanent stock state.
A read-only view over a shelf that is empty by design is a dead section, so the
capability that makes it do anything is the one that helps the owner write their first.

### The three capabilities, defined

Nothing below is a spectrum. Each resource is exactly one of these in v1.

**Direct editor.** A typed form on the Surface writes through an API that owns the file
format, validates before it commits, parses the result back before it writes, and refuses
with a message naming the file. The owner's file stays hand-editable and every byte the
form did not author passes through untouched.

**Guided agent handoff.** The Surface makes the owner's file exist if it does not, shows
where it is and what shape an entry takes, renders the stock entry beside it as the worked
example, and hands the person a briefed instruction to give their own agent. No form, no
free-text box writing to disk. This is the front door that already gets used, and
`addYourOwn` is half of it built.

**Read-only.** The Surface renders the resolved list and the resolved content with
provenance. No write path from Customize at all in v1. Read-only is a decision about this
release, not a claim that the resource is immutable — the owner's agent can still change
any of it, and the Surface says so.

## ExplorerLayout

`ExplorerLayout` pairs Workspace Kit's `ExplorerRail` with one content host. The rail owns
selection; the host owns the selected resource. I compose these; I do not build them.

The rail carries three sections, matching the reviewed fixture:

```
Behavior            ⚡ Macros
                    ▤ SOPs
                    ◇ Actions & tools

People & work       人 Role families
                    ◫ Session roles
                    ⧉ Team roles          ← added by the owner's v1 ruling
                    ↗ Saved launches

Presentation        ◐ Skins
                    ▧ Session readings
```

`⧉ Team roles` is new against the fixture and sits with the other definition directories,
because that is what it is.

**The landed rail does not do this yet, and I am its only consumer.** Verified against
`public/js/workspace-primitives.js` in the working tree (uncommitted, 2026-08-23):
`createExplorerRail` is a **flat listbox** of `{id, label}` items. It delivers selection
and keyboard traversal — arrows, Home/End, roving tabindex, `role=listbox`/`option` — and
nothing else. `WORKSPACE_KIT.md` promises the rail owns *"hierarchical sections, selection,
optional counts/provenance, collapse, keyboard traversal, loading/empty states, and a
narrow-screen drawer treatment."* Five of those eight are absent:

| Rail contract | Landed | Needed by |
|---|---|---|
| hierarchical sections | **absent** — flat list | the three-section IA above |
| counts | absent | resolved counts per section |
| provenance | absent | the roll-up mark |
| collapse | absent | long sections on a short screen |
| loading / empty states | absent — not built on the Surface primitive (`createPane`), no `.wk-state` node | every resource fetch |
| narrow-screen drawer | absent | phone |
| selection | present | — |
| keyboard traversal | present | — |

**No form, field, notice or validation-state primitive exists either**, though
`WORKSPACE_KIT.md` promises all four. My saved-launch direct editor is a form — closed
field list, per-field validation, the server's refusal on the form's own notice line — so
Customize is a **third named consumer** beside @eye_agent_config's seat editor and
@eye_new_team's stage 1, well past the kit's own two-consumer bar. I build no local
substitute and fork nothing.

This is an unfinished gate rather than a defect — the kit's own sequence puts primitives at
step 3 and the files are not committed. But the fixture rail and the kit contract agree
with each other, and the landed primitive is the outlier, so the gap is named now rather
than discovered at leg 3. **I do not build a substitute rail locally**, and I do not fork
the primitive: sections, counts, provenance slot, collapse and the drawer go into
`createExplorerRail` by the foundation owner, and I consume them.

If the foundation owner would rather freeze the rail as it stands, the fallback is stated
here so it is a decision and not a drift: the three section headings become non-selectable
items in the flat list and Customize loses collapse and the drawer on phone. That is a
worse surface and I am not proposing it — but it is survivable, and it is the owner's
call, not mine to make silently.

`createCard` carries `selected` and the dotted variant but not the `active`, `warning` and
`stale` states the kit contract also promises.

**Stale does not block me and I am not asking for it.** Staleness in Customize is a
property of a fetched list, not of one recipe, so the list wraps in a Surface (`createPane`, the landed symbol) — which
carries all six states — exactly as @eye_league resolved the same question for LeagueBoard.

**Warning does block me, and I file for it — but only because of P8, found after I first
declined it.** A malformed definition file is a per-item fact: *this one file, not the
other ten.* "Named, never swallowed" means rendering `developer.md — no `key: value` lines,
not read` beside the valid entries, and a list-level notice cannot say which file. That is
the same shape as @eye_agent_config's refused seat and @eye_league's failed membership
write. I am a fourth named consumer for per-item `warning`; I remain a non-consumer for
`stale`.

Counts are resolved, never hardcoded — the fixture's numbers are decoration and are not
carried across. Provenance rolls up: a section whose resolved list contains anything of
the owner's carries the mark.

The content host draws one resource at a time in a consistent order, whatever the
capability: **what this shelf is** → **the resolved list, with provenance** → **the
selected entry** → **the write path, or the sentence saying there is not one**. A
read-only resource is not a degraded direct editor and must not look like one: it ends
with a clear statement of how the owner changes it, not with a disabled form.

`RecipeCard` is a `Card` composition — heading, mark, blurb, provenance, metadata. Stock
and yours use the same card; only the mark separates them.

## Provenance

Provenance is the load-bearing feature of this destination, not a decoration on it. The
existing rules hold everywhere and are not restated in new words:

- **Stock gets nothing.** Silence is the right rendering for as-shipped.
- **`◆` yours** — you added this; there was no shipped entry of the name.
- **`◈` yours, changed** — it stands in a shipped entry's place, and an upgrade improving
  that entry will not reach you.

`public/js/provenance.js` is the one place those marks are made and stays that way — a
fifth and sixth surface rendering the same two fields is exactly the drift it exists to
stop.

What Customize adds is that the **shadow warning becomes visible before the edit, not
after it**. Every guided handoff on a *stock* entry states the trade in the owner's own
terms — *make this yours and upgrades to our copy stop reaching you* — because that is the
one consequence nothing else on screen would ever tell them. `rolefamilies.js` already
carries this fact in its header; Customize is where it reaches a person.

Four shadow shapes exist and the Surface must say which is in play, because they behave
differently on upgrade:

| Shape | Resources | What "yours" means |
|---|---|---|
| Entry-merge | macros, actions, skins | one `## name` block replaces one stock block; `hidden: yes` deletes one |
| Whole definition | role families, session roles, team roles | your `developer.md` replaces ours entirely |
| Whole file | SOPs, library pages | your file replaces ours entirely |
| Level directory | session readings | by filename within a level; levels are additive and never override |

Saved launches are user scope with no stock half at all, so an empty list is the ordinary
state of a fresh install and never an error.

**No timestamps.** No catalog API serves an mtime, so the fixture's "edited yesterday"
does not render. Either a served `mtime` is added to every list route or the card drops
the line — recorded as **P5**, the owner's ruling, and until then the card drops it. I do
not stat files from the client to invent it.

## APIs

### Read routes this destination needs added

Three rail sections cannot render at all without them. All are read-only, additive, and
mount in `src/routes/customize-api.ts` [planned] rather than growing the shared catalogs
route:

- `GET /api/sops` — the merged list with provenance; `GET /api/sops/:name` — resolved text.
- `GET /api/actions` — `readEntries('ACTIONS.md')`; the reader already exists, only the
  route is missing.
- `GET /api/tools` — blocked on **P1**.
- `GET /api/session-readings` — the shelf as levels, each level's files with provenance.
  Two stock entries are **symlinks out of the shelf** (`KOTOBA_GLOSSARY.md`,
  `SHELVES.md`), so this route resolves and reports the link rather than following it
  blindly, and it never serves a path outside the two shelf roots.

### Write routes

None are added in v1. The two that exist are consumed as they are. Every direct editor
inherits the `saveLaunch` contract without exception: closed field list, validate, re-emit
one block, pass every other byte through, parse the result back, refuse naming the file.

`errMsg`'s home-directory redaction applies to every new route — the browser gets the
fault, never the box's layout.

## Failures and standard states

Workspace Kit's state language is used as-is: loading, genuinely empty, stale but usable,
failed load, unavailable optional service, inert/permission. What is specific here:

- **A missing user file is the ordinary path**, never an error. A fresh install has no
  user catalogs at all and Customize renders the full stock lists.
- **A malformed definition is named, never swallowed — and this promise currently has no
  data path (P8).** `src/definitions.ts:111` logs the file to `console.error` and
  `continue`s, so the malformed file never enters the returned array and **cannot reach any
  client**. The server operator sees it; the owner, who is the only person who can fix
  their own file, never does. Customize is where that must become visible, so the
  read routes carry a `malformed: [{ file, why }]` alongside the list. Silently showing a
  shorter list is the failure mode to avoid, and today that is exactly what every consumer
  gets.
- **Typed work survives a failure.** A refused save keeps the form open with the text
  intact and puts the server's message on the form's own notice line. A failed *load*
  leaves Save disabled, so an empty box cannot overwrite content that merely failed to
  arrive.
- **Stale stays visible and labelled.** Catalogs are parsed at request time, so a stale
  list means a failed refetch, not a cache — the previous list stays on screen and says
  so.
- **Read-only is not a failure state** and must not use the failure treatment.
- **An absent optional service stays opaque and is not fetched.**

### The `team_role` reading level is empty for most teams, and the reason is not a defect

Prompted by @eye_team's tag-only measurement, and **corrected after @eye_agent_config read
a line I had not**. My first version of this said a gate swallowed the level silently. It
does not, and the difference matters.

What is actually true, read end to end:

1. `ronin_catalogs/team_roles/` ships **zero definitions**, permanently and by design.
2. A `team_role` reaches a launch only from a team's durable roster.
3. A launch that names `team:` with **no roster is refused outright** —
   `src/spawn.ts:284-288` throws (`:283` is the roster read; the refusal is the `if` and throw beneath it) *"Team X has no roster on this box. Create it first."*
   The comment above it states the intent: *"being born ONTO a team is a launch fact and
   deserves the durable half to exist."* Loud, not silent.
4. The `roster?.team_role ?? ''` fallback at `src/spawn.ts:432` is therefore reachable
   **only for a rōnin launch** — no team named — where reading no `team_role` level is
   exactly correct.
5. Today's launcher sends `tags:[name]` and never `team:` (@eye_new_team's item 12), so the
   ordinary UI never attempts a birth-onto-team launch at all. A tagged session was not
   *born onto* the team, and `team_role` reading is birth-only by the owner's 2026-08-23
   ruling — so omitting the level is right, not a miss.

Measured here: **one roster (`five-eyes`) against four live teams** — `buildout`,
`viewers` and `walk` are tag-only, and the owner's own `team_role` level in the session_boot
store
is empty.

So there is no silent failure anywhere in this path, and nothing here is mine to fix. The
real gap is that the ordinary UI cannot produce a birth-onto-team launch, which is
@eye_new_team's item 12 and already filed against a surface that is not mine.

What it settles for me is only a **rendering decision**: the Session Readings view shows the
`team_role` level as **empty with its reason** — no definitions written yet, and few teams
carrying a roster — never as absent and never as an error.

### No reading level is watched, and the view must not imply otherwise

Following the same thread one step further. **The authority is
`src/session-boot.ts:224-225` (the two `dirs.push` lines, inside `bootFiles`) and `:248` (`roleFiles`, its reasoning at `:236-247`) — do not cite
`src/role-watch.ts`'s header for this**; see register item 13 for why:

- **`role/<session_role>/` is re-resolved on a committed `session_role` change** and
  injected into the running session. Resolved fresh at the moment of the change, so a file
  the owner added since birth *is* picked up — but only by a session that switches role.
- **The `all`, `root`, `<service>_connected` and `team_role` levels are birth-only.**
  `session-boot.ts` states it in current vocabulary: *"Team_role reading in particular is
  birth-only by ruling."*
- **Nothing watches any directory.** Adding a file to any level reaches **no already-running
  session**, ever — except `role/`, and only via a role change.

So the Session Readings view must never suggest that writing a reading updates sessions
in flight. It reaches **the next session born**, and for `role/` also the next role switch.
That is one sentence of copy, and getting it wrong would teach the owner to expect
something the shelf has never done.

**And editing a `team_role` definition today is inert twice over.** Verified: the reading
shelf is birth-only, *and* `GET /api/team-roles` has **no client caller at all** — the route
is live and `public/js/` never fetches it. So changing a definition's `icon`, `label` or
`blurb` reaches no surface, and its shelf reaches no session. Two different silences, one
nothing. The Team Roles handoff must say so: authoring a `team_role` today buys a file and
nothing else, until a surface consumes the route — @eye_new_team's stage 1 picker and this
view are the first two — and a session is born onto a team wearing it. Handing the owner a
"write your first team_role" button without that sentence would be dishonest.

@eye_new_team's D5b is the same doctrine seen from adoption: giving a tag-only team a
roster makes its existing members full members immediately, but **none of them has read the
`team_role` brief and none ever will** — only seats launched afterwards do. Correct under
the birth-only ruling, and it sharpens the Team Roles handoff copy from *"buys nothing until
a session is born onto it"* to the more exact **a `team_role` you write today reaches only
sessions born onto that team after you write it — never its current members, and never
members adopted into a roster.**

## File ownership

Mine exclusively. **None of these paths exists in the tree today**, and the block is
fenced, so `check-docs` exempts it. **The `[planned]` markers inside this fence are
decoration** — measured, not assumed: stripping all 12 markers from this document produces
exactly **4** failures, all of them in prose. **8 of 12 are inert**, and every inert one is
in or above this block. Writing *"every path below is [planned]"* as though it were a
safeguard was decoration on the one part of the document no gate reads (@eye_league found
the same on his own fence, 1 of 3). That exemption is why it is spelled out
here instead: a fenced listing that reads like a directory tree is the same
"un-checkable is not the same as right" defect as the manifest instruction above.

```
customize.js            the destination: mount, route registration      [planned]
customize-rail.js       ExplorerRail composition and section model      [planned]
customize-resources.js  per-resource read views                         [planned]
customize-handoff.js    the seed-and-brief flow                         [planned]
src/routes/customize-api.ts       the new read routes                   [planned]
docs/customize.md                 standing doc, at land                 [planned]
wip/buildouts/CUSTOMIZE_RONIN.md  this document, deleted at land        (exists)
```

The four client modules are **flat and prefixed, in `public/js/`** — not a `customize`
subdirectory, which is what this block said until I checked. **`public/js` is flat: 64
modules, zero subdirectories**, and the Kit's own new modules follow it (`workspace-kit.js`,
`workspace-layouts.js`, `workspace-primitives.js`). My original planned a nested tree the
repo does not use, and **the fence hid it** — verified both ways: stripping every
`[planned]` marker fails exactly the four *prose* sites and **not one line of this block**,
so the gate never read the structure at all. @eye_agent_config found the flat convention;
@eye_league found that a fence reads as precision while removing the check.

**Two open structural questions, and they are not the same kind** (@eye_league's
correction to my own tally, which I had framed as a four-way split):

1. **Client module layout is not open — the tree has answered it.** `public/js` is flat:
   **64 modules, zero subdirectories**, verified independently by four Eyes. Two of us
   planned nested trees and were simply wrong; that is not a split, it is four people who
   did not look, two of whom happened to match. The narrow question for the Kit owner is
   whether the Kit **ratifies the existing convention or changes it** — not "flat or
   nested".
2. **Feature CSS is genuinely open**, because no directory exists to carry a convention.

**Feature CSS has no home, and that is not mine to invent.** I had claimed a `css`
directory under `public/` as "one namespaced feature root". Verified: **no such directory
exists, and there is no per-feature stylesheet convention** — this repo keeps its whole look in
**one file, `public/style.css`**, whose only `@import` is vendor xterm. So a namespaced
feature root is a **new convention**, not a folder I create quietly. @eye_league and
@eye_team have both planned a League stylesheet into that same non-existent directory,
which makes three destinations independently assuming a structure the repo does not have.

*(Both sentences above originally named those paths as path tokens — the exact shape
@eye_agent_config and @eye_team diagnosed: a path used to assert that the path is absent.
`check-docs` failed them, correctly, inside the paragraph diagnosing that class.)*
**Whether feature CSS gets its own files is a Workspace Kit decision** — it is shared
shell/layout territory by the ownership map — and until it is ruled, Customize's styles go
wherever the foundation owner says. Recorded rather than decided.

Consumed, never edited: the rail, the Surface, the card, standard states, shared tokens,
`AppShell`/`ViewHost`, the route registry — all Workspace Kit's, all through Eye 1's route
adapter. **Reached through `WorkspaceKit` alone** (`public/js/workspace-kit.js`, the frozen
`{ primitives, layouts, adapters }` hand-off), never by importing the three modules
directly — same discipline @eye_league adopted, and it is what makes the export reshape
below survivable.

Reused, not forked: `public/js/provenance.js` (the marks and the seed flow),
`src/catalog.ts`, `src/definitions.ts`, `src/macros.ts`, `src/skins.ts`.

**Shared files I must touch, and cannot claim.** `src/catalog.ts` and
`src/routes/catalogs.ts` are read by the launcher and the ＋ New board as well as by me.
Both prerequisites land in them. I do not edit either without @view_mgr's ack on the seam,
and neither change is mine to sequence alone.

Moved by me, from the ＋ New board into Customize: the role-family membership editor —
the `✎` multi-toggle and the drag target in `public/js/rolefamilies.js`. Its header says
authoring a family is the next build-out, and this is that build-out. It moves **without
regressing**: drag stays `copy` and never a move, the `✎` editor stays the only place
membership is removed, and both stay reachable on touch. Whether the ＋ New board keeps a
copy or hands the job over entirely is a question for @view_mgr and Eye 4, not mine to
settle.

## Prerequisites

Nothing below is optional and none of it is feature work.

**P1 — the `TOOLS.md` table parser.** `docs/shadowing.md` states the rule — *a table, same
rule, keyed on the tool name in column 1* — and `ronin_bin/tejun` implements it in Python.
`src/catalog.ts` does not: it parses `## name` blocks only, so `readEntries('TOOLS.md')`
returns nothing and `scripts/check-catalogs.ts` surfaces an empty list. Three
implementations of one statement, and one of them does not implement it. Until this lands,
**Tools cannot be listed at all** and the rail's Actions & tools section shows actions
only. Touches `src/catalog.ts` — shared, needs the seam ack.

**P2 — the retired `role_family` on the saved-launch path. `saveLaunch` is the one
remaining WRITER of the dismantled axis, and it treats it as SUFFICIENT.**
`src/catalog.ts:326` reads `if (!fields.role_family && !fields.session_role) throw` — so a
saved launch naming **only** the retired axis passes validation today, is written to the
file (`LAUNCH_FIELDS`, `:313`), and is read back by the same test (`:305`). It is then
unusable, because `GET /api/launch-profile` refuses that axis by name.

**The scope warning, and it is @eye_league's:** four sites in code refuse `role_family`
correctly — `launch.ts:45/63`, `catalogs.ts:322-326`, `sessions-api.ts:215` (a 410 loop)
**and `:251` (a separate 400 — two doors, one file)**, and `write_tegami:446-449` at the
letter boundary.

**But "four refusals, one writer" is wrong, and I adopted it — the writer is not one
function, it is the whole saved-launch path.** Unfiltered grep, verified here after
@eye_league caught his own correction: `src/catalog.ts:277` **types** it on
`SavedLaunchInfo`, `:294` **reads** it, `:305` **filters** on it, `:313` lists it in
`LAUNCH_FIELDS`, `:326` **accepts it as sufficient**, and `src/routes/catalogs.ts:355`
**iterates it as a writable `LaunchField`**. Six sites, two files, end to end — type, read,
filter, field list, validator, route. A brief saying *"edit the documents, change one
function"* leaves five of the six standing. That collection
invites the conclusion *"the code is already right; sweep the documents."* **It is not
right.** Four refusals standing, **one writer left**. If the sweep lands as
documentation-only, whoever runs it edits six documents, never opens `saveLaunch`, the one
function that still requires the retired axis survives the sweep that existed to remove
it — **and this prerequisite stays blocked, which blocks the Saved Launches direct
editor.** Edit six documents, change one function.

 R35 retired the axis, and
`GET /api/launch-profile` now refuses it by name with a 400. But `POST /api/saved-launches`
still accepts and writes `role_family:`, `SavedLaunchInfo` still carries it, and
`listSavedLaunches` still filters entries on `role_family || session_role` — so a saved
launch naming only the retired axis is storable and unusable. The Saved Launches direct
editor cannot ship a form field for a retired axis, and it must not silently drop data the
owner wrote. Needs a ruling on existing entries (migrate to `session_role`, or surface as
unusable and let the owner fix) and then a sweep. **The Saved Launches editor is gated on
this** and is the last leg for that reason.

**P3 — the four read routes** in `src/routes/customize-api.ts` [planned]. Three rail
sections are
blank without them.

**P4 — Gate A, and specifically the ExplorerRail gap.** The Surface primitive (`createPane`), `Card` and the six
standard states have landed and are enough for me. `createExplorerRail` is not: it needs
hierarchical sections, counts, a provenance slot, collapse, loading/empty states and the
narrow-screen drawer before leg 3 can render the IA above. All six are in the kit's own
written contract already; none is a new ask. Gate A is also still moving — the primitives
are uncommitted — so "frozen" is not yet true of any of it. I build no substitute
foundation locally and I do not fork the primitive.

**P5 — the timestamp ruling.** Served `mtime` on every catalog list route, or the card
drops the line. Until ruled, it drops.

**P6 — seed for definition directories (an option, not a decision).** `POST
/api/catalogs/seed` covers five markdown files and no definition directory, so the Team
Roles handoff — the one shelf whose content is *entirely* the owner's — cannot make the
first file exist. Extending seed to `team_roles/`, `session_roles/` and `role_families/`
would be the same typed, safe primitive it already is: create the directory, write one
header file explaining the format, hand back the path. It is not required for v1; without
it the handoff shows the path and the README's format and the owner's agent writes the
file. Recorded so the owner can rule rather than have me quietly widen a route.

**P7 — the two stale definition READMEs.** Raised by @eye_new_team, verified, and one
line of it is worse than reported. `ronin_catalogs/role_families/README.md` and
`session_roles/README.md` both predate R35 and state the dismantled axis as current fact.
Four defects, in rising order of cost:

- `role_families/README.md` opens *"a `role_family` is the durable hat a session wears …
  optional and FIXED: chosen at birth, carried in the session's letter, and refused by
  every ordinary write afterwards."* KOTOBA_GLOSSARY says the opposite: presentation only,
  never rides a launch, not a fact about any session.
- Both print the dead four-layer cascade, `system default < role_family < session_role <
  explicit choice on this launch`. `src/launch-profile.ts` has one definition layer.
- `role_families/README.md:51` names the boot-shelf level **`role/<role_family>/`**. The
  landed level is **`role/<session_role>/`** (`src/session-boot.ts:40`). This is not stale
  prose — it points the owner at a directory keyed on the wrong token, and a shelf they
  build by following it reaches nothing.
- `role_families/README.md:54` says *"the role cannot change, so it is never
  re-injected."* `src/role-watch.ts` injects the new `role/` list into a running session
  on a committed `session_role` change — the README states the inverse of the behaviour.

`team_roles/README.md` is clean and current; it was written at R35. The asymmetry is the
tell — the other two simply were not swept.

**This is a hard prerequisite for two of my views**, not a tidiness item: the guided
handoff renders these READMEs as the worked example, and the Session Readings view
describes the shelf levels one of them misnames. Both would teach the retired model in the
exact place the owner goes to learn the format. I have a specific dependency and am willing
to own the correction inside leg 2, but I do not claim these files — @eye_new_team raised
them first and they are catalog-wide, not Customize's.

**P8 — the malformed-definition data path.** As above: a `malformed[]` alongside each
definition list, so the owner's own broken file is named to the owner rather than to the
server log. Small, contained, and it touches `src/definitions.ts` — shared, needs the seam
ack. Without it my "named, never swallowed" state is undeliverable and I would be planning
a surface for data that cannot arrive.


## Discrepancy register

Reported to @view_mgr — **whose dial is 👁 read, so `tejun-send` returns DENIED.** I have
not flipped it; that is the owner's hand. These go to the `five-eyes` team wipeboard
instead, and the owner may relay or open the dial.

1. **`team_roles` was in neither contract.** Gate F's list and the fixture rail both omit
   it, though it is landed — three definition directories, a live read route, and a
   `team_role/<team_role>/` reading level. Ruled **in** by the owner, 2026-08-23.
   `FIVE_EYES.md` Gate F should be amended to match.
2. **The TOOLS parser gap** — P1 above. `docs/shadowing.md` states a rule the server does
   not implement.
3. **The retired `role_family` saved-launch gap** — P2 above. The fixture's Agent
   Configuration surface also still shows *Role family: Developer* as a resolved launch
   field, which the launch-profile route now refuses by name. Eye 5's surface, same
   retired axis.
4. **Four resources have no HTTP surface at all** — SOPs, actions, tools, session
   readings. P3.
5. **`ronin_library/` appears in neither the charter list nor the fixture.** It is the
   fifth shelf, it shadows by filename exactly as SOPs do, and a library page is reached
   from an action. Either it is a tenth Customize resource or its omission is deliberate —
   I have planned it **out** of v1 and need that confirmed.
6. **The fixture asks for facts nothing serves.** "edited yesterday" (P5), and its
   `＋ Write a macro` dotted card contradicts the settled handoff doctrine — the seed flow
   deliberately only makes the file and hands back the path, *because the front door that
   gets used is a person telling their own agent.* This matrix resolves that tension in the
   doctrine's favour: the dotted card opens a handoff, not an editor.
7. **`team_roles` ships zero definitions, permanently and by design** — raised by
   @eye_league, verified, and the README states it as doctrine rather than a gap. It moved
   Team Roles from read-only to guided handoff in the matrix above: a read-only view
   over a shelf that is empty by design is a dead section. Corroborates @eye_league's own
   decision not to fetch `/api/team-roles` in League and to render the `team_role` as its
   own text — the route is correct and simply has nothing behind it yet.
8. **`createExplorerRail` delivers two of the eight things the kit contract promises it
   owns** — selection and keyboard traversal; not sections, counts, provenance, collapse,
   states or the drawer. Customize is the rail's first and only named consumer and its
   three-section IA needs sections. Raised as P4, with the fallback stated so a freeze
   would be a decision rather than a drift.
9. **Two definition READMEs teach the retired `role_family` axis** — raised by
   @eye_new_team, verified, and `role_families/README.md:51` additionally misnames a live
   boot-shelf level (`role/<role_family>/` for the landed `role/<session_role>/`). It is a
   hard prerequisite for me specifically, because my handoff design renders those READMEs
   as the worked example. **P7.**
10. **The primitives' export surface broke under this session, mid-draft.**
   `workspace-primitives.js` went from six named exports to a single frozen
   `WorkspacePrimitives` namespace between two reads of my own, minutes apart, uncommitted.
   Every function is now module-private. Four Eyes are writing plans that name these
   primitives, so this is not additive churn — it is a breaking import change on a floor
   four consumers are standing on. `createExplorerRail` is unchanged by it, so my rail gap
   above survives the rewrite intact.
11. **CLOSED — the owner ruled the foundation taxonomy, 2026-08-23.** Raised by
   @eye_team; I confirmed it as a consumer and argued the glossary's exception was too
   narrow to cover architectural names, so an exception would be a new ruling rather than a
   clarification. **The ruling went the other way, and further:**

   > *pane* means **only** the tmux object inside the tmux server. Ronin renders session
   > output into a **Tile**. A **Surface** is a larger coworkspace region that may host a
   > terminal Tile, Kanban, or **Channel services**. Chat, Wipeboard, Docs and Team
   > Configuration are Channel services — their contents are never *panes* or *panels*.

   So the kit primitive is a **Surface**, `createPane` is a landed symbol whose name the
   ruling supersedes, and `createChannelPane` hosts Channel services. This build-out is
   normalized: prose says Surface, and `createPane` appears only where a code symbol is
   literally the subject. Customize is a Surface; its rail and content host are parts of
   it, not panes. No user-facing Customize string ever said "pane".
12. **The `team_role` reading level is empty for most teams — and it is not a defect.**
   Prompted by @eye_team's tag-only measurement. **I first filed this as a silent gate
   failure and was wrong**: `src/spawn.ts:284-288` refuses a rosterless `team:` launch loudly (`:283` is the read),
   and the empty-string fallback at `:432` is reachable only for a rōnin launch, where the
   omission is correct. The real gap is that today's launcher never sends `team:` at all —
   @eye_new_team's item 12, already filed elsewhere. It decides only how my Session
   Readings view renders that level.
13. **`src/role-watch.ts`'s header is written in pre-R35 vocabulary and says the opposite
   of what its own file does** — a face of the retired-axis sweep, and the worst kind. Line 7 routes a moved session to a retired `task/<role>` path; the landed level
   is `role/<session_role>/`. Lines 21-23 say *"Role reading is birth-only by ruling — a
   role cannot change while the session lives"*, when `session_role` is mutable and
   delivering that change is the file's entire purpose. Raised by @eye_agent_config,
   demonstrated by @eye_team, and **I made the same mistake**: I cited those lines in this
   doc and on the board as evidence for the asymmetry. A stale README misleads whoever
   reads it; a stale comment beside working code gets *quoted*, and the wrong model then
   propagates into documents written by people who did verify the behaviour and cited the
   nearest prose. Two of us did exactly that today.
14. **I withdrew my own sweep count, and the withdrawal is the entry.** I told @view_mgr
   "six faces, one axis" and later "eight", across two hours, **without ever re-deriving
   it** — the same failure I corrected in @eye_league's ratio at 13:09, committed by me,
   and only caught because @eye_team miscounted in the other direction. On checking,
   `FIVE_EYES.md` alone carries `role_family` at six lines (53, 131, 160, 196, 278, 295),
   of which roughly four state it as a live axis. I had been saying "twice". **The number
   is withdrawn rather than patched**; what is verified is three *distinct* sweeps, each
   owed its own honest count by whoever owns it:
   **(a) the retired `role_family` axis** — `FIVE_EYES.md` (6 occurrences),
   `WORKSPACE_KIT.md:327`, the two catalog READMEs, the fixture, `src/catalog.ts`
   (`SavedLaunchInfo.role_family`, `LAUNCH_FIELDS`, the `listSavedLaunches` filter),
   `src/routes/catalogs.ts:355`, and `role-watch.ts`'s header;
   **(b) `pane` versus the kit primitives — RULED 2026-08-23 and now a defined sweep, not
   an open question.** The taxonomy is Tile / Surface / Channel services (register item 11).
   Known targets: `createPane` and `createChannelPane` in
   `public/js/workspace-primitives.js`, the `wk-pane` / `wk-channel-pane` / `wk-pane-*`
   class names, `WORKSPACE_KIT.md`'s `Pane` / `SessionPane` / `ChannelPane` primitives and
   its `pane_kind` prose, and `FIVE_EYES.md`'s pane-shaped geometry language. Not
   enumerated exhaustively here — that is the sweep owner's to do, and an unverified count
   is what I got wrong repeatedly today;
   **(c) — WITHDRAWN ENTIRELY. There is no BYOIN-summary sweep.** I filed one; it does
   not exist, and this is the third overreach of the same kind in one session so it is
   recorded rather than deleted. Verified this turn: `git log -- docs/test-protocols.md`
   returns two commits and the most recent **is `3f2499c`**. I first wrote that the H1
   *"one command, one verdict, nothing else to run"* was therefore **written** by that
   commit. **It was not — it was KEPT by it**, and @eye_league caught the difference:
   the diff's first hunk starts at line 4, so the commit rewrote the code block, the
   run-mode paragraph and the developer paragraph and **left the title standing**. A
   deliberate retention, which is stronger evidence than authorship — and my version was
   the same failure again, a true fact (most-recent-commit-is-`3f2499c`) carrying a
   conclusion it did not support. And the two build-out lines I catalogued as faces say, read to the
   end of the sentence: *"run only `bin/ronin-byoin` … and report its single verdict.
   **Do not invent per-session shell test sequences**"* (`FIVE_EYES.md:386-388`) and
   *"Repository verification is only `bin/ronin-byoin` … **no hand-rolled test sequence**"*
   (`WORKSPACE_KIT.md:393-394`). The **only** contrasts with hand-rolled script sequences,
   not with running two modes of one command. Read whole, both state live doctrine
   correctly. My own grep output showed those sentences truncated at "Do not" and "no
   hand-rolled" and I did not follow either. @eye_agent_config supplied two of the five
   faces and withdrew them; @eye_new_team's git check is what killed it.

   **And `3f2499c` grew ONE mode, not three** — every Eye, including me, said three.
   Verified in the diff: `--gates` already existed as *"the repo half only — for a machine
   with no live install"*. The commit **added `--ui`**, redefined `--gates` as the fast
   tier, and rewrote the developer instruction. The instruction it replaced read:
   *"Run BYOIN before landing work on `dev` … **Landing work and testing it are the same
   single call.**"* So *"one command, one verdict"* was not a compression that drifted —
   **it was the correct developer instruction, in the contract page's own words, until
   12:26 today.** Every summary carrying it was accurate when written and still accurate
   when this session was born. The doctrine changed under all five Eyes ninety minutes in;
   nothing went stale around a summary. That is why it propagated so cleanly and why none
   of us smelled anything — there was nothing to smell. @eye_league's finding, and it is a
   better explanation than any of us offered.

   **What actually survives is a fact about us, not about any document:** four of five Eyes
   wrote a verification section from a summary that correctly pointed at the contract page,
   without opening it. The summaries did their job. We did not do ours. That is why the
   successor briefing above exists, and it is the whole of the finding.

15. **Two dead levels in the owner's reading shelf.** The `job` and `task` levels in the
   session_boot store are leftovers of the retired axis names; no reader reads them. Both
   are empty, so nothing is lost — but a Session Readings view listing levels off disk
   would draw two levels that do nothing. It shows live levels only and reports the
   orphans as unread rather than rendering them as shelves.

## What a successor is born believing, wrongly

Every row verified in source. This section exists because the `all` and `root` level readings are
**birth-only** and nothing watches a directory (`src/session-boot.ts:238`) — so a correction
landing after a session is born never reaches it. Whoever picks up Eye 3 will hold these as
fact on their first breath. The first leg of phase 2 points here.

| Born believing | Actually |
|---|---|
| Gate F's resource list is complete | It omits `team_roles`. The owner ruled it **IN** on 2026-08-23. |
| `role_family` is a live launch axis | Dismantled at R35. `GET /api/launch-profile` refuses it **by name**; a family is presentation only. |
| Verification is one command, one verdict | Three tiers since `3f2499c`. Customize renders, so it owes **both** `--gates` and `--ui`. Bare byoin over-runs rather than under-runs — the defect is cost, never coverage. |
| The reviewed fixture's Customize rail is current | It has 8 items, not 9 — no Team roles. It shows "edited yesterday", which **no API serves** (no mtime anywhere). It draws "＋ Write a macro" as an editor; it is a **handoff**. |
| `role_families/README.md` describes the reading shelf | It names the level `role/<role_family>/`. The landed level is **`role/<session_role>/`** (`src/session-boot.ts:224`). A shelf built by following it is read by nothing. |
| `role-watch.ts`'s header explains reading behaviour | **Do not cite it.** Pre-R35 vocabulary; it says the inverse of what its own file does. Cite `src/session-boot.ts:248` (`roleFiles`). |
| `createExplorerRail` owns sections, counts, provenance, collapse, states and a drawer | It is a **flat listbox**. It delivers 2 of those 8. Customize is its only named consumer. |
| Workspace Kit exposes bare named exports | Replaced by a frozen `WorkspaceKit` namespace. The bare exports are **gone**, not supplemented. |
| Editing a `team_role` definition changes something | Nothing. `GET /api/team-roles` has **no client caller**, and its shelf is birth-only. Two silences, one nothing. |
| The Workspace Kit's vocabulary is current | It is not. The owner ruled the taxonomy on 2026-08-23: *pane* is the tmux object **only**; session output renders into a **Tile**; a **Surface** is a region that may host a Tile, Kanban or **Channel services**; Chat/Wipeboard/Docs/Team Configuration are Channel services, never panes or panels. `WORKSPACE_KIT.md` and `FIVE_EYES.md` still use the superseded words throughout, and the landed `createPane` / `createChannelPane` carry them in code. |
| You may land your own work when it is ready | **No.** `master` is owner-controlled (2026-08-23, standing). Never push master, merge a PR into it, enable auto-merge, or repoint the owner-facing service, without a fresh explicit instruction from Glen naming that specific merge or release **in the current task**. Work and pushes stay on `dev`; opening a PR is not permission to merge it. `gosmond3` is a shared identity and **not attribution** — record the authorized command and your session name in the handoff *before* you run it. |
| A `check-docs` failure in your run is about your work | Not necessarily. **Five sessions share one gate** — it returned **four different answers in ninety seconds** while the Eyes worked. A FAIL naming another document is someone mid-edit, and one was a peer's deliberate failure probe that an Eye nearly spent real time chasing. Repo-wide green is **one instant**, stale before you finish describing it. Capture once, vouch for your own file, never for the repo. |
| `write_tegami` merges what you send | It **replaces the block**, and the block is exactly five keys — `ALLOWED = {objective, session_role, repos, ladder_state, ladder}` (`ronin_bin/write_tegami:417`). Omit one and it is dropped — three of five Eyes lost `repos` this way. **But omitting `ladder_state` is the documented default, not a loss**: *"Absent means on_track, so … the normal case costs nobody a keystroke"* (`:418`). **`docs`, `teams` and `at` are not block keys**: including any of them **refuses the whole write**. `docs` is carried through by design *"so that rewriting your ladder can never drop it"*; `teams` and `at` are derived, and `role_family` is refused by name too (`:449`). **The rule is: never send a key outside those five — and do not read that as "always send all five."** Three behaviours, not one: omitting `objective`, `session_role`, `repos` or `ladder` loses real content, *silently*; omitting `ladder_state` is the documented normal case; including `docs`, `teams`, `at` or `role_family` refuses the whole write, *loudly*, each with its own printed reason. Rebuild the block programmatically and read it back. **The block goes in on STDIN, so nothing in it is shell-expanded** — do not escape JSON that needs no escaping. That is the opposite of `tejun-wipeboard`, which takes its body as **arguments**, where your own shell expands backticks and `$(…)` before the tool sees them; single-quote those. Two channels, two rules — @eye_agent_config. |

The last row is not about this rollout. It is about the tool the owner told every Eye to
use, it caught three of five of us, and a successor writing their first ladder will hit it
the same way unless something tells them.

## Legs

1. **Freeze the matrix.** This document, owner-reviewed. That is Gate F, and no other leg
   starts until it closes.
2. **Prerequisite sweep.** P1, P3 and P8; P7 if @view_mgr assigns it to me; P2 and P5 to a
   ruling. Seam ack from @view_mgr on `src/catalog.ts`, `src/routes/catalogs.ts` and
   `src/definitions.ts` before any of it.
3. **Rail and shell.** `ExplorerLayout` composed — ten resources under three sections —
   resolved counts, rolled-up provenance, empty and loading states. Blocked on P4. Nothing selected yet renders anything.
4. **Read-only resources.** SOPs, tools, team roles, skins, session readings — the
   complete read path with provenance and the four shadow shapes stated correctly.
5. **Guided handoff.** Generalized from `addYourOwn`: seed, show the path, render the stock
   entry as the worked example, state the shadow trade before the fact, hand over the
   briefed instruction. Applied to macros, actions, session roles, and to create/delete on
   role families.
6. **Direct editor — role-family membership.** Moved from the ＋ New board without
   regressing drag, the `✎` multi-toggle, touch reachability, or the orphaned-pin refusal.
7. **Direct editor — saved launches.** Gated on P2.
8. **Failure, responsive and keyboard pass.** Every standard state exercised on every
   resource; desktop, tablet and phone; focus order and visible selection.
9. **Land.** `bin/ronin-byoin --gates` before landing on `dev`, and `bin/ronin-byoin --ui`
   as the rendered proof — Customize is an entire new view, so both repo tiers are owed.
   Write `docs/customize.md` [planned]. Delete this
   document. **Then answer the manifest question rather than assuming it.**
   `ronin_library/documents.md` — the page an action resolves to, pointed at from every
   session's birth reading — ends *"Landing work ends with three questions … did this
   produce a line for the manifest?"*, and names a manifest drawer as one of the three
   directories of a project repo. **This repo has no such directory.** So the instruction is
   upstream of this build-out and reaches every session, not just Eye 3 (@eye_agent_config
   found it there; @eye_team found it in his own definition of done first). Landing either
   creates the drawer or records that the line has nowhere to go. A decision, not a step,
   and the shared page is not mine to change.

## Constraints

- No second foundation. `ExplorerRail`, the Surface primitive, `Card` and the states are
  Workspace Kit's.
- No view module reaches into another view's DOM. Feature CSS is namespaced beneath the
  feature root; shared primitive changes go through the foundation owner.
- **No raw generic disk editor**, and `PUT /api/file` is not called from this destination.
- No direct editor without a typed, validating API that owns the file format.
- The owner's files stay hand-editable. Every write re-emits one block and passes the rest
  through.
- Customization is install-level, never repo-level. Nothing here reads a catalog out of
  whatever tree the browser happens to be pointed at — that is a security boundary.
- Never spell a store path by hand: `storeDir('catalogs')`, `$(ronin-store sops)`.
- Customize does not clone the Admin Desk, and it does not move the skin picker.
- **MASTER IS OWNER-CONTROLLED (owner, 2026-08-23, standing).** Do not push `master`,
  merge any PR into `master`, enable auto-merge, repoint the owner-facing service away from
  the master checkout, or take any equivalent release action **without a fresh explicit
  instruction from Glen naming that specific merge or release in the current task**. Work
  and pushes stay on `dev`. **Opening a PR does not authorize merging it.** The GitHub
  identity `gosmond3` is shared and is **not attribution**, so any authorized release
  command and the session name that ran it must be recorded in the relevant handoff
  **before** execution.
- **The foundation taxonomy holds (owner, 2026-08-23):** *pane* is the tmux object alone;
  session output renders into a **Tile**; a **Surface** is a coworkspace region that may
  host a Tile, Kanban, or **Channel services**; Chat, Wipeboard, Docs and Team
  Configuration are Channel services and their contents are never panes or panels.
  Customize is a Surface. Write `createPane` only where the landed symbol is the subject.
- KOTOBA vocabulary and `docs/ui.md` hold. Nothing Japanese reaches a user's face.
- **Pre-push and CI run `--gates`, which does not drive browser UI** —
  `.githooks/pre-push:37`, `.github/workflows/verify.yml:46`, guard at
  `bin/ronin-byoin:84`. **This is a documented trade with a named mitigation at three
  points, not a gap:** the hook comment (`:25`) and the workflow header (`:11`) each say to
  take a `--ui` verdict before landing, and **BYOIN announces it at runtime on every fast
  run** — `skip_ "$name — fast repo mode does not drive browser UI; run bin/ronin-byoin
  --ui"` (`:85`). The third is not a comment; it is in the output of the command itself,
  naming the exact fix.
  **And the house rule already covers the remainder, from the page every session reads at
  birth: *"A SKIP is not a pass."*** Anyone who read their own verdict would have seen two
  skips and been told what to run.

  **One counter-signal, in the most visible place of all — and it is a stale truth, not an
  overclaim.** `.github/workflows/verify.yml:45` names the step **"BYOIN — every check,
  then one verdict"** while `:46` runs `--gates`. That name is the string a person reads in
  the GitHub PR UI, and a green check labelled *every check* is exactly what stops someone
  looking further.

  **But nobody wrote a false label.** Verified: `3f2499c` touched **only the comment block**
  in that file — the `name:` and `run:` lines are untouched by it. And before that commit
  `--gates` had **no mode guard**: `3f2499c^:bin/ronin-byoin:86` *ran* `smoke-ui` and
  `visual-ui` and honest-skipped only on `rc=2` (no headless browser). So *"every check"*
  was **true of that configuration**. A true label went stale two lines from an edit, in the
  file that commit was editing — the same shape as the kept H1 and the never-swept boot
  page. @eye_league's causation finding; @eye_agent_config found the contradiction.

  This matters for the fix, which is not mine to make: *"the CI label is wrong"* invites
  editing a string. What is true is that the label describes a configuration that no longer
  exists, so the honest options are to **restore the coverage the label claims** or to
  **rename the step to the tier it runs**. (`.githooks/pre-push:37` is already honest — it
  echoes *"running the repo gates"*.)
- **`--ui` is the only tier that looks at these views. Take the verdict.** The precise
  history, narrower than I first wrote it and narrower in both directions
  (@eye_league's correction, verified here): **CI never covered browser UI** — the comment
  `3f2499c` deleted says *"a runner has neither [a live server nor a real browser], so
  `ronin-byoin --gates` SKIPs that one check WITH ITS REASON"*, so the render check skipped
  for want of a browser before and skips by mode now; **the reason changed, the coverage did
  not**. And **pre-push already ran `--gates`** (`3f2499c^:.githooks/pre-push:36-37`), so
  that tier did not move either. Coverage changed in exactly one place: a developer machine
  *with* a headless browser, where `--gates` used to run `smoke-ui` and `visual-ui` and now
  skips them by the guard at `bin/ronin-byoin:84`. My earlier *"covered before 12:26 and not
  now"* was true only there. **What is unchanged and was never in dispute: a green CI proves
  nothing about a rendered view, and this slice is nothing but rendered views.**
- Repository verification is `bin/ronin-byoin` and nothing hand-rolled, in the mode the
  work earns (`docs/test-protocols.md`): `--gates` is the ordinary pre-push/PR tier,
  `--ui` adds browser UI and is owed by anything that renders, and full BYOIN is the
  installed-box tier with machine readouts — not the repo verdict. **This slice renders,
  so both repo tiers are owed.** A SKIP is unverified, never a pass.

## Verification

**How to read these gates** — three sessions got this wrong in one afternoon, so it goes
ahead of the journeys rather than after them.

1. **Prefer an instrument whose pass and fail differ at the point of reading.**
   `check-docs` prints a trailing blank line, so `tail -1` returns the **identical byte**
   for a clean run and a failing one — verified both directions with `cat -A`. A no-match
   `grep … || echo CLEAN` is the same shape: a typo in the pattern prints CLEAN. **Silence
   is never a pass.** Use the exit code: `check-docs >/dev/null 2>&1; echo $?`.
2. **Capture once, report from the capture.** `OUT=$(…); RC=$?` — then read every claim
   out of that one capture. Running the gate twice in a turn gives you two *instants*, and
   a report that mixes them can contradict itself.
3. **Two claims, and only one is yours.** *"My file is clean"* is stable — one editor.
   *"The repo is green"* is a claim about four documents other sessions are editing right
   now; the gate returned **four different answers in ninety seconds** while five Eyes
   worked. Vouch for your file; timestamp anything wider.
4. **A marker you have not broken is a marker you have not verified.** Strip every
   `[planned]`, re-run, count, restore, diff. Every doc that ran this found something.

Rules 1-3 are @eye_team's and @eye_league's; rule 4 is @eye_agent_config's.



`docs/test-protocols.md` governs: one command, once the work is complete, one verdict
reported as it reads.

Browser review is design acceptance, not a test harness. The journeys it must cover:

- direct entry, refresh and back/forward into Customize and into each resource;
- a fresh install with no user catalogs at all — every stock list renders, nothing errors;
- a stock entry, an added entry (`◆`) and a shadowed entry (`◈`) rendering correctly in
  each of the four shadow shapes;
- the shadow warning appearing **before** a stock entry is made the owner's;
- a role-family membership edit, including the refusal that would orphan the pinned
  `default_lead_role`, with the server's message on the form;
- a saved launch created, edited and deleted, with every other byte of the file intact;
- a malformed definition file named rather than silently omitted;
- a failed save keeping the form open with text intact; a failed load leaving Save off;
- a read-only resource that ends with how to change it, not with a disabled form;
- Tools stated as unavailable while P1 is open, rather than rendering an empty list as if
  there were no tools;
- desktop, tablet and phone; keyboard traversal of the rail and visible selection.

## Definition of done

- The matrix is frozen and every resource behaves as exactly the capability it names.
- P1 and P3 have landed; P2 has landed or the Saved Launches editor is explicitly deferred
  and said to be deferred.
- No direct editor exists anywhere the matrix does not grant one.
- Provenance and the shadow trade are visible on every resource, from the one module.
- Every standard state is exercised on every resource.
- No shared shell file carries a Customize-only change, and the two shared server files
  were touched only with @view_mgr's ack.
- **Both repo tiers are clean**: `bin/ronin-byoin --gates` and `bin/ronin-byoin --ui`,
  each reported as it reads, with any SKIP called unverified rather than passed.
- `docs/customize.md` [planned] states what was built and this document is deleted.
  The manifest entry is **answered, not assumed** — this repo ships no manifest drawer, so
  landing either creates one or records that there is nowhere for the line to go.
