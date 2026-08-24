# AGENT CONFIGURATION — Eye 5 build-out

## Goal

> Use R35 precedence: system < team roster context < session_role < explicit launch
> fields; role_family is only a presentation/template grouping. V1 config edits only
> launch-time fields already supported; inherited computed fields are read-only with
> provenance. Preview is composed brief plus a dry-run resolved profile, not a fake
> terminal. Apply/revert changes Eye 4's canonical draft only; saved launches are out of
> this first slice.
>
> No field or inherited behavior should be forced merely because the UI exposes it.
> Null/unclassified values are valid and should remain round-trippable. Chat is outside
> this Eye and remains empty in v1 pending the future voice/Koshi/Kaki integration.
>
> — the owner, 2026-08-23

This is the plan for the fifth destination, `agent-config/:draft-or-team?`. It is a plan
and nothing else: no code has been written and none will be until the owner says go.

## CURRENT STATE / RESUME HERE — 2026-08-23 17:36Z

Written for whoever picks this up cold. Facts only.

**Completed behaviour.** The draft-backed configuration+preview slice is written and
loads: two Surfaces, no Tile, no Channel service. The left Surface edits the eleven
launch-time seat fields with three-state controls; the four nullable fields (`mcp`, `cmd`,
`project_root`, `name`) carry an *inherit* affordance and no others do. `cmd` disables and
`prompt` drops its requirement when `resolved.agent` is false, both read off the
resolution rather than hard-coded. The right Surface shows the composed brief and the
resolved reading. Check runs Eye 4's `POST /api/launch/preflight`; seat `reasons[]` paint
under the control named by `reason.field` with the server's message verbatim, and a reason
naming no control goes to the form notice. Apply writes the seat into Eye 4's in-memory
draft; Revert restores last-applied, never defaults.

**Files I own** (all untracked, none committed):

| File | Bytes | mtime |
|---|---|---|
| `public/js/agent-config.js` | 5649 | 15:57:36 |
| `public/js/agent-config-fields.js` | 9927 | 16:01:39 |
| `public/js/agent-config-preview.js` | 5239 | 16:01:39 |

`agent-config-resolved.js` [planned] is named in the file list above and **is not
written** — it would hold the `stated_by` attribution, which does not exist yet. The
marker is the sanctioned way to name a thing before it is built; it does not mean the
name is agreed.

**Shared seams I touched** — two lines, both in files other sessions also edit:

- `public/js/main.js` — one import of `createAgentConfigurationView`, one register block
  before `workspace.start()`. Currently 3 `agent-config` references.
- `public/index.html` — one view root, `id="agent-config-view"`. Currently 1 reference.

**Uncommitted.** Everything of mine. `HEAD` is `989daa5` ("Make the wipeboard a transport,
not a record"), which contains none of my files; `main.js` and `index.html` are modified
in the working tree.

**Verification actually run, and against what.**

- `node --check` on all three owned files — passed. Syntax only.
- `node scripts/check-dead.mjs` — passed, after the import/export chain closed.
- `node scripts/check-modules.mjs` — exit 0, after fixing two load-order faults of mine.
- `bin/ronin-byoin --gates` — capture 16:02:55Z, **exit 0**, "the repo is clean (16 ok, 2
  skipped)". The two skips are `smoke-ui` and `visual-ui`.
- `node scripts/check-docs.mjs` — all claims hold; this file clean.
- **`--ui` has never been run against this work, by anyone.** `smoke-ui.mjs` falls back to
  `defaultUrl()` (`scripts/lib/ui-host.mjs:21-29`), which targets the **running server** on
  port 3006. That process is pid 1388949 with cwd `/home/glen3/dohyo/ronin-cowork-live` — a
  different checkout — and its served `main.js` contains no `agent-config`. So **no
  rendered check has ever looked at this slice**, and the documented `/staging/` route does
  not close the gap: `STAGING` resolves against the serving process's root, so staging from
  this repo is not served.

**Known failures and limitations.**

- No `stated_by`: resolved rows show a value and not which layer or file stated it. The
  preview says so on its own surface rather than implying attribution it does not have.
- No feature stylesheet written, deliberately. The layout renders on the kit's shared rule
  (`public/style.css:6473`), which gives this destination a 12rem nav-rail first column
  where its first Surface is an eleven-field editor. It will look wrong and that is known.
- Draft persistence is not solved. Apply writes an in-memory draft; there is no per-view
  slot in the workspace record, so a refresh loses typed work.
- The `main.js` registration was silently clobbered once by another session's whole-file
  write. `check-dead` stayed green; `check-modules` caught it as an orphan. **Re-grep
  before assuming the module is at fault.**

**Current blocker.** Root holds the tree and is running combined verification. Owner
instruction: do not run or commit the shared tree independently; hold owned files stable.

**Single next action.** Wait for root's named gate fixes, then apply them to the three
owned files only. Touch no shared file without saying so first.

**Branch rule (owner, 2026-08-23) — binding on this work.** `master` is owner-controlled.
No push to master, no merge into master, no auto-merge, no repointing the owner-facing
service away from the master checkout, and no equivalent release action, without a fresh
explicit instruction from Glen naming that specific merge or release in the current task.
**Opening a PR does not authorize merging it.** Work and pushes stay on `dev`. The shared
GitHub identity `gosmond3` is not attribution, so any authorized release command and the
session name that ran it are recorded in the handoff *before* execution.

Current position against that rule, measured: branch `dev`, HEAD `fe958a7`, `master` at
`8e82df6` and untouched by me. **I have made no commits and pushed nothing.**

*Why the attribution clause is not theoretical:* `git log --author=<my configured email>`
returns three commits — `fe958a7`, `989daa5`, `18d9b35` — and **I wrote none of them**.
Every session on this box shares one git identity, so the author field cannot tell you
which session did anything. That is exactly why the session name goes in the handoff.

**Two of the three staging remedies under discussion are barred by this rule**, and that
matters because the `--ui` gap above is still open: pointing `RONIN_STAGING_DIR` at this
repo and restarting the live process, and staging into the live checkout, both act on the
owner-facing service. Neither is mine. Only serving this checkout on a spare port avoids
it — and that carries its own measured cost: a second Ronin ran its janitor against the
live tmux server and cleaned up ten viewer sessions.

## FINAL HANDOFF DELTA — 2026-08-24, at dev `98890c0`

Supersedes the RESUME HERE section above where they disagree. Read this first.

**The named handoff commit is not tip.** The freeze named `47cb962`; `dev` is now
`98890c0`, two commits past it (`a519209`, `98890c0`).

**My slice is committed and is an ancestor of HEAD.** `9294446` — "Agent Configuration:
the seat editor and its preview" — carries exactly four paths: the three owned modules and
this document. The RESUME section above says "Uncommitted. Everything of mine"; **that is
now false.** `git diff 9294446 HEAD` over the three modules is empty: nothing has touched
them since.

**The orphan risk I flagged is closed.** I committed the modules without their
registration, because `main.js` and `index.html` were shared and out of scope. `d36b440`
("Wire the Five Eyes preview destinations") landed it: at HEAD, `main.js` carries 3
`agent-config` references and `index.html` carries the view root. **No successor needs to
re-add the registration**, and any orphan report naming an `agent-config` module is now a
regression rather than the expected state.

**Both shared seam files are dirty again in the working tree**, modified by other sessions,
not by me. The clobber hazard in the RESUME section stands: a whole-file write to `main.js`
silently drops other sessions' lines, `check-dead` stays green, and only `check-modules`
catches it as an orphan. **Re-grep before believing a module is at fault.**

**Unchanged and still open** — carried forward, not re-measured, because the freeze stops
testing:

- **No rendered check has ever looked at this slice.** The reasoning and the measurement
  method are in the RESUME section; both were true as of 17:36Z on 2026-08-23 and are
  unverified since. This is the successor's first real gap, not a solved item.
