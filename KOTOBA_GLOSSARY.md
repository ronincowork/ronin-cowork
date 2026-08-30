# KOTOBA_GLOSSARY — the house words in plain English

> **Companion to `KOTOBA.md`, which is the source of truth.** KOTOBA holds every noun with
> its scope and its record. This file answers one narrower question: **what do we call this
> when a user is looking at it?**
>
> **The rule: if the UI already has an English word, that word wins. Nothing is coined
> here.** Where a word is missing or two collide, it goes to § OPEN for @kotoba to rule —
> never filled in on the spot.
>
> Two audiences, one file. An agent writing a tooltip, a doc or site copy looks here. So
> does anyone wondering whether a Japanese name is allowed to reach a user's face. (Mostly:
> no.)
>
> **Counted lists drift; this file no longer carries counts.** "The seven" session jobs
> here missed four; KOTOBA's own "the ten" heading missed one. Where a set lives in a
> catalog, the catalog is the count.

<!-- RENDERED_FOR:START -->
> This copy is the template. A session receives it rendered at birth for the owner's desk
> profile — each bold word below is a `glossary.*` key in the lexicon, and the word the
> owner actually sees replaces it (`src/session-boot.ts`, `docs/kokugo.md` § the glossary).
<!-- RENDERED_FOR:END -->

## Where the Japanese stops

From KOTOBA: **Ronin is the product name and goes everywhere.** Our internal system names —
**TEJUN · MICHI · TEGAMI · SHINGO · RIREKI · OBOERU · TOMODACHI · SOROBAN · KOSHI · KOE ·
DAIKUSAN · KOTOBA · AGERU · JUSHO · BYOIN · SETTEI · KYOKAI · SHIWAKE · KOKUGO** — **stay ours.** Useful shorthand between us; a translation tax
on anyone else.

**The list is KOTOBA's.** This file quotes it verbatim and may never carry a name KOTOBA
does not have — two divergent copies is how a closed set stops being closed, and
`check-kotoba` holds the two lists identical.

**Words a user or their agent works with are plain English.** Nothing a third party must
learn in order to use Ronin should cost them a second language first.

---

## § THE SPACE — what a person is looking at