- **No `stated_by`** — resolved rows show a value, not which layer or file stated it. Still
  a joint ask with New Team on the existing resolver.
- **No feature stylesheet**, deliberately. The destination renders on the kit's shared rule
  and will look wrong in a first-glance review. Known, not a defect to chase.
- **Draft persistence unsolved** — Apply writes an in-memory draft; a refresh loses typed
  work.

**Position at handoff.** Branch `dev`. Nothing pushed by this session, no merge, `master`
untouched by me. Index clean. Idle and awaiting the successor's acknowledgement.

## Vocabulary — the owner's taxonomy, 2026-08-23

Stated first because a reader meets it before any finding below, and because a successor
born after this ruling will be handed documents written before it.

| Word | Means |
|---|---|
| **pane** | **Only** the tmux object inside the tmux server. Nothing this destination draws is one. |
| **Tile** | What Ronin renders session output into. |
| **Surface** | A larger coworkspace region. It may host a terminal Tile, a Kanban, or Channel services. |
| **Channel service** | Chat, Wipeboard, Docs, Team Configuration. Their contents are never called panes or panels. |

The table above is the ruling and nothing else. **What follows is Eye 5's reading of it,
not the owner's** — the ruling defines four words and classifies none of the five
destinations, and a reader must be able to see where it stops.

**Eye 5's reading:** this destination is two **Surfaces** side by side — the seat editor
and the preview. It hosts **no Channel service**, **no Kanban**, and **no Tile**: a
proposed seat has no session, so there is nothing for a Tile to render. The right-hand
Surface is where a Tile would go and never does.

So this destination hosts **none of the three things a Surface "may host"**. Eye 1 observed
that of League and Eye 3 confirmed it of Customize, calling it two of five; on my own
surface it is a third, which suggests the pattern is broader than an oddity. I am not
classifying the other two — that is theirs to do, and I have been wrong about scope three
times today by enumerating past what I checked. What it implies is worth someone ruling on:
"may host" is permissive, so a region hosting none of the three is still an ordinary
Surface under the wording as given. If it were ever tightened to *the region around a
Tile*, these destinations are the ones that break.

**How the three words are used below**, stated so it survives me rather than living in my
head:

- **Surface** — the ruled region. Capitalised, always.
- **destination** — a first-class view (League, Team, Customize, New Team, Agent
  Configuration). The shell's own word, and the right one where I had been reaching for
  "surface".
- ordinary English — kept where "surface" is doing ordinary work, including as a verb
  ("a refusal is *surfaced* at edit time"). A blanket sweep on the word would have mangled
  those, so this was done by hand, use by use.

Two further exceptions in the text below. **Code symbols are quoted literally** —
`createPane`, `createChannelPane`, `createReservedPane`, `SessionPane` — because they are
the names of landed things; the ruling makes those names wrong, and that is recorded under
the primitives audit rather than papered over here. **Quotations from other build-outs stay
verbatim**, including their pre-ruling wording, because silently editing another Eye's
words inside quotation marks would be worse than the stale term.

## What agent configuration IS, in v1

**The compact editor for one proposed session seat in a Team draft.** It answers one
question — *what will this session be born with* — and it answers it before there is a
session.

Three jobs, and only three:

1. **Show** the whole resolved answer for this seat, marking which layer supplied each
   part of it.
2. **Let the owner change** the parts a launch can actually carry, without inventing a
   field the launch does not have.
3. **Refuse early**, at edit time, in the cascade's own words, naming the file.

### What it is NOT

- **Not a second launch schema.** Eye 4 owns the canonical Team draft and the seat shape
  (Gate E). This Eye edits that draft and returns it.
- **Not a second cascade.** `src/launch-profile.ts` and `src/spawn.ts` resolve; this Eye
  displays. A copy in the browser would be correct exactly until somebody edited one of
  them.
- **Not live-session management.** There is no session yet, so there is no dial to flip,
  no macro to fire, no lock, no Control, no note, no kill. This destination carries
  none of that chrome.
- **Not vendor CLI configuration.** What `claude` or `codex` stores in its own config is
  the vendor's business and stays there.
- **Not named loadouts, and not saved launches.** Explicitly out of this slice by the
  owner's ruling. Saved launches also still require the retired `role_family`
  (`src/catalog.ts:326`), which is a defect to fix elsewhere before anything here touches
  them.
- **Not chat.** `Chat` is one of the four **Channel services** (with Wipeboard, Docs and
  Team Configuration), it belongs to Eye 2, and it stays an empty reserved region in v1
  pending voice/Koshi/Kaki. Agent Configuration hosts no Channel service at all, ships no
  chat affordance, and ships no composer that could be mistaken for one.

## The precedence, as ruled (R35)

```text
system  <  team roster CONTEXT  <  session_role  <  explicit launch fields
```

| Layer | What it contributes | Where it lives |
|---|---|---|
| **system** | the install's own answer for every cascading field | `SYSTEM` in `src/launch-profile.ts` |
| **team roster context** | project_root default, repos, branch, objective, the `team_role` reading shelf | `src/team-rosters.ts`, resolved in `src/spawn.ts` |
| **session_role** | the ONE definition layer — model bias, dial, permissions, lifecycle, mcp, cap, agent, dir, ack, opening, posture, label | `ronin_catalogs/session_roles/<token>.md` |
| **explicit launch fields** | what this seat states | `SpawnForm`, `src/spawn.ts` |

Two things this table is careful about:

- **The team layer contributes CONTEXT, never a definition field.** It seeds where the
  session is born and what it reads; it never states a dial or a permission mode. That
  split is what keeps the cascade testable without a machine, and the surface must not
  blur it by drawing team values in the same column as definition values.
- **`role_family` is not a row here.** It is the New Session board's grouping of session
  roles and a Build-Team template — presentation, and a fact about no session. It never
  rides a launch.

**R35 is refused correctly in five places, and the saved-launch path still carries it end
to end across six sites in two files.** Do **not** scope this as "change one function" —
that was my claim and it was wrong. A successor should not "fix" any of the five
refusals:

- `src/routes/launch.ts:45` — the retired axis keys refused by name on `POST /api/launch`
- `src/routes/catalogs.ts` — `GET /api/launch-profile` 400s on `role_family` by name
- `src/routes/sessions-api.ts:215` — a whole retired-route loop returning 410 for
  `session_job`, `family_role`, `session_task` and `role_family`
- `src/routes/sessions-api.ts:251` — the body-level refusal, "a session has no identity
  axis of its own"
- `ronin_bin/write_tegami:449` — refused at the letter boundary, "Drop `role_family`"

**But there is exactly one place where the code IS wrong**, and it must not be lost inside
a tidy "documentation sweep" framing:

- `src/catalog.ts:326` — `saveLaunch` does not merely tolerate the retired key, it
  **accepts it as sufficient**: `if (!fields.role_family && !fields.session_role) throw`.
  I traced the whole chain rather than the one line, and it is worse than a stale
  validator: `LAUNCH_FIELDS` (`:313`) carries `role_family`, so it is **written** to the
  file; `listSavedLaunches` (`:305`) filters on `l.role_family || l.session_role`, so it
  is **read back and shown**. And `GET /api/launch-profile` refuses that axis by name. So
  the system accepts, stores, lists and displays a saved launch it has already decided it
  cannot resolve.

  **And it is six sites, not one function.** I wrote "change one function", having traced
  three of these myself in the same edit — the validator, the field list and the filter —
  without asking whether the list was complete. Eye 1 ran an unfiltered grep; I re-ran it
  and confirm the full set: `src/catalog.ts:277` types it on the record, `:294` reads it,
  `:305` filters on it, `:313` lists it in `LAUNCH_FIELDS`, `:326` accepts it as
  sufficient, and `src/routes/catalogs.ts:355` iterates it as a writable `LaunchField`.
  Type, read, filter, field list, validator, route — end to end.

  Two documentation faces sit in the same file, and whoever fixes the code will have both
  on screen: the comment at `:303-304` *rationalises* the filter — "one naming only a role
  is a blank-task launch, which is a real thing to save" — and `:256` describes the saved
  launch as "`role_family` × `session_role` × `project_root` × group × mode". Both were
  true before R35; both now teach the dismantled model from inside working code, the same
  class as `role-watch.ts`'s header.

  **The method note, because it is the transferable part:** a grep filtered on
  `retired|refus|400|error` cannot return an acceptance site — it is shaped to pass. The
  check that works is the unfiltered one. Do not search for the answer you expect; search
  for what would falsify it.

I recorded three refusal sites, Eye 2 found five, and Eye 4 caught that the tidy framing
hides the one real code change. I verified all of it in source.

**And I should have caught the last one myself** — this document already records
`src/catalog.ts:326` as a defect, twice, in the exclusions and in the discrepancy list. I
adopted a peer's clean summary ("every code path is already right") without checking it
against what my own document said three sections earlier. Same shape as the other three
errors this hour: a boundary asserted around facts that were individually correct.

The reason this belongs in *this* document: a successor reading a stale README finds it
describing a live axis, looks at the code, finds a refusal, and concludes there is work to
do. There is not — except in `saveLaunch`, where there is.

**The reviewed fixture is stale on exactly this point.** Its Resolved-configuration
Surface carries a `Role family` row and the notice *"System defaults < role family < session role
< this explicit launch"*. That is the pre-R35 model. The fixture governs composition and
visual intent; it does not govern the cascade, and this row and notice are **not carried
forward**. `WORKSPACE_KIT.md` and `FIVE_EYES.md` repeat the same stale wording, including
in this Eye's own charter, and want correcting at the source.

## Absence is a value — the round-trip law

The owner's ruling, and the constraint most likely to be violated by accident:

> No field or inherited behavior should be forced merely because the UI exposes it.
> Null/unclassified values are valid and should remain round-trippable.

The engine already works this way. `src/launch-profile.ts`: *absence means inherit, and
only absence* — there is no way to spell "inherit" as a value, and a key line with an
empty value reads as absent. The UI is where that law usually dies, because a `<select>`
needs a selected option and a toggle has two positions.

So, binding on this Eye:

- **Three states per editable field, not two:** *unset* (inherit — the seat says nothing),
  *set to a value*, and where the API accepts it, *set to empty*. The editor renders all
  three distinguishably and can return to *unset*.
- **Byte-identical round-trip.** Opening a seat and applying it back with no edits must
  produce the same draft that went in. No default may be materialized because a control
  was drawn. This is a verification item, not a nicety.
- **Blank is first-class, everywhere it already is.** A seat with no `session_role` is a
  real launch. A seat on no team is a rōnin, an ordinary state. A blank `team_role` is
  valid. No model bias is valid. `agent: none` — a plain terminal with no CLI, no brief
  and no model — is valid, and the surface must render that seat honestly rather than
  greying out half a form.
- **`mcp` is the sharp case.** `SpawnForm.mcp` is `boolean | undefined`, and `undefined`
  means *whatever the resolved profile says* — which is off for every ordinary launch, by
  the owner's ruling of 2026-08-22. A two-state toggle would turn every silent seat into
  an explicit `false`, which is a different launch from the one the owner drafted. It gets
  a tri-state, and the inherited position says what it inherited.
- **Unclassified is not an error state.** A seat missing something the launch would refuse
  is shown with its refusal and is still storable. Typed work survives; Eye 4's batch
  preflight is where a draft is finally told no.
- **No workflow gate exists merely because the UI drew a field.** An empty Team, zero
  seats, a seat with no role, a Team with no lead and a partially specified draft are all
  valid states to hold and to save. Where anything is ordered, the missing or unclassified
  value sorts **last** — it is never dropped and never promoted.

### The marker set, as Eye 4 confirmed it

Eye 4's canonical draft stores unset **distinctly**, and the marker is `null` on exactly
the four fields where the server itself distinguishes absent from stated: `mcp`, `cmd`,
`project_root`, `name`. Everywhere else an empty string or empty array is a **stated
value**, not absence.

The sharpest case is `session_role: ""` — a real blank-role launch, with no reading and no
mark. It is never "not picked yet", and the editor must not draw it as an empty
placeholder waiting to be filled.

The round trip holds because **the draft is authority and the wire body is derived**:
serialization drops nulls rather than materializing them. Open a seat, draw every control,
save unedited — byte-identical.

## The v1 field set

### Editable — and only these

These are fields `POST /api/launch` accepts today (`SpawnForm`, `src/spawn.ts`), minus
the one Eye 4 owns at Team level. Nothing is added.

| Field | What it is | Unset means | Unset marker |
|---|---|---|---|
| `session_role` | what this session will be doing | — | **none**: `""` is a *stated* blank-role launch |
| `name` | what it is called | server derives it from role + prompt | `null` |
| `mode` | `manual` \| `assisted` | — | **none**: always stated (see below) |
| `prompt` | what the session is for; the agent's first message | — | `""` is stated; required for an agent launch, meaningless for `agent: none` |
| `project_root` | where the work happens | team default, then top active root | `null` |
| `cmd` | which `session_launch_spec` launches | the `model:` bias, then the install default | `null` |
| `mcp` | gbrain on/off for this session | whatever the resolved profile says | `null` |
| `tags` | memberships **beyond** the birth team | — | `[]` is stated |
| `seed` | paths read before anything else | — | `[]` is stated |
| `inject` | one-off instruction appended verbatim | — | `""` is stated |
| `reference` | the one session this one is pointed at | — | `""` is stated |

**`team` is not a seat field.** Eye 4 corrected this and is right: the team sits once on
`TeamDefinition` and the controller supplies it to every launch — one draft is one Team. A
seat's `tags` are *additional* memberships; the birth team rides first and cannot be
truncated by the sixteen-tag cap (`src/spawn.ts`).

**`mode` is always stated and never `null`.** The wire defaults an absent `mode` to
`assisted` (`src/routes/launch.ts`) while the launcher's honest default is `manual`
(`public/js/launcher.js`). An unset `mode` would therefore silently change what happens to
the owner's words — the one place where inheriting is *less* honest than stating. It is a
required two-value field.

`mode: manual` suppresses `seed`, `inject` and the composed wording, because manual means
Ronin adds no words of its own. The editor hides them rather than sending them and having
them ignored.

### Draft-local, read but never written

Two fields belong to Eye 4's draft and pass through this destination untouched:

- **`seat_id`** — the retry key and the seat's identity. Returned unchanged, always.
- **`presented_family`** — a breadcrumb naming which shelf the seat was picked from.
  **Never sent, and not an axis.** This is the correct home for `role_family`: it feeds
  the card's breadcrumb and the `default_lead_role` suggestion and reaches no payload,
  which is exactly what "presentation grouping" means.

Eye 5 may not write `seat_id`, `resolved`, `outcome`, any `TeamDefinition` field, the
seats' ordering, or `lead_seat_id`.

### Read-only, with `stated_by`

Everything the cascade computes. Shown, never edited here, each marked with the layer and
**the file** that stated it:

`agent` · `model` · `dial` · `permissions` · `lifecycle` · `ack` · `opening` · `posture` ·
`label` · `cap`/`capExempt` · `mcpAlways` · `mcpDefault` · `dir`

…plus what the team layer supplies as context: `project_root` default, `repos`, `branch`,
`team_role`, `objective`, `wipeboard` — and the birth reading list, which is listed at
resolve time rather than remembered (`src/session-boot.ts`).

**The reading list will usually be shorter than it looks, and that is correct.** Eye 3
traced the chain and I verified my own leg of it: `bootFiles` pushes the
`team_role/<team_role>/` levels only when the value is non-empty
(`src/session-boot.ts:225`), and a tag-only team resolves `team_role` to `''`
(`src/spawn.ts:432`). Even for a rostered team the levels contribute nothing today —
**stock ships no team_role reading level at all** — `ronin_session_boot/` contains only
`all/` and `role/` — and the owner's own shelf has that level as an empty directory.
Measured on this box, not inferred. (The level is named here as prose, not as a path,
because the whole point is that no such directory exists in the tree.)