| House term | Plain English | One line |
|---|---|---|
| Ronin | **Ronin**<!--g:glossary.ronin--> | The product. The one word anyone learns on purpose. |
| `coworkspace` | **the coworkspace**<!--g:glossary.coworkspace--> | The whole UI — every tile, panel, tab and button in it. Say *the coworkspace* for the lot, *a tile* for one cell, *the commons* for a tile with no session in it. |
| tile | **tile**<!--g:glossary.tile--> | One cell of the coworkspace, showing one session. The public word for the terminal you look at. |
| ~~pane~~ | **tile** | **Not a house word — tmux's, retired from ours** (owner, 2026-08-22). A pane exists only inside the tmux server (the thing `pipe-pane` attaches to); everything OURS that touches or shows one — browser and backend alike — is the **tile**. The word survives only where tmux's own object is literally the subject (the recorder pipes *a pane*). Our code that misnamed its own structures pane is being swept (OPEN_THREADS 4.33). |
| session | **session**<!--g:glossary.session--> | The runtime unit: one agent, one job, one name. Surfaces may call it an Agent. Keeps running when you close the tab. |
| agent | **agent**<!--g:glossary.agent--> | The CLI in a tile — `claude`, `codex`, `pi`, a shell script — and the surface word for its session. |
| campaign | **campaign**<!--g:glossary.campaign--> | The named body of work this Ronin configuration serves. One install is one campaign today. |
| `session_commons` | **session commons**<!--g:glossary.commons--> | The retired tile-level shared surface. Bare *commons* no longer means this. |
| `workbench` | **the workbench**<!--g:glossary.workbench--> | The page format with one discovery column and surrounding workspaces. Campaign, Cowork and Team limit what can be discovered; they do not name different formats. *Discovery workbench* is an explanatory alias. Not *the coworkspace*, which is the whole UI. |
| `workspace` | **workspace**<!--g:glossary.workspace--> | One slot of the cowork space — *workspace 1*, *workspace 2*. It holds one surface at a time; it is a place, not a surface. |
| `workspace_surface` | **surface**<!--g:glossary.surface--> | What a workspace holds: a terminal tile, the team commons, or the cowork commons (more coming). One per workspace, one head each. Each workspace keeps its own copy, tabs and scroll; opening the same type elsewhere never moves or changes the first. |
| `terminal_tile` | **terminal tile**<!--g:glossary.terminal_tile--> | A tile when it is the surface in a workspace — one session. Say *the tile* on the grid page; *the terminal tile* when you are contrasting it with a commons. Never "seat". |
| `team_commons` | **team commons**<!--g:glossary.team_commons--> | The team's shared surface — Chat, Wipeboard, Docs, Team Configuration behind one tab strip. Say *the team commons*. |
| `campaign_commons` | **the commons**<!--g:glossary.campaign_commons--> | The campaign's shared surface — Campaign, Project roots, Team roster and Templates. Bare *commons* means this; always say *team commons* for a team's surface. |
| `cowork_commons` | **cowork commons**<!--g:glossary.cowork_commons--> | The install's shared surface — Machine health, Account, Desk profile, Project roots, Help desk, Keypad behind one tab strip. Say *the cowork commons*. It replaces *the desk* when it lands. |
| `new_session` | **new session**<!--g:glossary.new_session--> | The launcher as a surface — put in a workspace by ＋ Add team member or か New; the session it starts lands in that workspace. |
| `selector_column` | **selector column**<!--g:glossary.selector_column--> | A column that picks what goes into a workspace — the roster is one. Say *the roster* for the one there is. |
| `admin_desk` | **the desk**<!--g:glossary.desk--> | What a tile shows when you ask it for the machine instead of a session — everything about this install and this app, behind ⚙. Say *the desk*, or just ⚙. Never "the install commons": a commons is about sessions; a desk is about the machine. |
| `commons_tab` | **tab**<!--g:glossary.tab--> | One section of the commons, reached from its tab strip. Say *the Roster tab*, *the Docs tab*. **Never "pane" or "panel"** — pane is tmux's word, and panel adds a second word for a tab. A row on the desk is not a tab. |
| `cowork_setup` | **cowork setup**<!--g:glossary.cowork_setup--> | The one-time surface that shapes a new coworkspace before it opens. In code and house documents always write `cowork_setup`; never bare *setup*, *setup page*, or *first run*. |
| locked 🔒 / unlocked 🔓 | **Locked / Unlocked**<!--g:glossary.locked--> | Locked: this view is attached to the live session. Unlocked: the session is still running, this view is not attached to it. |

## § THE TABS — the commons' rooms