So a resolved seat routinely shows no `team_role` reading. This destination renders that as
**correct and empty**, never as absent and never as a failure: nothing broke, the level is
right, and it has nothing upstream of it yet. Same doctrine Eye 3 reached for the readings
explorer, arrived at here for a different reason — it is a sentence, not a state.

**The list this destination shows is the BIRTH list, and that is the whole of its scope.** Eye 3
established an asymmetry worth recording so nothing here is read as implying otherwise, and
I verified both halves in source: `role/<session_role>/` **is** re-resolved on a committed
role change and injected into the running session, resolved fresh at that moment rather
than remembered from the launch (`src/session-boot.ts:243-246`). The all, root,
service-connected and team_role levels are birth-only — named as levels rather than as
paths, because only two of the four exist as directories in this repo. Nothing watches any
directory. Two levels sit side by side in one shelf and behave oppositely. This destination configures a
pre-birth seat, so the birth list is exactly the right thing for it to show — but the
blanket rule "session readings are birth-only" is false, and a reader should not carry it
away from here.

Each read-only row carries a pointer to where it is changed — the session_role file, or
the team roster — so the surface teaches the model instead of dead-ending.

**Dependency, and a joint ask with Eye 4.** Neither endpoint returns this today. The
resolver knows it internally — `stated()` in `src/launch-profile.ts` finds the last layer
to state a key — but it returns none of it. Eye 4 proposed, and Eye 5 accepts, that the
two of us request it **together as one contained addition to the existing resolver**
rather than either of us inferring it browser-side. Inferring it browser-side would be a
second cascade wearing a different hat.

**The field is `stated_by`, not `provenance` — and this destination is why.** Eye 4 raised the
collision and I verified it in full rather than take it on report: `public/js/provenance.js`
already owns that word, on screen, for a different fact — catalog origin, ◆ *yours* and
◈ *yours, changed*, across four places in the UI. Cascade attribution is not catalog
origin.

It is sharper here than anywhere else in the rollout, because **this destination shows both
facts on one row at once.** A `session_role` definition may itself be shadowed — the
owner's file standing in a shipped file's place, which is the ◈ mark — *and* be the layer
that stated `dial`. Two different marks, two different meanings, and one word over both
would be exactly the two-facts-one-word defect the spelling law exists to prevent.
`stated_by` is also the resolver's own verb. Renamed throughout, in the ask and in the
copy.

**The owner's requirement is unchanged by this.** The goal above says inherited computed
fields are read-only *with provenance*, and that is exactly what ships: every such field
names the layer and the file that stated it. Only the wire and code name moves, and it
moves to avoid colliding with a word already on screen meaning something else.

## Preview — brief plus dry run, and no terminal

Two halves, both truthful, neither a terminal.

**1. The composed brief.** The literal first message this session will be born with —
`buildBrief` in `src/spawn.ts`, assembled from posture, the team line, the reading list,
the opening template, the reference line, the inject and the ack rule. In `manual` mode it
shows the owner's text byte for byte, because that is what manual means. This is the
highest-value thing the surface can show: it is what the agent actually reads.

**2. The dry-run resolved profile.** What `resolveForm` would return for this seat —
including its refusals — without creating a session.

**There is no terminal, and this is a decision, not an omission.** A proposed seat has no
session, so there is nothing to attach. A simulated terminal would be a picture of a lie.
The fixture's `Condensed / Full` switch is also pre-contract: `docs/tile.md` settles six
named **Outputs**, five of them RIREKI-service-fed, and **bare cowork offers Locked only**
— so any preview built on them would be blank on the free product. The fixture's terminal
Surface is read as *reviewed composition for a two-column compact layout*, and its right
column becomes the brief-and-resolution preview.

### The terminal-host dependency, stated exactly: it is zero

I understated this and Eye 2 was right to correct it. I wrote that Eye 5 depends on Eye 2's
host "only after launch". It does not depend on it at all.

Before launch there is no session, so there is no transport, no socket and no Output. After
launch the seat *becomes* a live session and is rendered by Eye 2's ordinary compositions
in the Team workbench or Sessions mode — destinations this Eye does not own and is not
present in. There is no moment at which Agent Configuration mounts a terminal.

**The consequence is Eye 2's, and it is a real one:** `WORKSPACE_KIT.md` names *three*
deliberate compositions of the terminal host, and the third — the clean one — was mine. It
now has no consumer and should not be built. Gate D serves two consumers (the focused
terminal and Sessions mode), which still clears the kit's two-consumer bar.

**Four places say otherwise and want amending.** Eye 2 named two; I verified and found
four:

- `WORKSPACE_KIT.md:207` — "clean terminal pane for Agent Configuration"
- `WORKSPACE_KIT.md:368` — the What-each-Eye-receives row: "CompactTerminalLayout,
  AgentSeatCard, **clean SessionPane**"
- `FIVE_EYES.md:190` — Gate D: "Team Sessions and Agent Configuration consume it."
- `FIVE_EYES.md:300` — this Eye's own charter: "terminal preview through Eye 2's host
  contract"

All four predate the owner's no-fake-terminal ruling. I do not edit another Eye's
build-out; they are listed for the owner or `@view_mgr`.

### The dry run — settled: it is Eye 4's preflight

`GET /api/launch-profile?session_role=…` resolves the **session_role layer alone**. It
knows nothing of the team, the project_root fallback chain, provider/model resolution
through the launch table, or any MCP refusal — all of which live in `resolveForm` and ran
only at creation.

**Eye 4 has taken it** (agreed 2026-08-23): `POST /api/launch/preflight` is exactly
`resolveForm` without creating a session, and it is Eye 4's preflight, not a second route
of mine. Per seat it returns:

- **`ResolvedSeat`** — the `Resolved` shape from `src/spawn.ts`: `name`, `dir`, `cmd`,
  `tags`, `dial`, `lifecycle`, `session_role`, `team`, `team_role`, `project_root`,
  `mode`, `agent`, `capExempt`, `mcp`, `launchAgent`
- **the composed brief**, for the preview's first half
- **`stated_by`**, once the joint ask lands

Eye 5 builds no second resolver, no second payload and no browser-side cascade. It
consumes that response.

**One honest caveat, carried from Eye 4 rather than glossed:** `resolveForm` calls
`ensureShelf`, which `mkdir`s a shelf folder per project_root. It is idempotent and
happens at the next real launch anyway, but the claim is *"creates no session and no
roster"*, not *"touches nothing"*.

Until preflight exists, this Eye works against fixture drafts, which its charter permits.

## Validation — the cascade's refusals, at edit time

Every refusal below already exists in code and already names a file. The work is surfacing
them where the owner can still do something about it, not writing new rules.

**Seat-local** — this Eye shows them:

- unknown `session_role`; unknown `project_root`
- **a `team` with no roster on this box** — the refusal this destination will show most often,
  though *not yet*, and the timing matters. `resolveForm` refuses at `src/spawn.ts:284-289` — the guard on `:284`, the `throw` on
  `:285`.
  Today it never fires: `public/js/launcher.js:565` sends the team as `tags:[name]` and
  never the first-class `team:` key, so `form.team` is always absent and the roster is
  never looked up. Two consequences compose, and Eye 1 and Eye 2 found one each:
  **every Team created through the current UI is tag-only**, so the rostered Team is
  currently the rare one; and the moment the launcher is fixed to send `team:`, today's
  silent degradation — a session born with no roster defaults — **becomes a hard refusal on
  most Teams on this box**. The fix for the first exposes the second. That is an argument
  for sequencing, not against the fix, and the resolver's own comment states the doctrine:
  being born onto a team deserves the durable half to exist, while joining a tag-only team
  afterwards is the tags route's ordinary business. Eye 4's stage 1 and Eye 2's Team Config
  empty state are the two doors that create a roster. This destination neither creates rosters
  nor works around their absence: it shows the refusal in the resolver's own words, which
  already name the fix
- `mcp: always` contradicted by a seat asking for MCP off
- an `agent: none` seat handed a `cmd`, or handed agent-only fields from at or above the
  declaring layer
- an illegal `dir:` (only `{install}` is legal)
- MCP off asked for where the provider declares no `mcp_off:` flags
- this box has no active `project_root` at all
- `mode: manual` with no name; an agent seat with no prompt
- a `reference` session that has since died
- a name with no usable characters

**Batch-level** — this Eye *displays*, Eye 4 *owns*: name collisions across seats, the
session max, launch order, partial failure, retry, receipts.

Rules: a refusal is shown and never auto-corrected. Typed work survives it. A failing seat
is still storable — the draft carries the refusal so Eye 4's preflight can refuse the
batch as a whole.

## Apply, revert, and per-field clear

- **Apply** writes the seat into **Eye 4's canonical draft**. That is the only durable
  effect this destination has. No saved launch, no roster write, no session, no file.
- **Revert** restores the seat to the draft's last applied state — *not* to system
  defaults. Reverting into defaults would materialize inheritance, which is the round-trip
  law broken.
- **Clear this field** is separate and per-field: it returns exactly one field to *unset*,
  so the seat inherits again. This is the only way back to inheritance, and it must exist
  for every editable field.
- Applying an incomplete or refused seat is allowed. Half-finished is an ordinary state of
  a draft.

## Layout

**Stated in the owner's taxonomy (2026-08-23):** this destination is **two Surfaces side by
side**. Neither is a pane — a pane is only the tmux object inside the tmux server — and
neither hosts a Channel service. The right-hand Surface may *never* host a terminal Tile
before launch, because there is no session yet.

`WorkspaceKit.layouts.createCompactTerminalLayout(configuration, terminal)` — two Surfaces,
sharing mechanics with `ExplorerLayout` without inheriting explorer semantics. Eye 5 mounts
the seat editor in the first slot and the **preview** in the second; that slot's name says
`terminal`, but nothing terminal-shaped goes into it before launch:

```text
┌──────────────────────────┬──────────────────────────┐
│ Seat configuration       │ Preview                  │
│ (Surface)                │ (Surface)                │
│  · editable fields       │  · composed brief        │
│  · resolved, read-only,  │  · dry-run resolution    │
│    with stated_by        │    and refusals          │
└──────────────────────────┴──────────────────────────┘
```

The entry point is an `AgentSeatCard` in Eye 4's roster stage. One application header; no
second identity header here. No ordinary session-management rail. Phone composition
stacks rather than splits.

## Kit primitives — audited against what this Eye needs

Eye 3 audited its own primitive rather than assuming; this is the same check for mine, run
against the uncommitted working tree. Two findings are mine alone, two are shared and
already independently reported.

**1. `CompactTerminalLayout` has inherited explorer semantics through its ratio — mine.**
`public/style.css` puts three layouts in one rule:

```css
.wk-explorer-layout, .wk-compact-terminal-layout, .wk-new-team-layout {
  grid-template-columns: minmax(12rem, 2fr) minmax(0, 5fr);
}
```

That is a rail-and-content ratio: a 12rem-minimum first column at 2:5. `WORKSPACE_KIT.md`
says CompactTerminalLayout "may share two-column mechanics with `ExplorerLayout`
**without inheriting explorer semantics**", and a ratio shaped for a nav rail is exactly
that inheritance. My first column is not a rail — it is an eleven-field editor with
per-field `stated_by` and tri-states.

**The reviewed fixture already made this decision and the landed CSS lost it.** The
fixture starts them together and then deliberately overrides:

```css
.explorer-layout, .compact-layout { grid-template-columns: 235px minmax(0,1fr); }   /* line 211 */
.compact-layout { grid-template-columns: minmax(290px,.8fr) minmax(0,1.2fr); }      /* line 230 */
```

Fixture and kit contract agree; the landed CSS is the outlier. The ask is that
`.wk-compact-terminal-layout` gets its own rule, as the fixture does. Not a defect — the
kit's own sequence puts layouts at step 4 and this is uncommitted — but named now rather
than hit at Leg 7.

**2. The slot is named `terminal` in the DOM, not just in the signature — mine.**
`createCompactTerminalLayout(configuration, terminal)` emits
`class="wk-region wk-region-terminal"` and `data-region="terminal"`. This Eye mounts a
**preview** there and no terminal at all before launch, so CSS, tests and any future reader
key on a word that contradicts the ruling.

**The taxonomy ruling makes this doubly wrong rather than cosmetic.** The region is a
**Surface**; a Surface *may* host a terminal Tile, and this one never does. So the DOM
names the one occupant it cannot have. Rename the region, or record in the kit that its
occupant need not be a terminal Tile. Load-bearing in vocabulary — which in this house is
the product.

**3. `createCard` carries only `selected`; the contract promises selected/active/warning/
stale — shared, and mine does not dissolve the way theirs did.** Eye 1 and Eye 3 both
found this and both resolved it by wrapping their container in a `createPane`, on the
reasoning that staleness is a property of a fetched *list*, not of one card. That is right
for a list, and I am not re-filing their finding.

Mine is a different case and needs saying plainly: a **refused seat** is a property of the
individual card, not of the collection around it. One seat in a roster of five can be the
one that will not launch, and wrapping the roster in a stale container Surface cannot
express that.

That distinction has since been tested rather than just asserted, and it held. **Per-item
`warning` now has four named consumers**, three of whom reached it by correcting their own
earlier position: `AgentSeatCard` (this Eye), New Team's refused and skipped seats (Eye 4),
League's failed membership write that must say *which* bubble (Eye 1), and Customize's
malformed catalog entry that must say *which* file (Eye 3). Eye 3 found its own instance
independently twenty minutes after conceding the reasoning, which is better evidence than
agreement would have been.

**`stale` stays unfiled, with zero consumers** — three Eyes resolved it into a `createPane`
wrap, correctly, because staleness *is* a property of a fetched list. The split between the
two is the whole finding: container state for the collection, card state for the item.

**4. No form, field, notice or validation-state primitive exists at all — shared with
Eye 4.** `WORKSPACE_KIT.md` promises, for NewTeamLayout, that "the kit provides form,
card, notice, validation-state and multi-stage composition primitives". Landed:
`setSurfaceState`, `createPane`, `createCard`, `createReservedPane`, `createChannelPane`,
`createExplorerRail`. No form primitive, no field, no notice, no validation state.

This destination is a form — that is the whole of it — and every field needs three states plus
a `stated_by` line plus a per-field refusal. Eye 4's stage 1 is a form too. Two named
consumers again. I do not fork a primitive and I do not build a local substitute; I name
the gap and consume whatever the foundation owner lands.

**What is fine as landed and needs nothing from me:** `createPane` with all six
`WORKSPACE_STATES`, and the 680px breakpoint that stacks every named layout to a flex
column. My responsive story is stacking, and it is already there.

### Resolved by the freeze at `18d9b35`

The Workspace Kit was frozen on 2026-08-23. I re-read it rather than assume, and **six of
the seven findings below are closed by that commit** — recorded here rather than deleted,
because the findings are how the fixes are checked:

- the primitives are renamed to the ruled taxonomy — `createSurface`,
  `createChannelSurface`, `createReservedSurface`, `CHANNEL_SERVICES`
- **`createNotice`, `createField` and `createForm` now exist** — finding 4 closed, and it
  was the one that blocked the whole field layer
- **`createCard` carries per-item `active`, `warning` and `stale`** — finding 3 closed, the
  refused-seat state four Eyes asked for
- **my layout is `createAgentConfigurationLayout(configuration, preview)`** — finding 2
  closed; the region is named `preview`, so the DOM no longer names an occupant this
  destination cannot have