| House term | Plain English | One line |
|---|---|---|
| `session_roster` | **the roster**<!--g:glossary.roster--> | The **⌂ Roster** tab: every session on the machine. The session list, full stop. **Never "the board."** |
| `session_launch` | **launch**<!--g:glossary.launch--> | The **＋ New** tab. Where a session is born. |
| `role_family` | **Family**<!--g:glossary.family--> | A shelf on the ＋ New board grouping session roles for viewing — Developer, Assistant, Extra — and a template when you build a team. Presentation only (R35): a family never rides a launch and is not a fact about any session. Its `default_lead_role` is pinned first as the suggested first launch for a new team. |
| `team_roster` | **Cowork record**<!--g:glossary.team_roster--> | The canonical team roster behind one user-facing Cowork: its role, objective and launch defaults. It never lists members — membership is read off live sessions. |
| `team_role` | **team role**<!--g:glossary.team_role--> | What a TEAM is — development, health & fitness, admin. It belongs to the team, never to a session: a session on two teams wears each contextually. Changeable, and a change reaches members lazily on their next letter reread. |
| `team_lead` (`@ronin-lead`) | **team lead · 人**<!--g:glossary.team_lead--> | The one designation: this session leads that team. Set by hand — the secretary can be team lead — never inferred from what a session is doing. A team may have none, one, or several. |
| `wipeboard` | **wipeboard**<!--g:glossary.wipeboard--> | The **▤ Wipeboard** tab and the file behind it. Our own coinage and it stays — *wipe* is right for a surface many hands write on and erase. Every **Team** has its own wipeboard automatically — say **team wipeboard**; membership is the team's and is never managed separately. A **custom wipeboard** is the owner-made secondary kind. Alias **whiteboard** only, because voice-to-text hears it that way. **Never "the board."** |
| Brief | **Brief**<!--g:glossary.brief--> | Your statement of what a wipeboard is for. Agents never edit it. |
| `MDEDIT` | **the Docs tab**<!--g:glossary.docs--> | The **▧ Docs** tab: the documents each session is working on, opened and edited in the tile. **MDEDIT is ours and never reaches a user's face**; on screen it is just *Docs*. Say *list a doc*, never *track* or *attach*. There is no file browser by design — ask the session to show you a file (`+show_file`). |
| SETTEI (設定) | **Configuration**<!--g:glossary.configuration--> *(the tab)* · **your settings** *(the things in it)* | What you have set about how your Ronin behaves. **SETTEI never reaches a user's face**; the tab says **⚙ Configuration** (owner, 2026-08-18 — "Setup" read as the act, and the room is a standing statement). |
| — | **Hotwords**<!--g:glossary.hotwords--> | The words dictation keeps mishearing, sent with your voice. The **tab** is coworkspace like every UI surface; `src/services/koe/hotwords.ts` and the stock list belong to **KOE**. |
| KOSHI | ⚠ **see § OPEN 1a** | Ronin's own agents, doing the house's internal jobs. **Reaches a user's face today** — the `目 Koshi` tab, `↻ Restart Koshi`, and body copy calling it *"your AI admin"*. |
| `project_root` | **project root**<!--g:glossary.project_root--> | A folder on the machine Ronin is allowed to work in. |
| `inclusion_list` | **the project root list**<!--g:glossary.project_root_list--> | Which folders those are. Ships empty. |
| `user_customization` | **your own macros and jobs**<!--g:glossary.customization--> | The recipes you write to extend what Ronin can do. Distinct from settings: **you set a setting, you write a recipe.** |
| ▦ keypad | **Pad**<!--g:glossary.pad--> | Physical keys wired to macros. Optional hardware. |

## § THE CONTROLS ON A SESSION

| House term | Plain English | One line |
|---|---|---|
| dial (`@ronin-control`) | **Control**<!--g:glossary.control--> | Per session: you-only 👤, read 👁, read-and-write 🤖. Only the owner flips it. |
| team (`@ronin-tags`) | **Cowork**<!--g:glossary.team--> | The user-facing word for a set of sessions working together. Internally this remains a Team backed by a `team_roster`; Cowork adds no second object. |
| note (`@ronin_note`) | **Note**<!--g:glossary.note--> | The owner's one line about a session. |
| `session_role` (in the letter) | **what it's doing**<!--g:glossary.doing--> | The role's icon, drawn beside every session in the roster and the tile picker. Set at launch; the session changes it itself as its work changes, and so can you. A session with no session_role shows no icon. |
| — | **Status · Ladder · Macros · Detach · Kill session**<!--g:glossary.session_menu--> | The rest of the per-session menu. Already plain. |

## § PROGRESS AND HISTORY

| House term | Plain English | One line |
|---|---|---|
| MICHI (道) | **ladder**<!--g:glossary.ladder--> | Ruled in KOTOBA: never say MICHI to a user. The UI says Ladder. |
| ladder | **ladder**<!--g:glossary.ladder--> | What a session has done, is doing, and knows is next. |
| rung · leg · phase · gate | **rung · leg · phase · gate**<!--g:glossary.rung--> | One line on the ladder; a unit of work; a group of them; a stop waiting on someone. **Leg stays** — no rename to *step*, which is `tejun-step` (position in a macro run). |
| undetermined | — | Not rendered at all. The ladder never guesses ahead. |
| SHINGO (信号) | *(no user word)* | The ladder shown on a tile header. A user sees the ladder, not a name. |
| TEGAMI (手紙) | ⚠ **none — see § OPEN 1** | The one file a session keeps about its own work. Still reaching a user's face. |
| RIREKI (履歴) | ⚠ **two words on screen — see § OPEN 6** | Everything a pane printed, written to disk as it happens. The tape view says *the recording*; the Services card says *Readable transcripts*. One must win. |
| OBOERU (覚える) | **memory**<!--g:glossary.memory--> | Notes that outlive the session that wrote them. |
| TOMODACHI (友達) | **Stats**<!--g:glossary.stats--> | What your sessions have been doing — counts, not content. **Ruled 2026-08-22:** every surface says *Stats*; the internal spelling is `cowork_stats`; the card's "Usage statistics" is renamed. TOMODACHI never reaches a user's face. |