- all four stale documented locations are gone from `FIVE_EYES.md` and `WORKSPACE_KIT.md`

**One survives, and it is finding 1.** `public/style.css:6473` still lumps
`.wk-agent-configuration-layout` with `.wk-explorer-layout` and `.wk-new-team-layout` at
`minmax(12rem, 2fr) minmax(0, 5fr)` — a nav-rail ratio, applied to a first Surface that is
an eleven-field editor and not a rail. Eye 4 reports it *inverted* for theirs. Still the
foundation owner's, and still not decided by me.

**All four findings re-verified after the export reshape.** Between drafts the primitives
went from bare named exports to frozen namespaces and `workspace-kit.js` appeared — a
breaking import change on a floor five Eyes were standing on. I re-read the four rather
than assume: the shared CSS rule at `style.css:6470` is unchanged, the region is still
emitted as `compact-terminal-layout`'s `terminal`, `WorkspacePrimitives` still exposes
`createCard` without per-item states, and it still exposes no form, field, notice or
validation primitive. A namespace wrapper moved the door, not the room.

## Legs

| # | Leg | Blocked on |
|---|---|---|
| 1 | Freeze the seat shape, its unset representation and the field set with Eye 4 | **done** — agreed 2026-08-23, four corrections folded in |
| 2 | Resolved summary + the `stated_by` requirement | Leg 1; the joint ask being granted |
| 3 | Absence-preserving editors for the twelve editable fields, `mcp` tri-state included | Leg 1 |
| 4 | Preview: composed brief + dry-run resolution | Eye 4's `POST /api/launch/preflight` |
| 5 | Validation surfacing, seat-local vs batch | Legs 2–4 |
| 6 | Apply / revert / per-field clear against Eye 4's draft | Leg 1 |
| 7 | Standard states, responsive and keyboard behavior | Gate A freezing; see below |

Legs 1–3 can proceed against fixture drafts. Leg 4 cannot land without a dry-run owner,
and this Eye will say so rather than building a local substitute.

Leg 7's floor arrived while this document was being written: `createPane`, `createCard`,
the six standard states and `createCompactTerminalLayout(configuration, terminal)` are all
present in the working tree, uncommitted. That is a moving floor rather than a frozen
gate, and one name in it needs settling — see discrepancy 5 — but Eye 5 composes those
primitives and builds none of its own.

## Constraints

- R35 precedence, exactly as ruled. `role_family` never appears as a precedence row.
- One launch schema. Eye 4 owns it; this Eye edits and returns it.
- One cascade, in one language, in `src/launch-profile.ts` and `src/spawn.ts`.
- Only fields `POST /api/launch` already accepts are editable. Adding a launch field is a
  schema change and is not this Eye's to make.
- Absence round-trips. No default is written because a control was drawn.
- No terminal transport before launch. No preview may depend on a service — bare cowork is
  the free product, not a degraded mode.
- No chat, no composer, no session-management chrome.
- **Consume `WorkspaceKit` alone** and reach into `workspace-primitives.js`,
  `workspace-layouts.js` or `workspace-adapters.js` directly for nothing. The bare named
  exports those modules shipped an hour ago are gone — they are frozen namespaces now, and
  `public/js/workspace-kit.js` calls itself "the one reachable Gate A hand-off". All five
  Eyes have adopted this; it is what makes the next reshape survivable.
- **The files this Eye will create**, named rather than left to a successor to invent. I had
  written "namespaced beneath this feature's root" and never said what the root is — 966
  lines of behaviour and not one filename, which no checker would ever have caught, because
  a gate only reads claims you make. Eye 2 found the same hole in their own doc and I
  checked mine because of it.

  The house convention, verified rather than assumed: `public/js` is **flat** — 64 modules,
  no subdirectories — and the Kit's own new modules take a shared prefix
  (`workspace-kit.js`, `workspace-layouts.js`). Mine follow that shape, one per leg:

  - `agent-config.js` [planned] — the destination: view registration, the two Surfaces,
    lifecycle, and the seat handed in and out
  - `agent-config-fields.js` [planned] — the absence-preserving editors for the eleven
    launch-time fields, the `mcp` tri-state, and per-field clear
  - `agent-config-resolved.js` [planned] — the read-only resolved rows and their
    `stated_by` attribution
  - `agent-config-preview.js` [planned] — the composed brief and the dry-run resolution,
    consuming Eye 4's preflight

  **These four names passed a gate; nothing made them agreed.** Eye 1's distinction, and it
  lands squarely here: `[planned]` is the sanctioned way to name a thing before it is
  **built** — it is not a way to name a thing before it is **agreed**. I derived these from
  the house convention, not from any ruling, so a successor should read the list as *what
  this plan intends to create*, never as *where the Kit has agreed this goes*.

  **The markers are verified load-bearing, by making the gate fail on purpose** rather than
  by reading my own table and believing it: stripping all four produced exactly four
  failures naming these four files, and restoring them returned my file to clean. The
  marker is per-line and silent when it lands on the wrong one, so reading is not enough.

  **The JS layout question was live for about an hour and is now closed.** These names
  assume the flat `public/js` convention — 64 modules, no subdirectories, Kit modules
  sharing a prefix. For a while Eye 1's inventory planned subdirectories instead, which
  would have been two Eyes answering an unasked structural question in opposite directions.
  Eye 1 has since checked it and moved to flat prefixed modules, so **all three Eyes that
  name files now agree**: flat, prefixed, one per leg. Recorded because I had filed it as a
  live divergence and it would be a false claim about a peer's plan to leave that standing.

  The CSS seam below is the one that is still open.

- **Feature CSS: a seam, not a decision.** `WORKSPACE_KIT.md:398` says feature CSS is
  namespaced beneath the feature root and warns against "five edits to a global
  stylesheet". This repo has exactly **one** stylesheet, `public/style.css`, and no public
  css directory — I checked both, and that directory is named here as prose because it does
  not exist. So either the warning implies a per-feature directory nothing has created, or
  feature CSS lives in namespaced blocks in the one sheet and "namespaced, not scattered" is
  what it means. Eye 2 raised this and Eye 4's planned league stylesheet under a public css
  directory would answer it in the other direction; I would be the third Eye
  to answer an unasked question, and the first stylesheet written silently decides it for
  everyone. **I have deliberately written no CSS path.** Foundation owner's to rule.

- No edits to shared shell files.
- No view reaches into another view's DOM.
- Follow `docs/ui.md` and KOTOBA vocabulary. On a user's face: *Team*, *team role*,
  *role*, *Control*, *macros* — never the house names. Nothing this destination shows a user
  is called a *pane* or a *panel* — see **§ Vocabulary** at the top, which is the ruling
  and the authority.

  That closes the shared-floor question. **It also puts the landed kit primitives in
  conflict with a standing ruling:** `createPane`, `createChannelPane` and
  `createReservedPane` name Surfaces, and `SessionPane` names a Tile composition. This Eye
  coins nothing and consumes those APIs under whatever name they end up with — but the
  rename is now a ruling to apply, not a question to settle, and it is cheapest before five
  views take the API.
- Repository verification is `bin/ronin-byoin` only, after implementation — and for this
  Eye that is **both repo tiers**, `--gates` and `--ui`. Nothing hand-rolled around either.

## Verification

Per `docs/test-protocols.md`: **one command, one verdict, nothing hand-rolled — and that
one command has three modes, of which this Eye owes two.** Those are not in tension: the
contract page's own H1 says "one command, one verdict, nothing else to run", and it was
written by `3f2499c`, the very commit that added the modes. One *command* rather than a
hand-rolled sequence; one *verdict* rather than scattered outputs; three modes **of** it.

I originally wrote this section as "one command, one verdict" and nothing else, having
never opened the contract page — I took it from the summaries. That was my error, not
theirs. The tiers are committed and clean in the tree.

- **`bin/ronin-byoin --gates`** — fast repo checks, the ordinary developer/pre-push/PR
  mode. Run before landing on `dev`; the pre-push hook runs it again mechanically and CI
  runs it on every PR to `master`.
- **`bin/ronin-byoin --ui`** — every repo check including browser UI. The page says to run
  it "when a change can affect rendered UI, browser journeys, layout, or visual
  composition". **This Eye is four for four**: it is a new view, with a form, a preview
  Surface and responsive stacking. So `--ui` is owed as the additional rendered proof before
  landing, not optional.
- Full `bin/ronin-byoin` is the installed-box tier and adds the machine readouts. It is
  not this Eye's to claim as the repo verdict.

**A SKIP is not a pass** in any mode, and is reported as unverified. Browser review of the
fixture and the product is design acceptance, not a test harness.

### The real hazard is the correct page, not the stale summaries

Eye 2 inverted this and they are right. The stale summaries are safe — follow them and you
over-run. **The risk is in the current, correct contract page**, which names `--gates` "the
ordinary developer/pre-push/PR mode". For five sessions building views, the ordinary mode
is the one that does not look at the views. *Following the new page correctly* is what
skips browser UI.

Verified in the tree, all committed and clean:

- `.githooks/pre-push:37` runs `bin/ronin-byoin --gates`
- `.github/workflows/verify.yml:46` runs `bin/ronin-byoin --gates`

So neither pre-push nor CI covers browser UI for this Eye's slice. **The repo says so in
four places, and I understated this at first.** I wrote "two comments, and none of us read
either file". It is more than that:

- `.githooks/pre-push:25` — UI work "gets rendered proof once with `bin/ronin-byoin --ui`
  before landing" *(comment)*
- `.github/workflows/verify.yml:11` — UI-affecting work "must carry a separate local
  `bin/ronin-byoin --ui` verdict until tier 2 below exists" *(comment)*
- `bin/ronin-byoin:85` — **runtime output**, printed on every fast run:
  `"<check> — fast repo mode does not drive browser UI; run bin/ronin-byoin --ui"`. The
  command announces the trade and names the remedy at the moment of the skip.
- `ronin_session_boot/all/TEST_PROTOCOLS.md:7` — the birth page: "run BYOIN afterward and
  **read what it says. A SKIP is not a pass.**" Restated at length in
  `docs/test-protocols.md:45`.

That last one closes it. The compressed shelf page this rollout spent an hour accusing of
being stale, false, incomplete and a propagation hazard **already carried the mitigation
for the hazard**. Anyone who ran `--gates` and read their own verdict would have seen two
SKIP lines, been handed the exact command, and been governed by a rule they were given at
birth. Four accusations, four withdrawals. Nothing is broken and nobody left a gap.

**One thing I found and have since had to weaken.** At HEAD the CI step is *titled* —
`verify.yml:45` — **"BYOIN — every check, then one verdict"**, while the line under it
runs `--gates`, which SKIPs `smoke-ui` and `visual-ui`. The label overstates what the run
did, on the surface a person reads first.

I posted that as operative, then downgraded it on the grounds that the run *prints* both
SKIPs with the remedy and that "a SKIP is not a pass" is handed to every session at birth.
**That downgrade over-corrected, and Eye 3 was right to push back.**

The mitigations all require reading the log. **The label is what decides whether anyone
opens it.** A green check labelled "every check" is precisely the thing that stops someone
looking further — so it does not sit inside the covered chain, it gates entry to it. Three
signals name the remedy; this one asserts there is nothing to remedy, and it is the one on
the surface with the widest audience, read by people who never open a file.

The fix is one string, and the contrast proves it: `.githooks/pre-push:36` echoes
*"running the repo gates (bin/ronin-byoin --gates)"* — **the hook is honest.** And
`verify.yml:45` is the only step name in the workflow. One string overclaims; everything
else in the chain is straight.

**My own error, and it is the same shape again:** I checked *"is there a mitigation?"* and
not *"does the mitigation get reached?"* — a boundary asserted without the falsifying
check, committed in the very act of writing up that pattern.

**And a seventh, which reframes the fix.** I confirmed the contradiction *exists* at HEAD
and stopped there. I never asked **how it got there** — the question that decides what to
do about it. Eye 3 asked it; I verified their answer:

- `git show 3f2499c -- .github/workflows/verify.yml` touches **only comment lines**
  (`-#`/`+#`). The `name:` and `run:` lines are untouched by that commit.
- `git show 3f2499c^:bin/ronin-byoin` shows the ui gates with **no mode test at all**:
  `if [ "$name" = "smoke-ui" ] || [ "$name" = "visual-ui" ]` ran `node` on the gate,
  reported `ok_` on success, and honest-skipped only on `rc=2` for no headless browser.

So the old `--gates` genuinely *attempted* every check. **"Every check, then one verdict"
was true of that configuration.** Nobody wrote a false step name — a true one went stale
two lines from an edit, in the very file that commit was editing. The most exact instance
of this pattern the rollout has produced.

That changes the fix, which is why it is not a nicety: "the label is wrong" invites editing
a string. What is true is that **the label describes a configuration that no longer
exists**, so the honest options are *restore the coverage the label claims* or *rename the
step to the tier it runs*. Different decisions, different owner. My framing pointed at the
cheaper and possibly wrong one, and the misframing was mine — I originated it.

One further precision, from the replaced comment: on a CI runner the browser checks were
**already** skipping before `3f2499c`, for want of a browser. So CI has never covered
browser UI; what changed is the *reason* for the skip. That strengthens "nothing is
broken" further still.

**Consequence for this Eye, and it is the operative one:** my slice renders, so a green
pre-push and a green CI prove nothing about it. `--ui` before landing is not belt-and-braces
here; it is the only tier that looks at my work at all.

Acceptance journeys for this Eye:

- **Round trip.** Open a seat, apply it unedited, and the draft is unchanged. Repeat for a
  seat that states nothing at all, and for one that states every field.
- **Tri-state `mcp`.** Inherit, explicit on, explicit off — three distinct drafts, and
  inherit survives an open-and-apply.
- **Per-field clear** returns one field to unset without touching its neighbours.
- **Blank seats.** No `session_role`; no team; `agent: none`. Each renders honestly and
  applies.
- **Provenance.** Every read-only row names its layer and its file. A shadowed
  session_role names the owner's file, not the shipped one.
- **Preview truth.** The composed brief matches what `buildBrief` would produce, in both
  modes. Manual shows the owner's text byte for byte.
- **Refusals.** Each seat-local refusal above appears at edit time, in the cascade's
  words, naming the file, without discarding typed work.
- **Revert** restores the last applied state and does not materialize defaults.
- **No terminal.** No socket, no listener, no observer, no Output is created by this
  destination before launch; repeated navigation multiplies nothing.
- **Boundaries.** No Channel service of any kind, Chat included; no session-management
  controls; no saved-launch write;
  no roster write.
- Standard loading / empty / stale / failed / unavailable states; keyboard focus order and
  visible selection; desktop, tablet and phone.

## Definition of done

- The field set, precedence and unset representation are agreed with Eye 4 in writing, and
  the seat round-trips against that draft.
- Every resolved value is visible, read-only, and traced to the layer and file that stated
  it.
- Absence round-trips, verifiably, including `mcp`.
- Preview is the composed brief plus a dry-run of the real resolver — no simulated
  terminal, no service dependency, no second cascade.
- Every seat-local refusal is surfaced at edit time; batch refusals are displayed and left
  to Eye 4.
- Apply/revert/clear affect Eye 4's draft and nothing else.
- The surface carries no chat, no session-management chrome, and no saved-launch path.
- **Both repo tiers clean** — `bin/ronin-byoin --gates` before landing on `dev`, and
  `bin/ronin-byoin --ui` as the rendered proof — with any SKIP in either reported as
  unverified. One clean tier is not the verdict.
- This document is deleted when the work lands.

## Coordination