## § HOW WORK IS ASKED FOR

| House term | Plain English | One line |
|---|---|---|
| TEJUN (手順) | **macros**<!--g:glossary.macros--> | The UI says Macros. A user never needs the word TEJUN. |
| macro | **macro**<!--g:glossary.macro--> | A saved instruction you would otherwise have typed to your agent. |
| invocation | **typing a macro**<!--g:glossary.invocation--> | `+name: what you want`. That is the whole syntax. |
| `session_role` | **role**<!--g:glossary.role--> | What a session is doing now. The values read plainly on their own (RiffOnIt, CutCode, CheckWork, …). The set lives in `ronin_catalogs/session_roles/` — one file per role, and the directory is the count. |
| `desk_profile` | **desk profile**<!--g:glossary.desk_profile--> | Your standing defaults for the surfaces you work at — the skin, the words, the kind of campaign the board opens on, how the Team page is arranged. Not a skin; it has one. |
| `behaviour` | **behaviour**<!--g:glossary.behaviour--> | Anything you can hand a session to change what it does — an SOP, a doc, a tool, a macro, a memory. Inert on the shelf; handed over, it makes the session right for the situation. |
| `session_build` | **build**<!--g:glossary.build--> | A preconfigured way to start a session — its way of working, the reading it arrives with, the model that suits it. Pick one, then finish its loadout with the behaviours this run needs. |
| `session_mandate` | **mandate**<!--g:glossary.mandate--> | How far a session may go before it checks in (discuss · plan · execute · run), whom it may recruit (none · propose · staff), and what it hands back (plan · ideas · code · artifact · team). Set by the owner on the first session of a project; a solo run is just `recruit: none`. |
| forkit | **fork**<!--g:glossary.fork--> | Split the current topic into a visible Ronin session. “Fork it” and “new session” mean this; “spawn an agent” means an internal sub-agent. |
| harakiri | **harakiri**<!--g:glossary.harakiri--> | A session ends itself. Kept — it is a word people know. |

## § THE DOOR OUT

| House term | Plain English | One line |
|---|---|---|
| AGERU (上げる) | *(no user word — the surfaces say what they do)* | The one door out: nothing leaves except through it and the model provider. **The door is live in cowork** — one allowlisted client, the egress record, the Services activation and stats sends. The review-outbox surface is still to come **[planned]**. The name stays ours. |
| `packet_kind` | **Usage counts · Feedback · Macro submission**<!--g:glossary.packet_kinds--> | The three things that can be sent. The JSON says `tomodachi` / `kansou` / `tejun`; **a user never sees those three words.** |
| `ageru_packet` | **what gets sent**<!--g:glossary.packet--> | Shown in full before anything leaves, and kept afterwards. Never *your data*, never *diagnostics*, never *telemetry* — it is a file, and the sentence should say so. |
| `egress_log` | **where Ronin has connected**<!--g:glossary.egress_log--> | Every outbound request Ronin ever made, model providers included. The honest answer to "does this thing phone home", which is a list, not a promise. |
| KOE (声) | *(the name stays ours)* | Voice, both directions. **Dictation in is live** — the mic on a tile goes through `/api/transcribe` with your Hotwords attached. Spoken summaries back are not built **[planned]**. What a user meets is the mic and the **Hotwords** tab. |

## § WHAT IS SOLD

Base Ronin is open source. The rented capabilities on top are **`ronin_service`**, alias
**Services** — owner-ruled 2026-08-10.

| House term | Plain English | One line |
|---|---|---|
| `ronin_service` | **Services**<!--g:glossary.services--> | A rented capability on top of base Ronin: a folder, plus optionally a long-running process that reads files base already writes. Base never imports one. |

**Never** *module* (the client is built of ES modules) · *plug-in* (OpenClaw's kojinsa-tools and
skinner) · *extension* (two live bind-mounted directories) · *applet* (RIREKI's recorder is
one). All four are taken elsewhere in this environment. *add-on* is free and is the fallback.

**What the Services card sells, in its own words** — by this file's rule those UI words win,
and each maps to a house name:

| On the card | House machinery |
|---|---|
| **Live status ladders** | MICHI + SHINGO + koshi |
| **Readable transcripts** | RIREKI — see § OPEN 6 for the word |
| **Stats** | TOMODACHI + SOROBAN (`cowork_stats` — ruled 2026-08-22, was "Usage statistics") |
| **Voice** | KOE |
| **gbrain** | gbrain — a proper name, the vendor's, credited on the card |

---

## § NOT TRANSLATED, DELIBERATELY

A user never meets these, so they never need an English word. Listed so nobody helpfully
translates one and creates a second vocabulary.

**Counting:** SOROBAN · tally · gauge · census · ledger · diff · derived · drop · install id
**The recording machinery:** r_tape · r_scroll · recorder · ring · settler · decoder · lens ·
faucet A / faucet B *(r_tape and r_scroll are RIREKI's two durable artifacts — there is no
r_render; the tile's paint is ephemeral)*
**Files and layout:** DAIKUSAN · system_scope · user_scope · session_scope · the upgrade
test · shadowing · the session directory · build-out doc · handoff · `landed/`
**Plumbing:** shim · control-check · viewer session · scrape · compile · step tracker ·
`session_macro` · `workspace_macro` · one-way flow
**Ours only:** KOTOBA · KOSHI · SHINGO · BUNKAI · KYOKAI · KOKUGO · `ronin_repo` · dohyo

---

## § RULED — standing rulings, one line each

- **tile beats pane everywhere a person reads** (2026-08-10, strengthened 2026-08-13):
  *pane* is legal only where tmux's own mechanism is the subject of the sentence.
- **`coworkspace` is the whole UI** (2026-08-13) — every surface, tile, panel and button.
  A coworkspace holds tiles; a tile with no session holds the commons.
- **KOSHI is the umbrella for Ronin's own agents** (2026-08-13) — internal by definition:
  the owner never sets one up, which is what separates a koshi from an `agent`.
- **KOE is the noun for the whole voice surface** (2026-08-13); `koshi_koe` is the worker.
- **AGERU is the one door out, and it ships in cowork, not services** (2026-08-13) — the
  free user is the one whose feedback we most want.
- **A submitted macro is open source, and that is the whole deal** (2026-08-13) — an
  irrevocable MIT grant, no exclusivity, no payment; the sentence renders beside the tick.
- **Identity is never shared across `packet_kind`s** (2026-08-13) — install id, reply
  contact and attribution handle: three fields, three lifetimes, no join.
- **`UCHI` is retired; the word is `commons`** (2026-08-13).
- **legs stay** (2026-08-10) — no rename to *step*; *step* is `tejun-step`.
- **harakiri stays** (2026-08-10) — a word people already know.
- **The teams cut** (2026-08-23, R35) — the team is the organizing concept. `session_task`
  becomes `session_role`; the immutable `family_role` axis is DISMANTLED (identity lives
  on the team's roster as its `team_role`, worn contextually, never on a session);
  `role_family` survives as the New Session shelf, presentation only; `session_team` is a
  retired spelling; the 人 (`@ronin-lead`) is UN-RETIRED as the hand-set `team_lead`
  designation — the secretary can be team lead. Membership has little to absolutely no
  rules: anyone may move a session between teams.
- **`job_role` and `task_family` become one word, `family_role`** (2026-08-22) — they
  were two names for one thing: a session's type IS the family of tasks it may perform.
  A session is a `family_role` + a `session_task`. KOTOBA R34.
- **`session_job` is split into `family_role` and `session_task`** (2026-08-22) — the
  2026-08-10 ruling that made one term do both jobs is reversed. A single common word is
  still not a term, which is why neither new one is bare *role* or *task*.
- **`ronin_service`, alias Services, is the paid unit** (2026-08-10) — never module,
  plug-in, extension or applet.
- **There is no bare "board"** (2026-08-10) — the roster and the wipeboard, and neither
  may be aliased to *board*.
- **`job_class` is promoted to `family_role`, inside and out** (2026-08-22) — the shelf
  that addressed nothing now carries reading and launch defaults, so it earns a real
  name on both faces.
- **`QuarterBack` is a task, not a role** (2026-08-22) — `developer` is the role;
  quarterbacking is something a Developer does for a while and stops doing. So who
  coordinates a team can change during the day, and every surface reads it fresh. The
  token keeps its verb+object exception, beside `OddJob`.
- **`group` is retired as a house term; the words are Team and Family** (2026-08-22) —
  *group* goes back to ordinary English and means nothing in particular. A **Team**
  (`session_team`) is a set of collaborating sessions; a **Family** (`session_tasks`) is the
  set of tasks under a job role. Both many-to-many, and the axes do not overlap. Spelled
  compound internally because a bare `family` already collides with settei's write family
  and Node's address family. **The `session_team` sweep landed 2026-08-22** (the
  WIPEBOARD_TEAMS build-out): `tejun-team`, `+team:`, a saved-launch `team:` field, and
  one wipeboard per team. The `@ronin-tags` spelling, the `tags` code/API fields and
  TOMODACHI's `tag_groups` key stay as internal seams, mapped in KOTOBA R32; the retired
  spellings are read on input, never taught.
- **pane is retired from house vocabulary entirely** (2026-08-22) — tmux's word for
  tmux's own object, nothing more; our representations, browser and backend, are the
  tile. Code sweep: OPEN_THREADS 4.33.
- **RIREKI's durable artifacts spell with its initial: `r_tape` and `r_scroll`**
  (2026-08-22) — and there is no r_render; the tile's paint is ephemeral.
- **TOMODACHI's surface unifies on `cowork_stats`, alias "Stats"** (2026-08-22) — every
  surface says Stats; "Usage statistics" is renamed.

## § OPEN — @kotoba rules, nothing coined here

1. **TEGAMI has no English word.** `public/js/tiledrop.js` labels a menu row `TEGAMI`, and
   `public/js/tile.js`'s tooltip reads *"Read this session's TEGAMI."* The obvious word —
   *Note* — is taken by `@ronin_note`. Two different things, one candidate.

1a. **KOSHI's English word may already exist, on screen, unnoticed: "your AI admin"**
   (`commons.js`). This file's own rule is *the UI's word wins*, and that is a UI word,
   written by us, in front of a user today. Recommend ruling **AI admin** in rather than
   inventing anything. Nothing coined, only noticed.

2. **CLOSED — the category has a user word now: *task*.** (2026-08-22.) The open item
   was that `session_job`'s values read fine but the category had no word, so the launcher
   had to describe it. Splitting the axis supplied both: a session has a **role** and a
   **task**, and the board says so.

3a. **CLOSED — the `session_team` sweep landed with the owner's go.** (2026-08-22, the
   WIPEBOARD_TEAMS build-out.) The tool is `tejun-team` (the old name forwards), the
   invocation is `+team:` (old spellings read, never taught), the saved-launch field is
   `team:` (`group:` still read), and every user-facing surface says Team. What stays is
   deliberate and mapped: `@ronin-tags` itself (live sessions carry it), the `tags`
   code/API fields, and TOMODACHI's `tag_groups` wire key — internal seams, same pattern
   as `cowork_stats` under Stats. KOTOBA R32 records both halves.

3. **Run this list against real co-working vocabulary** (owner). Where a real co-working
   word exists for a thing we have, take it — **but only where the mechanism matches.**
   *Notice board* matches a wipeboard; *the room* does not — it implies everyone hears
   everything, which is exactly what we do not do.

4. **Retired words have nowhere to live, and a planned checker expects a list.**
   KOTOBA's housekeeping rule says retired words are deleted, not annotated (git holds the
   history) — but a checker that catches a retired word needs a list of them. Either the
   rule gains an exception for a machine-read list, or `check-kotoba` reads git. Changes a
   housekeeping rule; not decidable here.

5. **`<service>_connected/` needs a home** (owner raised, 2026-08-20). The boot shelf's
   connected level is signed by the service that seeds it (`gbrain_connected/`), and the
   launcher's toggle already reads **gbrain on/off** — the name educates because it says
   WHAT is connected. To rule: does the *pattern* get a glossary row, and does the
   SETTEI-scope service switch need a distinct on-screen word from the per-session toggle?

6. **RIREKI has two user words on screen** (found 2026-08-22). The tape view's *the
   recording* vs the Services card's *Readable transcripts*. This file's rule cannot pick
   between two UI words — @kotoba rules it. Until ruled, each surface keeps its own word
   and neither spreads. *(TOMODACHI's half of this item was ruled the same day:
   `cowork_stats`, alias Stats — see § RULED.)*