**Sent to `@eye_new_team` (DELIVERED, 2026-08-23)** — the six contract terms above:
precedence; the editable field set and the refusal to add launch fields; absence and the
byte-identical round trip, `mcp` tri-state named; apply/revert scope; lead as post-birth
intent rather than a launch field; and the two things needed back — the seat shape with
its unset representation, and who owns the dry-run resolve. Disagreements fold into this
document before it is acted on.

**Not sent to `@view_mgr` — DENIED.** That session's dial is watch-only (👁); writing needs
the owner's hand. Nothing was retried and nothing was routed around. The discrepancy
report is preserved in full below so it is not lost.

## Discrepancies found — for `@view_mgr`, undelivered

Verified first: the served fixture at `http://100.101.235.17:8099/five-eyes.html` is
byte-identical (md5 `a00746a3165f3f4072170d7c53d0fc83`) to
`../ronin-lab/concepts/five-eyes.html` at reviewed commit `f9510ef`. Nothing has drifted
since review. Every item below is between the reviewed artifact or the build-outs and the
code that has since landed.

1. **Stale cascade, three places.** The fixture's Resolved-configuration Surface carries a
   `Role family` row and the notice *"System defaults < role family < session role < this
   explicit launch"*; `WORKSPACE_KIT.md` and `FIVE_EYES.md` repeat it, including in this
   Eye's own charter. R35 dismantled that layer: `src/launch-profile.ts` resolves one
   definition layer, and `/api/launch` and `/api/launch-profile` both refuse
   `role_family` / `family_role` / `session_task` by name with a 400. Ruled correction:
   `system < team roster context < session_role < explicit launch fields`.

2. **No truthful resolved summary exists.** `GET /api/launch-profile` resolves the
   session_role layer alone. Team context, the project_root fallback chain, provider/model
   resolution and every MCP refusal live in `resolveForm` and run only at creation. The
   dry-run gate needs an owner.

3. **Terminal preview has no terminal.** A proposed seat has no session. The fixture's
   `Condensed / Full` switch also predates `docs/tile.md`'s six-Output contract, of which
   five are service-fed — bare cowork has Locked only.

4. **Lead is not a launch fact, and null is fully valid.** The fixture shows
   `Team: product-launch · lead` as resolved configuration; `team_lead` is a hand-set
   `@ronin-lead` designation on a live session (`POST /api/sessions/:name/team_lead`).
   The owner has since ruled directly (2026-08-23, relayed by Eye 4) that a Team **never**
   requires a designated lead — empty or staffed. Nothing in this destination gates on it.

5. **Gate A moved during this drafting, and the slot names disagree with the ruling.**
   `public/js/workspace.js` supplies routes, history, title and per-tab `sessionStorage`
   state under `ronin.workspace.v1`; `workspace-primitives.js` now supplies `createPane`,
   `createCard` and the six standard states, and `workspace-layouts.js` supplies
   `createCompactTerminalLayout(configuration, terminal)`. All of this is **uncommitted
   working-tree work** as of this writing, so it is a moving floor, not a frozen gate.
   Two things to settle: the second slot is named `terminal`, but by the owner's ruling
   Eye 5 mounts a **preview** there and no terminal at all before launch — either the
   slot is renamed or the kit records that its occupant is not required to be a terminal.
   Separately, no `tmuxgrid.*` migration is present and the default view is still
   `sessions`, not League.

6. **Minor, cross-cutting.** Saved launches still require and store `role_family`
   (`src/catalog.ts:326`, `src/routes/catalogs.ts:355`) while both launch routes refuse
   it.

## Open decisions — triaged honestly

Eye 3 made the point that a tidy "only two things need the owner" summary is exactly the
kind of thing that gets adopted and then quietly becomes the list. That applies to my own
section, so it is split by **who can actually settle each item** rather than presented as
one count.

### Needs the owner — one, and only one is genuinely mine

One shared-floor item remains: **`stated_by`**. The other — `pane`-versus-primitives — was
**RULED by the owner on 2026-08-23** and is no longer an open question; what is left of it
is applying the taxonomy to the kit's primitive names, which is work, not a decision.

### Mine to design, not to ask about

Listed so they are not mistaken for asks and inflate the tally:

- **The `mcp` tri-state's affordance** — how *inherit* is drawn so it does not read as a
  third setting. The owner already ruled the substance (absence round-trips); the drawing
  is my work.

### Settleable with another Eye, not yet raised

- **A seat whose `session_role` is edited in Customize (Eye 3) after the seat was
  drafted** — does the draft re-resolve, or hold what it saw? Raised on the board.
  **The house has already answered this for the running-session case and I am taking the
  precedent:** `src/session-boot.ts:243-246` resolves a role change's reading *"at the
  moment of the change rather than remembered from the launch"*, and states the reason —
  the owner may have put a book on that role's shelf since. A draft that held a stale
  resolution would be the same mistake one layer up. **So: re-resolve**, and a seat shows
  its resolution as of now rather than as of when it was drafted. To confirm with Eye 4,
  whose draft it is, but this is precedent rather than my invention.

### Not decisions — amendments this Eye cannot make itself

- The **four documented locations** that still promise a clean terminal composition for
  Agent Configuration (listed under the terminal-host section). I do not edit another
  Eye's build-out or my own charter.
- **WITHDRAWN — I filed two locations here and neither is a defect.** Recorded rather
  than silently deleted, because the reasoning is the useful part.

  I filed `FIVE_EYES.md:386` and `WORKSPACE_KIT.md:393` as stale, arguing they were
  *stronger* than the boot page's compression because they say **only** — "run only
  `bin/ronin-byoin` … report its single verdict" and "Repository verification is only
  `bin/ronin-byoin`". I read "only" as foreclosing the second tier.

  It does not. Both sentences finish with the clause I did not weigh: *"Do not invent
  per-session shell test sequences"* and *"no hand-rolled test sequence"*. The **only**
  contrasts with hand-rolled scripts, not with running two modes of the one command. Read
  whole, both lines state live doctrine exactly.

  Eye 4 then settled it at the root, and I verified: `git log -- docs/test-protocols.md`
  returns two commits, the most recent being `3f2499c` — **the tiers commit itself** — and
  the H1 at HEAD reads *"one command, one verdict, nothing else to run"*. The author who
  added `--gates` and `--ui` titled that page "one command, one verdict". So the phrase
  was not left behind by the sweep; **it was written by it**. It means one *command*
  rather than a hand-rolled `scripts/check-*` sequence, and one *verdict* rather than
  scattered outputs. The three tiers are three modes **of** the one command.

  So there is no stale-summary sweep here, and the boot page and `CLAUDE.md` are not
  stale either — they state current doctrine and omit only that the command has modes,
  which is what the page they both point at is for.

  **What survives is about me, not about those documents:** I owe `--ui` because my slice
  renders, and I did not know that until I read the contract page instead of its
  summaries. That is a fact about my reading, and the ladder's first implementation leg
  now carries it.

### RULED — nothing left for the owner here

**May a seat state `agent: none` explicitly?** **No — out of v1** (owner, 2026-08-23),
because it is not a launch field. **A plain terminal uses the existing `OpenShell`
`session_role` path**: the seat picks `OpenShell`, and the cascade resolves `agent: none`
from that definition exactly as it does today.

So this destination offers no agent control at all, and Eye 4's draft needs no `agent`
field. The answer I had planned — "only inherit" — was right, and the owner's route is
better than the one I was hedging toward: there was already a way to get a plain terminal,
and it is a `session_role`, which is a field the launch does accept.

### Settled here, needing nothing

- **The dry-run resolve.** `POST /api/launch/preflight` is `resolveForm` without creating a
  session. Eye 4 claimed it, I accepted, Eye 1 declined it in writing — its charter
  excludes launch orchestration by name. Settled between the three of us, no ruling needed.
- **Precedence, the field set, unset representation, apply/revert scope and lead-as-draft-
  intent** — all agreed with Eye 4 and folded in.
