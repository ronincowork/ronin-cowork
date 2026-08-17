# KOTOBA (言葉) — every noun in the house, in one place

> **The source of truth for Ronin vocabulary.** If a term is used in code, a catalog, a
> doc or a session and it is not in this file, either add it here deliberately or stop
> using it. One line per term; the file-of-record has the detail.
>
> **There is one KOTOBA, and this is it.** Its authority spans the whole ronin_machine:
> cowork, services, and the development environment around them. Repository ownership
> belongs in a row's scope and record; it never creates another vocabulary file.
>
> **Why a vocabulary file is load-bearing.** Ronin guides agents with words, not with
> enforcement — **environment over enforcement**, at full strength. We do not trap an
> agent into working our way or penalize it for not; we describe the way clearly enough
> that following it is the obvious move. That makes the words *the product*. A term with
> two meanings is not untidy, it is a defect in the thing we ship.
>
> **Which voice a line takes.** A statement about what *Ronin* does can be flat and
> absolute — it describes the machine. A statement about what an *agent* should do is a
> suggestion, never a wall. Small weights placed so the natural path is the good one; an
> agent that goes another way is not doing anything wrong. **This rule is for us. It never
> appears in anything an agent reads** — you give them the sausage, not the recipe.
>
> **The honest limit.** An agent that never touches Ronin's UI — someone who SSHes in and
> runs a terminal by hand — gets none of the readouts: no ladder, no wipeboard. It
> still inherits the way of working, because the way of working is written down rather
> than wired in. Losing the instruments is the cost of going around the cockpit; the
> philosophy travels anyway. That asymmetry is deliberate, and it is why these definitions
> matter more than any check we could code.
>
> **[planned]** — the word is settled, the code is not. **Check it before citing a term as
> existing structure**: a row without it describes something shipped; a row with it
> describes something designed, and nothing reads it yet.
> **⚠Rn** — an open review item; the ruling is in **§ OPEN** at the foot of the file.
> **[proposed]** — a term in use somewhere but not yet ruled into the house.


we strongly prefer compound words. the exception is our Japanese titles for utilities/services/sections and are umbrella terms that should not hit user reading faces.
terms are compound words or joined by "_"

## Scope — the column that decides what ships

Every row carries the scope of the thing it names. The scopes are defined in
`DAIKUSAN.md`; this is the short form.

| Scope | The thing it names lives… | Ships? |
|---|---|---|
| **system_scope** | in the Ronin install — replaced on upgrade | yes |
| **user_scope** | in Ronin's own directory, outliving any one session | the word ships, the thing never does |
| **session_scope** | in the session directory — dies with the session | the word ships, the thing never does |
| **dev_scope** | only because someone is building Ronin itself | **no** |

Compound so each is a unique, greppable token — `user_scope` never collides with the
ordinary word *user*.

`dev_scope` controls whether the thing named ships; it does not split the vocabulary.
KOTOBA itself ships whole so every part of the house reads the same definitions.

---

## How a term is spelled

**Compound words, or joined with `_`.** `project_root`, `ronin_machine`, `rung_status`,
`side_ladder`, `CutCode`. A single common word is not a term — it collides with ordinary
prose and cannot be grepped. That is what went wrong with *project*, *user*, *board*,
*gate* and *system*: each read as English until it was too late to tell them apart.

**American spelling, everywhere.** `customization`, `license`, `catalog`, `recognize`,
`sanitizer` — owner, 2026-08-13. Not a style preference: a term is a **grep target**, and a
word spelled two ways is two tokens. `user_customization` and `user_customisation` would be
two terms for one thing, found by two different searches, and the one you did not run is the
one the other agent used. This file had seven British spellings when the rule was made,
including `customisations` in the `project_root` row — the exact word the rule was being
written about.

## Japanese names, and where they stop

**Ronin is the product name and goes everywhere** — the site, the docs, the UI, the_owner's
own vocabulary. So does anything built on it: `ronin_machine`, `@ronin-control`. It is the
brand, and the brand is the one Japanese word everyone learns on purpose.

**Our internal system names stay ours.** Seventeen, and this is the list — `KOTOBA_GLOSSARY.md`
repeats it verbatim and may not carry an eighteenth this file does not have:

> **TEJUN · MICHI · TEGAMI · SHINGO · RIREKI · OBOERU · TOMODACHI · SOROBAN · KOSHI · KOE ·
> DAIKUSAN · KOTOBA · AGERU · JUSHO · BYOIN · SETTEI · KYOKAI**

Useful shorthand between us; a translation tax on anyone else.

**Japanese words that are not system names** are ruled where they are defined and are not on
that list: **BYOKI** (a condition, § THE GROUND), **BUNKAI** (a closed refactor, `dev_scope`),
**dohyo** and **ATARASHI** (proper names), **harakiri** (kept — a word people already know).

**Words the_owner or their agent works with are plain English.** A ladder is a ladder. Nothing
a third party must learn in order to use Ronin should cost them a second language first.

---

## § SURFACES — what a session actually touches

**`RONIN_COWORK` and `RONIN_SERVICES` are not surfaces.** They are the two systems a
surface ships in — `system_scope`, defined in § THE GROUND. The column below says which
one ships a surface; it does not make the repo a thing a session touches.

| Surface | Ships in | What a session does with it | Section |
|---|---|---|---|
| **TEJUN** (手順) | cowork | how work is done — macros, actions, tools. **Two kinds of macro: `session_macro` and `workspace_macro`** | § TEJUN |
| **coworkspace** | cowork | the whole UI — header, tiles, commons, the wipeboard, the dials, the keypad, every button on them | § COWORKSPACE |
| **DAIKUSAN** | cowork | where files live: the three scopes, and which one a thing belongs to | `DAIKUSAN.md` |
| **KOTOBA** | cowork | the words it is allowed to use | this file |
| **SETTEI** (設定) | cowork | the owner's configuration of Ronin — what they have **set** about how this install behaves | § SETTEI |
| **AGERU** (上げる) | cowork | the one door out — every packet that leaves, and the log that proves those are the only ones **[planned]** | § AGERU |
| **TOMODACHI** (友達) + **SOROBAN** (算盤) | services | how it gets counted, and the contract counting obeys | § TOMODACHI |
| **MICHI** (道) + **TEGAMI** (手紙) + **SHINGO** (信号) | services | where it is on the way, and the one file it keeps | § LADDER · § TEGAMI |
| **OBOERU** (覚える) | services | what it remembers across its own death | § OBOERU |
| **RIREKI** (履歴) | services | the record of every byte it emitted | § RIREKI |
| **KOE** (声) | services | voice to text and text to voice **[planned]** | § KOE |
| **KOSHI** | services | Ronin's own agents, doing the house's internal jobs | § KOSHI |

## § THE GROUND — the words underneath everything else

These are used constantly and were never defined, which is why arguments about placement
kept turning into arguments about wording. Nothing else in this file is safe until these
are agreed.

### Ronin — the product, and nothing else

The single largest source of confusion in the house: **Ronin** named the product, a running
copy and a source tree at once. It now names one thing.

| Term | Scope | Means | Record |
|---|---|---|---|
| **Ronin** | system_scope | **the product** — the software itself, what a third party installs. Use the bare word for nothing else | `README.md` |

### The chain — from what you edit to what is running

**`ronin_repo` → `ronin_artifact` → `ronin_install` → `ronin_operator`**

| Term | Scope | What it is | Record |
|---|---|---|---|
| **ronin_artifact** | system_scope | **[planned]** a released, versioned copy: tag → build → tarball, published as a **GitHub Release for cowork** and a **hosted archive for services** (a button cannot clone a private repo). Deferred by R22 until the split, which landed 2026-08-14. The package is **`ronin-cowork`** — never `tmux-ronin`, which named the frozen unified repo | `plans/ARTIFACT.md` · `plans/RAMP.md` |
| **ronin_install** | system_scope | one deployed copy on a ronin_machine — the code plus what `setup.sh` put in place: `node_modules/`, the units in `~/.config/systemd/user/`, the statusLine registration | `docs/repo-to-operator.md` |
| **ronin_operator** | system_scope | the processes actually serving the grid — memory copies taken at start. A restart replaces the operator and touches the install not at all | `docs/repo-to-operator.md` |
| **BYOKI** (病気) | system_scope | the operator differing from the repo. A condition to detect, never an event that announces itself | `docs/repo-to-operator.md` · § OPEN R22 |
| **BYOIN** (病院) | system_scope | **the whole health check** — every `byoin_check` over the repo plus every readout over the machine, behind one command (`bin/ronin-byoin`). BYOKI is the condition; BYOIN is where you go to have it looked for, and it looks for more than that one illness | `docs/byoin.md` |
| **byoin_check** | system_scope | **one repo-side test inside BYOIN**: reads the tree, fails the build, same answer on every machine, lives in `package.json`'s `verify` chain (parse, check-modules, check-docs, check-kotoba, check-kyokai, check-dead, check-stores, check-place, check-tomodachi, check-src, check-tests, stores-map, tsc, smoke-ui). **Never "gate"** — a gate is a ladder rung (§ LADDER) and nothing else; ruled R30. `libexec/ronin-gate` and the `--gates` flag keep their pre-ruling filenames | `docs/byoin.md` |

Two of those hops are skipped today. **The steps, and what to do to make a change real, are in
`docs/repo-to-operator.md`** — not here.

### Where work lives — three nouns, and no bare "project"

**There is no generic "project".** It meant a repo, a directory, a body of work and a
machine depending on who was speaking. Say which one you mean.

Three nouns, outermost first: a **ronin_machine** is everything one install can reach; it
holds many **project_roots**; each of those usually sits in a **project_repo**.

| Term | Scope | Means | Record |
|---|---|---|---|
| **ronin_machine** | system_scope | **the outer limit of what an install can reach** — every session, file and project_root available to it, and nothing beyond. A server, VM or container. Holds many project_roots, which is why it is not named after one | `DAIKUSAN.md` |
| **project_root** | system_scope | the *directory* a session is born into, plus the session_launch_spec it gets — an entry in the inclusion_list. **Memories are keyed by it**; customizations are not, they belong to the_owner. The term is `system_scope`; **the entries are `user_scope`** — they live in the catalogs store's `PROJECT_ROOTS.md`, and the shipped `ronin_catalogs/PROJECT_ROOTS.md` keeps only the stock launch table | `docs/project-roots.md` |
| **project_repo** | system_scope | the *git repo* a project_root sits in. Usually the same directory; a project_root need not be a repo at all | `docs/project-roots.md` |
| **inclusion_list** | system_scope | which directories on a ronin_machine are part of your Ronin — an inclusion_list, not a layout. Ships empty | `docs/project-roots.md` |
| **session_launch_spec** | system_scope | one runnable **provider · model** pairing resolved to the exact command that starts it — `{provider, model, cmd}`, one CELL of the shipped launch table. Adding a provider is a ROW and adding a model a COLUMN, **never a code path**: that property is the whole of vendor neutrality. A `project_root` names a default and the launch may override; an install whose table yields none cannot spawn a configured session. **Named 2026-08-15, replacing `brain`** — which claimed cognition for two labels and a command string, and blurred the three things § NUANCE keeps apart (the CLI vs the model vs this run of it) | `docs/model-providers.md` · `ronin_catalogs/PROJECT_ROOTS.md` |

### The two repos, and how a service plugs in

| Term | Scope | Means | Record |
|---|---|---|---|
| **RONIN_COWORK** | system_scope | the free, open install. **All frontend lives here** — a service ships no HTML, JS or CSS | `co-working/user_repo/wip/RONIN_SERVICES.md` |
| **RONIN_SERVICES** | system_scope | the paid layer. **Not a public repo** | `co-working/user_repo/wip/RONIN_SERVICES.md` |
| **Ronin The Works** | system_scope | the name for **cowork + services running together** — an edition, not a third repo and not a third install: services register into a cowork that is already there. Ruled 2026-08-14 to keep clear of `ronin_legacy`, whose word is *unified* and always will be. Two packages ship (`ronin-cowork`, `ronin-services`); "The Works" is what you call having both. A reading-face name, so plain English (§ Japanese names) — token form `ronin_the_works` if one is ever needed | `README.md` |
| **ronin_service** | system_scope | one service in that layer. Alias: **Services**, prose only — the term is `ronin_service` | `co-working/user_repo/wip/RONIN_SERVICES.md` |
| **socket** | system_scope | how a ronin_service plugs into cowork. Four of them; three are server-side, the fourth is a boolean | `co-working/user_repo/wip/RONIN_SERVICES.md` |
| **SWITCH** | system_scope | the fourth socket: **on or off**. On → cowork renders the subset of *its own* UI the service fills. Off → that subset does not render | `co-working/user_repo/wip/RONIN_SERVICES.md` |
| **KYOKAI** (境界) | system_scope | **the umbrella over the cowork/services boundary, drawn in place** — the seam inside the unified tree that makes the eventual split a file move rather than surgery: `src/services/<service>/`, the counting socket, the outlet leaf, and the gate that holds the line (`scripts/check-kyokai.mjs`). Not the split itself | `docs/kyokai.md` |

**Service-to-service is not a socket — it is a file.** `koshi_monitor` and KOE both read
RIREKI's tape off disk. A file is the connection.

### The people and the machinery

| Term | Scope | Means | Record |
|---|---|---|---|
| **the_owner** | system_scope | **the person whose install it is** — the only one who flips a dial, tags a session, edits a Brief, or writes a universal memory. **Agents propose; the_owner decides.** The one word for a person in this house: `user` is a scope and never a human (R16) | `docs/session-control-dials.md` |
| **owner_agent** | system_scope | an agent the_owner launched to do **their own work** — in a tile, on one of their project_roots. The ordinary case, and what every catalog, SOP and library page is written for | `ronin_catalogs/SESSION_JOBS.md` |
| **ronin_developer** | system_scope | **the person building Ronin itself** — the cowork and services repos, not the work Ronin is used for. A ROLE, not a person: the same human is usually both, often within the hour, and the hat that is on decides which rules apply (`dev_scope` docs and the byoin_checks are theirs; the catalogs are the_owner's) | `CLAUDE.md` |
| **developer_agent** | system_scope | an agent working on **Ronin's own code**, wearing the ronin_developer's hat. Reads `CLAUDE.md` and this file; obeys the byoin_checks; its output is a PR, never a change to a tenant's install | `CLAUDE.md` |
| **user** | system_scope | **A SCOPE, NEVER A PERSON** (R16, closed 2026-08-14) — `user_scope`, `ronin_user_root`, "the user's own catalogs" meaning *that scope's*. For a human, say **the_owner** | `DAIKUSAN.md` |
| **agent** | system_scope | the genus: the CLI running in a tile — claude, codex, a shell script. Ronin never reaches inside one; **vendor neutrality is the thesis**. Three roles wear it: **owner_agent** (their work), **developer_agent** (Ronin's own code), **koshi** (the house's internal jobs) | `reading-list/TEJUN.md` |
| **session** | system_scope | a tmux session: **the unit of work and the unit of addressing.** One agent, one job, one name. Mortal — nothing of value may live only in a tile | `docs/architecture.md` |
| **pane** | system_scope | the tmux terminal a tile shows. **Machinery only** — legal where tmux's own meaning is what is being described, and nowhere else. The word a person reads is **tile**, § COWORKSPACE | `docs/rireki.md` |
| **system** | system_scope | the installed Ronin — code and stock catalogs, i.e. the **ronin_install**. Not a loose adjective for "Ronin-ish"; the running copy is the **ronin_operator**, and the product in the abstract is **Ronin** | `DAIKUSAN.md` |

**tile and pane are one thing from two sides, and only one of them is the word.** A pane is
the tmux terminal the agent's process actually runs in; a tile is that pane rendered in the
coworkspace. **Say tile.** In docs, tooltips, site copy, a session's own prose, and anything
an agent writes — tile, always.

**`pane` survives in exactly one place: where tmux's own mechanism is the subject.** RIREKI
tapes *per pane* and faucet B is *exactly one per pane* — those sentences are about tmux and
would become false if reworded. That is the whole exemption. It is not a license to say
*pane* because it feels more technical; if a tile could be substituted without making the
sentence wrong, the sentence was supposed to say tile.

**The 1:many is real and unhandled** — a two-pane session has two tapes and one name. That
is a gap in the machinery, not a reason to reach for the word. See § NUANCE.


---

## § TEJUN (手順) — how work is done

| Term | Scope | Means | Record |
|---|---|---|---|
| **TEJUN** | system_scope | the procedure system: macro → action → tool | `reading-list/TEJUN.md` |
| **macro** | system_scope | a recipe the_owner invokes; nothing but an ordered list of actions. Stock: `forkit`, `buildout`, `cutcode`, `land`, `delete`, `tag`, `wipeboard`, `tell`, `read`, `readwrite`, `evaluate` | `ronin_catalogs/MACROS.md` |
| **session_macro** | system_scope | a macro **the agent executes**: an invocation dropped into a session's own input (`+forkit: build the login page`), which the agent reads and acts on. Ronin only helps you type it — it never runs one. Every catalogd macro today is one. **Two classes, and every entry's `class:` line says which: `session_macro.lookup` · `session_macro.workflow`** | `ronin_catalogs/MACROS.md` |
| **workspace_macro** | system_scope | a macro **Ronin executes**, mechanically, above any one session. No agent involved *in performing it* — the launcher is machinery, the session it births is an agent. Stock: `session_launch` (the ＋ tab), and Mika's spawn-or-inject | `docs/commons.md` |
| **mika_macro** | system_scope | a session_macro that is **re-addressed**: executed by an agent, but by MIKA's agent rather than the session it was typed into. `+project_root:` · `+system_help:` · `+new_session:` · `+system_config:`. Catalogued in their OWN file so no surface listing `MACROS.md` can show them. | § MIKA |
| **action** | system_scope | a procedure an AGENT follows; macros may cite only cataloged actions (TEJUN's law) | `ronin_catalogs/ACTIONS.md` |
| **tool** | system_scope | a script that implements a cataloged action (`tejun-send`, `tejun-peek`, `tejun-group`, `tejun-wipeboard`, `tejun-harakiri`, …). **Every tool is a script; the action is what makes it a tool** | `ronin_catalogs/TOOLS.md` |
| **script** | system_scope | **the genus: any executable in the repo, wherever it lives** — `bin/`, `scripts/`, `hostside/`, `setup.sh` at the root. Most scripts are not tools, and that is normal, not a defect | § SCRIPTS |
| **compile** | system_scope | `ronin_bin/tejun <macro>` → recipe + actions + tools + the SOPs those actions cite, as one blob; undefined action = exit 3 | `reading-list/TEJUN.md` |
| **SOP** | system_scope | one standard operating procedure — how a house goes about a DOMAIN (source control, data, deploying, secrets). Stock in `ronin_sops/`, yours in the `sops` store (whole-file shadow). **Fetched by the situation, never by the machinery**: found by name via `docs/SHELVES.md`, which every session is handed at birth. An SOP may cite an action (its `> Tool:` header); **an action may never cite an SOP** — owner, 2026-08-15 | `ronin_sops/README.md` |
| **`library:`** | system_scope | the action key naming a library page — `- **library:** <name>` — which `ronin_bin/tejun` inlines at compile, the user's `library` store winning whole-file, so a redefined page takes effect on the next run. Read `sop:` and resolved against `ronin_sops/` until 2026-08-15, which had the arrow backwards | `ronin_library/README.md` |
| **step tracker** | system_scope | `ronin_bin/tejun-step` — position in a macro run, held in `@tejun-step` | `docs/tejun-macro-system.md` |
| **session_macro.lookup** | system_scope | a read-only question Ronin already holds the answer to: `+tag:`/`+group:`, `+wipeboard:`. One command, no compile, no step tracking; sent through Ronin it arrives already resolved. Alias: **lookup macro**, prose only | `ronin_catalogs/MACROS.md` |
| **session_macro.workflow** | system_scope | a recipe of cataloged actions the agent performs: compile (`ronin_bin/tejun`) or step through (`ronin_bin/tejun-step`), execute in order, report the outcome | `ronin_catalogs/MACROS.md` |
| **read-letter · write-letter** | system_scope | the two actions over a session's own TEGAMI: read the ladder as written (`read_tegami`), or set it / point at the rung being worked (`write_tegami`). Cataloged 2026-08-14 — the tools had implemented no action since MICHI shipped, which is why they sat outside TEJUN | `ronin_catalogs/ACTIONS.md` |
| **`run:`** | system_scope | the macro key choosing delivery (owner, 2026-08-14): absent or `whole` = the full blob at once, the default; `stepped` = compile arms the step tracker and hands one step at a time. Any macro can be stepped on demand via `tejun-step start` | `ronin_catalogs/MACROS.md` |
| **`preview:`** | system_scope | the macro key choosing DISPLAY (owner, 2026-08-17): absent = not on the tile's ⚡ drop, the default; `yes` = drawn there as one of the four teaching cards, from the same entry's `label:` (headline, plain words) and `blurb:` (always-visible body copy). **Display only — an unpreviewed macro still runs**, and opt-in because the drop teaches nothing when it holds a dozen | `ronin_catalogs/MACROS.md` |
| **invocation** | system_scope | `+<name>: <args>` — the `+` marks a macro line; bare `<name>:` also works; never *required* to recognize one | `reading-list/TEJUN.md` |
| **harakiri** | system_scope | a session ends itself; refuses to end another | `ronin_catalogs/ACTIONS.md` |
| **forkit** | system_scope | spin the current topic into its own session; the work leaves with it | `ronin_catalogs/MACROS.md` |
| **tell** | system_scope | the macro for one session messaging another (`+tell: <session> <message>`) — control-check, then `tejun-send`, then report the verdict. It COMPOSES the send-to-session action, which is plumbing and not invocable itself; the reply lands in the other session's tile, never relayed back | `ronin_catalogs/MACROS.md` |

### § SCRIPTS — the genus, and why most of them are not tools

**`script` is the wide word and `tool` is one species of it.** The agent-typed tools
(`tejun*`) live in `ronin_bin/` as of 2026-08-14; `bin/`, `scripts/`, `hostside/` and the
root hold the house's — owner scripts, operator scripts, byoin_checks. Most scripts are
not tools, and that ratio is not sprawl by itself — it is what the vocabulary failed to
describe.

**The axis is who runs it** — the same axis that splits `session_macro` from
`workspace_macro`, and it answers this question just as cleanly:

| Who runs it | What that makes it | Examples |
|---|---|---|
| **an agent**, by bare name | lives in `ronin_bin/` — a **tool** if a cataloged action names it | `tejun-send` · `tejun-peek` · `write_tegami` · `shim/tmux` (on PATH, never typed) |
| **the owner**, by hand | lives in `bin/`. No catalog, and it needs none | `ronin-byoin` · `ronin-doctor` · `ronin-deploy` · `setup.sh` · `bench` |
| **the operator**, mechanically | lives in `libexec/`. `ExecStartPost`, a unit, a watcher, a git hook | `ronin-gate` · `koshi` · `rireki-sweep` · `ronin-claim` |
| **npm**, in the `verify` chain | a script — the `byoin_check`s live here | `scripts/smoke-ui.mjs` · `check-modules.mjs` · `stage.mjs` |
| **nothing at all** | an **`orphan_script`** — the one case that is always a defect. None today: the two DVR prototypes were deleted 2026-08-14 | — |

**Only the first row is a tool, and the catalog only governs that row.** `TOOLS.md`'s rule —
*"a tool must implement a documented action — no orphan scripts"* — reads today as though
every script in the house owes an action. It does not. `setup.sh` will never have an action
and is not deficient for it. **The rule is right about tools and wrong about scripts**, and
that overreach is what made the set feel unsettled.

**What a script owes is a caller, not an action.** That is the honest test, it applies to all
of them, and it is the one `proto-recorder.mjs` and `proto-v2.mjs` failed — referenced by
nothing but themselves, and deleted 2026-08-14 (git holds them).

---

**The axis is who executes it, not where the button is.** A `session_macro` is text: it
lands in a session's input, and the agent in that tile does the work. A
`workspace_macro` is machinery: Ronin performs it, above any one session, with no agent
involved. Buttons move; who executes does not — which is why the split is named this way
and not after a place.

**Both are `system_scope`** — they ship with the install and are replaced on upgrade.
That is not a contradiction of `session_macro`'s name: the scope column says where the
thing *lives*, this pair says who *runs* it. Nothing about a macro is `session_scope`;
TEGAMI is what `session_scope` looks like.

**A macro is one-to-one with its document.** The invocation is only a handle; what makes
it mean anything is the document behind it, plus a tool where the work needs one
(`forkit` needs "open a new session", so that tool exists). No document, no macro.

---

## § LAUNCHER — how sessions are born

| Term | Scope | Means | Record |
|---|---|---|---|
| **session_job** | system_scope | what a session is doing right now; fixes icon, dial, permissions and opening prompt: `RiffOnIt`, `DraftPlan`, `CutCode`, `ChaseBug`, `CheckWork`, `QuarterBack`, `OddJob`, `OpenShell`, `PersonalAssistant`, and `MikaAssist` — see § SESSION JOBS | `ronin_catalogs/SESSION_JOBS.md` |
| **the two axes** | system_scope | `project_root` (where) · `session_job` (what it is doing) — **one token, every surface**: the launcher sets them, OBOERU matches on them, TOMODACHI counts by them. Defined here once; § OBOERU uses it, and does not redefine it | `co-working/user_repo/README/OBOERU.md` |
| **opening prompt / ack rule** | system_scope | the birth instruction; "report back in your own words what you understand this job to be" | `src/spawn.ts` |
| **`mcp_off`** | system_scope | **[proposed]** the launch-table key holding a provider's own "launch with no MCP servers" flags, appended to the cell's cmd when a launch turns MCP off — the ＋ New form's toggle, carried per session like the dial. DATA, never a code path: cowork names no CLI flag and no MCP server; a provider declaring none is refused rather than launched connected. *MCP* is the protocol's own name, not a coinage | `ronin_catalogs/PROJECT_ROOTS.md` · `src/spawn.ts` |
| **`lifecycle:`** | system_scope | the catalog key mapping an session_job to its michi name. ⚠R2 | `ronin_catalogs/SESSION_JOBS.md` |

**The act/state split.** An session_job is an **act** (`DraftPlan`); a michi is the **state**
it starts the session in (`designing`). The `session_job`s are verb+object and the michi are
gerunds, so no string appears in both catalogs — see § OVERLAP item 1.

---

## § SESSION JOBS — the ten

| Term | Scope | Means | Record |
|---|---|---|---|
| **RiffOnIt** | system_scope | works out what a thing *is* and what we mean by it — produces a definition, never a plan and never code | `ronin_catalogs/SESSION_JOBS.md` |
| **DraftPlan** | system_scope | plan a known piece of work as a doc — no code yet | `ronin_catalogs/SESSION_JOBS.md` |
| **CutCode** | system_scope | build from an approved plan doc | `ronin_catalogs/SESSION_JOBS.md` |
| **ChaseBug** | system_scope | chase a fault to its cause and fix the cause | `ronin_catalogs/SESSION_JOBS.md` |
| **CheckWork** | system_scope | read-only findings work — a session's output or a sweep of the code; the target is the prompt's job, not the `session_job`'s | `ronin_catalogs/SESSION_JOBS.md` |
| **QuarterBack** | system_scope | coordinates other sessions — dispatch, unblock, report upward. The orchestrator, and **still bound by every dial**: a 👤 session is invisible to it | `ronin_catalogs/SESSION_JOBS.md` |
| **OddJob** | system_scope | does the one task asked and nothing around it — the escape hatch, for work that fits no other kind. No plan, no sweep, no tidying on the way past | `ronin_catalogs/SESSION_JOBS.md` |
| **OpenShell** | system_scope | **`agent: none`** — opens a session and launches nothing, leaving the pane at a shell prompt. Every field describing an agent is *absent* rather than blanked: no model, no posture, no opening, no ack, no permissions. (Row added 2026-08-14 — the heading counted it as the eighth while the table had never listed it) | `ronin_catalogs/SESSION_JOBS.md` |
| **PersonalAssistant** | system_scope | icon **🎩**. The OWNER's own assistant — **powered by gbrain, and says so**: brain-first (search before answering, capture on request), one confirmation per outside connection. Names and credits gbrain by the owner's ruling — *"we're not trying to steal their stuff without saying what it is"* — with the repo cited in the remit; without the gbrain `ronin_service` it degrades to a plain assistant. Reading arrives from `job/PersonalAssistant/` on the session-boot shelf. Ruled owner 2026-08-16; **gbrain is a proper name** (§ OPEN — the bare word `brain` stays retired) | `ronin_catalogs/SESSION_JOBS.md` |
| **MikaAssist** | system_scope | icon **ミ**. RONIN's own business, not the owner's work — a helpful assistant, defaulting to help, plus the four mika_macros. See § MIKA. | `docs/mika.md` |

**The grammar: verb + object.** A bare `plan` or `review` is ambiguous because it is a noun
as often as a verb; a compound reads as a command. **Display** in CamelCase, **token** is
the lowercase run-on — `+riffonit:`, `+draftplan:`, `+cutcode:`, `+chasebug:`, `+checkwork:`,
`+quarterback:`, `+oddjob:`. No separator to mistype, and it survives being typed into a pane.

**Five of them sit outside the grammar, for stated reasons:**

- **`RiffOnIt`** — riff takes a preposition, so verb+object fights the word. It keeps the
  exception because it still reads as a command. The unnamed `It` is exact: this is the one
  kind where the object has no name yet, and finding out what "it" is *is* the session.
- **`OddJob`** — a noun compound, because the escape hatch is the one slot that must **not**
  read as a command. It is the absence of a specific instruction, not one of them.
- **`QuarterBack`** — a noun, and the owner's own word: *"I want to call this my quarter
  back."* It was `WatchCrew`, which obeyed the grammar and was still wrong — "watch" reads as
  *observe* on a list where `CheckWork` is the one that observes, and the job is the opposite
  of watching. A quarterback reads the field, calls the play and does not run it, which is the
  posture exactly. **The one name here that is a role rather than an act**, and it earns that:
  it is the only kind defined by its relation to other sessions rather than by its own output.
- **`MikaAssist`** — `OddJob`'s reason, pointed the other way: she is the one session doing
  **the house's** business rather than the owner's, so a command-shaped name would misfile
  her among the eight that take instructions. **She also has no invocation token** — you do
  not type `+mikaassist:`, you type one of her four mika_macros and Ronin brings her.
  **[planned]**
- **`PersonalAssistant`** — `QuarterBack`'s reason: a role, not an act, defined by its
  relation to the owner rather than by one output. The owner's own words (2026-08-16):
  *"I would call that personal assistant."* Token `+personalassistant:`. Not `MikaAssist`'s
  twin: Mika does the house's business, this seat does the owner's.

**A kind is the session's current role, not a birth mark.** A session is launched as one
and **migrates** — `RiffOnIt` → `DraftPlan` → `CutCode` is one session changing what it is
doing, not three sessions. Nothing about a kind is fixed at birth except where it started.

**A kind is also a MARK, and it lives in the LETTER.** `session_job` is a field of TEGAMI:
seeded at birth with the button the owner pressed (`src/tegami.ts` — mechanical, because
the launcher already knows), and changed by the session itself with `write_tegami` as the
work changes. Its catalog `icon:` is then drawn on every surface that lists sessions — the
⌂ Roster, the tile header, the ⚡ targets. **This is the half of the letter that is
COWORK's**, not michi's: a session has a role whether or not it ever puts a ladder up, so
the mark works on a build with no michi, where the ladder and the SHINGO chip are absent.
It replaced the hand-set 人 leader mark — see § THE GROUND.

**A kind and a michi are different questions.** The kind is *what the session is doing*;
the michi is *the plan it is working* — phases and legs. A `RiffOnIt` session may have no
plan at all; `DraftPlan` produces one; `CutCode` works through the one `DraftPlan` wrote.

**A fork is an origin, not a kind.** It says where a session came from; a fork can start as
any of the owner's eight. It takes no launcher slot, and it is never `MikaAssist` —
the house's own seat is not somewhere the owner's work forks into.

**`CheckWork` covers both targets.** A session's work and a sweep of the code are the same
posture, differing only in what the prompt points at. Two `session_job`s would be one distinction
wearing two names.

**Outstanding to make the catalogs agree with this file:** `co-working/user_repo/wip/buildouts/` becomes the
plans directory and `ronin_catalogs/{SESSION_JOBS,MACROS,ACTIONS}.md` take the new tokens — prose
only, since no code hardcodes a session_job.

---

## § LADDER — the window onto what a session is doing

**A ladder is a view**, not a file. It shows the_owner what an agent has done, what it is doing
now, and what it will do next. It is the readout; the session's TEGAMI holds the record.

**Work goes better with a ladder up first.** Research, cut and verify are much easier to
follow — for the_owner and for the agent — when there is something to hang them on, even a
one-rung ladder. A session still talking has none, and that is fine: its readout is its role.

```
  GATE      approval to proceed

  phase 1 · find the cause
    DONE      verify hypothesis A
    ACTIVE    verify hypothesis B
    PLANNED   write the plan

  phase 2 · (legs undetermined — nothing rendered)
```

**A gate always has rungs after it.** That is what makes it a gate — it is holding
something back. A ladder often *begins* with one: the plan is drawn up, the whole thing
waits on approval, and the go-ahead releases it.

**The honesty rule: an undetermined rung is not rendered.** The ladder does not pad itself
with guesses. A short ladder means the future genuinely is not known yet, which is more
useful to the_owner than an invented one.

| Term | Scope | Means | Record |
|---|---|---|---|
| **ladder** | system_scope | the window onto a session: rungs behind it, the rung it is on, the rungs it knows are coming | `reading-list/TEGAMI.md` |
| **rung** | system_scope | one line on the ladder | `reading-list/TEGAMI.md` |
| **rung_kind** | system_scope | what a rung *is*: `leg` \| `phase` \| `gate` | `reading-list/TEGAMI.md` |
| **ladder_state** | system_scope | whether the session is walking its ladder at all: `on track` \| `on tangent`. Absent means on track. **Not** `on hold` — waiting on a person is a `gate` rung | `src/services/michi/tegami.ts` |
| **rung_status** | system_scope | where a rung *is*: `PLANNED` \| `ACTIVE` \| `DONE` \| `GATE` | `reading-list/TEGAMI.md` |
| **leg** | system_scope | a unit of work — the ordinary rung. Always inside a phase | `reading-list/TEGAMI.md` |
| **phase** | system_scope | a grouping of legs — the coarse span, nameable before its legs are known. A phase with undetermined legs is the normal early state | `reading-list/TEGAMI.md` |
| **gate** | system_scope | a rung that holds back the rungs after it — waiting on approval, on another agent, on anything outside the session. **Always has rungs behind it**; a ladder may begin with one. **The ladder rung ONLY** — a repo-side test is a `byoin_check`, never a gate (R30, owner 2026-08-13) | `reading-list/TEGAMI.md` |
| **undetermined** | system_scope | what is not known yet. **Not rendered at all**; appears as a rung once determined | `reading-list/TEGAMI.md` |
| **plan** | system_scope | the phases and legs of a ladder, however far ahead they are determined | `docs/plan-format.md` |
| **side_ladder** | system_scope | work in nobody's plan — a ladder off the main one. **MICHI vocabulary, not TEGAMI: it is not a key in the letter and nothing reads one** **[planned]** | `co-working/user_repo/wip/buildouts/MICHI.md` |
| **SHINGO** (信号) | system_scope | the ladder made visible: the chip in the tile header, the ladder unrolled over the pane, and the same fields per session on the ⌂ Roster. An indicator, never a channel | `public/js/shingo.js` |
| **MICHI** (道) | system_scope | the **umbrella** over `ladder` + `TEGAMI` + `SHINGO`. Not a service of its own and **not unbuilt** — `src/services/michi/tegami.ts`, `public/js/shingo.js` and `ronin_bin/read_tegami`/`write_tegami` are live. Not user-facing — say **ladder** | `src/services/michi/tegami.ts` |

---

## § TEGAMI (手紙) — the one file a session keeps

| Term | Scope | Means | Record |
|---|---|---|---|
| **TEGAMI** | system_scope | the ONE agent-maintained file per session: a markdown shell around ONE json block — the block is the entire machine-read payload **[planned]** | `co-working/user_repo/wip/buildouts/TEGAMI.md` |
| **shell** | system_scope | the markdown around the block; `>` lines teach at the moment of opening, parsed by nothing | `co-working/user_repo/wip/buildouts/TEGAMI.md` |
| **block** | system_scope | the fenced json: `v`, `objective`, `role`, `kind`, `plan`, `stack`, `next`, `asks`, `blocked`, `decided`, `handoff` | `michi/schema.json` **[planned]** |
| **leg vs title** | system_scope | a leg is counted by number and status, never by name; `title` is the agent's words, displayed never counted | `docs/plan-format.md` |
| **next** | system_scope | drafted frames — the plan taking shape, iterated in place | `co-working/user_repo/wip/buildouts/TEGAMI.md` |
| **asks / blocked / decided / handoff** | system_scope | questions someone must answer / work waited on / settled calls with reasons, last five / what dies with the session | `co-working/user_repo/wip/buildouts/TEGAMI.md` |
| **MDEDIT** | system_scope | the utility that lets the owner **read and edit a session's documents from the coworkspace**: a `docs` list the session keeps in its TEGAMI, and the `▧ Docs` commons_tab that opens one in a plain text editor. Named because it spans two systems and needed a word that is neither — **the list ships in `RONIN_SERVICES` (it is TEGAMI data), the tab ships in `RONIN_COWORK` and goes silent when services are off**, exactly as the ladder chip does | `docs/mdedit.md` |
| **`docs`** | session_scope | the key holding that list: absolute paths, newest first. **Not written in the block** — `write_tegami --doc / --undoc` are the only doors in, and a whole-block save carries it through untouched, so rewriting a ladder cannot lose it. Same contract as `at`, different reason | `docs/mdedit.md` |
| **list a doc** | system_scope | the act: an agent putting one of its documents where the owner can open it. Say *list* — never *track*, which collides with `--on_track`, and never *attach*, which implies a copy | `ronin_catalogs/ACTIONS.md` |
| **one-way flow** | system_scope | TEGAMI → scrape → dashboard; nothing communicates back through MICHI; the owner types into the pane | `co-working/user_repo/wip/buildouts/TEGAMI.md` |
| **scrape** | system_scope | mechanical change detection: watch/stat → hash → re-read; debounced; no model anywhere | `co-working/user_repo/wip/buildouts/TEGAMI.md` |
| **key** (`@ronin-key`) | session_scope | `<name>-<created-epoch>` — the session's durable identity; a pointer, not state **[planned]** | `co-working/user_repo/wip/buildouts/TEGAMI.md` |

---

## § TOMODACHI (友達) — how Ronin is counted

| Term | Scope | Means | Record |
|---|---|---|---|
| **TOMODACHI** | system_scope | the usage dashboard in the commons + the daily drop | `co-working/user_repo/wip/buildouts/TOMODACHI.md` |
| **SOROBAN** (算盤) | system_scope | the counting contract: every readout uses one of six mechanisms, and a new counter picks one rather than inventing a seventh | `docs/soroban.md` |
| **tally** | system_scope | +1 on an action; sums across days | `docs/soroban.md` |
| **gauge** | system_scope | a sampled level, last reading wins. ⚠R6 | `docs/soroban.md` |
| **census** | system_scope | a headcount at a moment — **never summed** | `docs/soroban.md` |
| **ledger** | system_scope | a row per entity, sealed at death | `docs/soroban.md` |
| **diff** | system_scope | an event inferred from two snapshots | `docs/soroban.md` |
| **derived** | system_scope | recomputed at render, stored nowhere | `docs/soroban.md` |
| **drop** | system_scope | the daily post of one day's counts to a directory. Not "telemetry", not "upload", not "sync". **The sending moves to AGERU** — TOMODACHI composes an `ageru_packet` into the outbox and calls nobody **[planned]** | `co-working/user_repo/wip/buildouts/AGERU.md` |
| **install id** | user_scope | a uuid identifying an *install*, minted once; deliberately never a user id and never joined to one | `co-working/user_repo/wip/buildouts/TOMODACHI.md` |
| **born / ended** | system_scope | how a session started, and how it stopped | `co-working/user_repo/wip/buildouts/TOMODACHI.md` |
| **stop** | system_scope | the plan funnel's milestone noun: `planned` · `launched` · `p{n}_started` · `p{n}_leg` · `p{n}_closed` · `landed`; monotonic. ⚠R7 **[proposed]** | `co-working/user_repo/wip/buildouts/TOMODACHI.md` |
| **`end`** | system_scope | how a session ended: `harakiri · deleted · cold · archived · alive`. ⚠R8 **[proposed]** | `co-working/user_repo/wip/buildouts/TOMODACHI.md` |
| **cold / warm / archive** | system_scope | the three delete modes: nothing kept · write a record then kill · don't kill, hide from the active list. ⚠R8 **[proposed]** | `co-working/user_repo/wip/buildouts/DELETE_MODES.md` **[planned]** |

**KOTOBA is load-bearing in code here.** TOMODACHI may emit a string only if it is a house
noun; its sanitizer's allow-list generates *from this file* plus the catalogs this file
names. Retiring a word therefore stops it being counted.

---

## § AGERU (上げる) — the one door out

**Everything that leaves a ronin_install goes through AGERU, or it is a bug with a name.**
The model provider is the other door and it is the only other one; that pair is the whole
egress surface, and `egress_log` is what makes the claim checkable rather than asserted.

| Term | Scope | Means | Record |
|---|---|---|---|
| **AGERU** (上げる) | system_scope | the one outbound door: compose → review → send, and the log of every attempt **[planned]** | `co-working/user_repo/wip/buildouts/AGERU.md` |
| **ageru_packet** | system_scope | one thing that leaves: five-key envelope + a `packet_kind`-specific body against a closed schema. Composed to disk, reviewed on disk, sent from those exact bytes — **never composed at send time** | `co-working/user_repo/wip/buildouts/AGERU.md` |
| **packet_kind** | system_scope | which of the three: `tomodachi` (counts) · `kansou` (feedback) · `tejun` (a submitted macro). A fourth is a cowork change somebody has to argue for | `co-working/user_repo/wip/buildouts/AGERU.md` |
| **kansou** (感想) | system_scope | the feedback packet — the_owner telling us something in their own words. ⚠R28 **[proposed]** | `co-working/user_repo/wip/buildouts/AGERU.md` § OPEN 1 |
| **ageru_outbox** | user_scope | the `ageru` store's outbox — a store row it must add when it is built (`docs/stores.md`), never a path of its own. Validated packets waiting on a human. Anyone who can write a file can queue one; **that is the socket**, per `RONIN_SERVICES.md` §3 | `co-working/user_repo/wip/buildouts/AGERU.md` |
| **egress_log** | user_scope | every outbound attempt Ronin ever made, **model-provider calls included**. The ZDR evidence: two hostnames, greppable | `co-working/user_repo/wip/buildouts/AGERU.md` |
| **ageru_receipt** | user_scope | what the collector said back, stored beside the sent bytes. Dedup for us, proof for them | `co-working/user_repo/wip/buildouts/AGERU.md` |
| **entitlement id** | user_scope | a services install's id, kept in `ronin.json` and carried on every drop. The collector matches it to the email the install was validated with — that is how a paying customer's usage is known. Free cowork carries none **[planned]** | `co-working/user_repo/wip/buildouts/AGERU.md` |
| **unmask** | system_scope | the services install flow: a form with an email, a link they click, then the archive. No licence key — the entitlement lives with us, not in the install **[planned]** | `co-working/user_repo/wip/buildouts/AGERU.md` § SERVICES INSTALL |
| **pulse** | system_scope | the read-back on a shared macro or SOP: downloads, votes, rating — pulled by receipt-keyed artifact id, never joined to install id or handle, rendered on the sharer's own catalog entry **[planned]** (v3) | `co-working/user_repo/wip/buildouts/AGERU.md` § THE READ-BACK |
| **scrub_diff** | system_scope | what the `tejun` review shows: the submitted macro against its scrubbed self. **A diff, never a claim that it is clean** | `co-working/user_repo/wip/buildouts/AGERU.md` |
| **license_grant** | system_scope | the tick on a `tejun` packet: an irrevocable MIT grant, no exclusivity, no payment, copyright kept by the submitter — *the same deal a PR author gets*. Renders literally beside the tick, never as a link to terms | `co-working/user_repo/wip/buildouts/AGERU.md` § THE GRANT |
| **ageru_export** | system_scope | the same bytes written to a file the_owner carries out by hand, for an install whose egress is pinned to the model provider. Not a downgrade path — the same path, last hop by hand | `co-working/user_repo/wip/buildouts/AGERU.md` |

**The consent rule is one line, and it is load-bearing: only the machine-written packet gets a
standing switch.** `tomodachi` is house nouns and counts, so it can be weekly and unattended.
`kansou` and `tejun` carry human prose and are approved **one packet at a time, every time** —
there is no "remember my choice" on either, by design.

**Identity is never shared across `packet_kind`s.** (A services install is the stated exception — see § SERVICES INSTALL.) `install id` (tomodachi) · reply contact
(kansou) · attribution handle (tejun) are three fields with three lifetimes and no join —
because one feedback address joined to an install id retroactively de-anonymises every drop
that install ever sent. This binds the collector, not just the client.

---

## § OBOERU (覚える) — what survives a session's death

| Term | Scope | Means | Record |
|---|---|---|---|
| **OBOERU** | system_scope | the memory system: durable cross-session lessons, so a lesson outlives the session that learned it **[planned]** | `co-working/user_repo/wip/buildouts/MEMORY.md` |
| **memory** | user_scope | one short markdown file whose frontmatter says who it is for | `co-working/user_repo/wip/buildouts/MEMORY.md` D2 |
| **the store** | user_scope | where memories live — one store, outside every repo; the axes do the partitioning | `co-working/user_repo/wip/buildouts/MEMORY.md` D1 |
| **the match** | system_scope | a memory reaches a session when both of **the two axes** (§ LAUNCHER) agree: `project_root` **and** `session_job` | `co-working/user_repo/README/OBOERU.md` |
| **universal memory** | system_scope | both axes `"*"` — matches every session. `tejun-remember` refuses to write one by design; only the owner can, from the commons | `co-working/user_repo/wip/buildouts/MEMORY.md` D4 |
| **remember / recall** | system_scope | `tejun-remember` writes one, `tejun-recall` returns the ~20 lines a session gets at birth. Cataloged as `remember-lesson` / `recall-memories` (2026-08-14) **[planned]** | `co-working/user_repo/wip/buildouts/MEMORY.md` D4–D5 |

---

## § RIREKI (履歴) — the session record

| Term | Scope | Means | Record |
|---|---|---|---|
| **RIREKI** | system_scope | the umbrella for the whole record: capture, storage, render and the consumers | `docs/rireki.md` |
| **tape** | session_scope | **every byte a pane emitted, never interpreted.** Per-pane | `docs/rireki.md` |
| **recorder** | system_scope | the standalone tmux applet that writes the tape, with or without Ronin running | `libexec/rireki/` |
| **ring** | system_scope | the 64MB per-pane ceiling: oldest whole segments drop as new ones arrive | `src/services/rireki/rireki.ts` |
| **scroll** | session_scope | **what those bytes settled into** — a pane's settled transcript on disk, line-numbered. Derived from the tape, disposable, rebuildable from it | `src/services/rireki/scroll.ts` |
| **settle / the settler** | system_scope | turning tape bytes into scroll lines, **once per pane** on the janitor's clock, never per client | `src/services/rireki/scroll.ts` |
| **decoder** | system_scope | one per agent (Claude's and Codex's are built): a signature table naming each line's kind. The only vendor-aware part — decoders **decorate, never delete** | `src/services/rireki/decode.ts` |
| **lens** | system_scope | the read-side projection (`shown` vs `derived`). ⚠R9 | `src/services/rireki/lens.ts` |
| **faucet A / B** | system_scope | attach paints pictures (unlimited clients); `pipe-pane` emits bytes (**exactly one per pane**, the recorder's, forever). The tape records B | `docs/rireki.md` |
| **tape-fed tile** | system_scope | 🔓 unlocked, rendered from the record rather than from an attachment | `docs/rireki.md` |

**tape ≠ scroll.** Both were being called "the tape". Tape is raw and authoritative; scroll
is interpreted and throwaway. If you keep one distinction from this section, keep that one.

---

## § KOSHI — Ronin's own agents

**A koshi is an agent doing an internal job for Ronin.** That is the whole definition, and
the load-bearing half is *internal*: the owner never sets one up, names one, or points one at
a task. It is the house's own labour, shipped with the install.

**This is why the bare word `agent` was not enough.** An `agent` is the CLI in a tile —
the owner launched it, it does the owner's work, and Ronin never reaches inside it. A koshi
is the opposite on every count. Same machinery, opposite employer, and calling both "agent"
hid that.

| Term | Scope | Means | Record |
|---|---|---|---|
| **KOSHI** | system_scope | the umbrella over Ronin's internal agents. Not user-facing — a readout says what the job *did*, never "koshi" | `co-working/user_repo/wip/buildouts/KOSHI.md` |
| **koshi job** | system_scope | one of them. Named `koshi_<job>`, always — the prefix is what makes the set greppable | `co-working/user_repo/wip/buildouts/KOSHI.md` |
| **incarnation** | system_scope | a koshi job on the model side — each one separately pointed at an outlet | `src/services/koshi/koshi-model.ts` |
| **outlet** | system_scope | where a koshi question goes: `koshi_session` · `koshi_external` · `koshi_hosted_weights`. An outage is an "I don't know", never a throw | `src/services/koshi/koshi-model.ts` |
| **`koshi_weights`** | system_scope | the weights service and its store — the machinery behind the `koshi_hosted_weights` outlet: pinned llama.cpp + hash-pinned GGUFs on localhost, `@koshi-weights`' role given a body. Standalone AND gbrain's dependency; its runner state lives in the `koshi_weights_service` store. The one `koshi_` name that is not a job, and it says so **[proposed]** | `ronin-services/koshi_weights/` |
| **pace** | system_scope | how keen a self-paced incarnation is — `relaxed` · `steady` · `keen` scale the whole cadence table, never one row | `src/services/koshi/koshi-model.ts` |
| **目 Koshi** | system_scope | the commons tab where the owner sets which model each koshi job asks. The one place a koshi is configured, and it is configuration, not definition | `docs/commons.md` |

**The jobs today:** `koshi_monitor` · `koshi_reaper`. The list grows; the naming rule does
not — a new one is `koshi_<job>` or it is not a koshi.

**The line that keeps the set clean (R31):** a koshi is **one stateless model call over a
closed question, and it never authors.** Work that authors is MIKA's — § MIKA. Two jobs left
by that rule and are deleted rather than annotated, per this file's housekeeping.

**KOSHI is `system_scope`, and R10 is closed by it.** The two old uses — an in-process
form-fill helper, and "a tile running `orchestrating`" — are gone. The second was never a
koshi at all: a tile running work is a session with a `session_job`, which is
`QuarterBack`. ⚠ **The kanji is unruled** — every other name on the list carries one and this
one never has. Not invented here; see § OPEN R23.

---

## § MIKA — the house's own assistant

**A mika is Ronin's own business, done by a seated agent.** Where a koshi is one stateless
model call over a closed question, Mika is **an agent in a tile** — a cwd, a dial, a michi, a
reading list, tools. Same employer as a koshi (the house, not the owner's work), opposite
machinery, which is why she is not filed under KOSHI. **[planned]**

| Term | Scope | Means | Record |
|---|---|---|---|
| **MIKA** | system_scope | the house's **helpful assistant** — help first, and Ronin's own admin. Four requests and no more: `system_help` (the default), `new_session`, `project_root`, `system_config`. | `docs/mika.md` |
| **`MikaAssist`** | system_scope | her `session_job` — the ninth, icon **ミ**. Outside the verb+object grammar for `OddJob`'s reason: she is the one session not doing the owner's work at all. | § SESSION JOBS |
| **mika_macro** | system_scope | one of her four, re-addressed to her tile from wherever it was typed. Defined in § TEJUN. | `ronin_catalogs/MIKA_MACROS.md` |
| **spawn-or-inject** | system_scope | her workspace_macro: a live `mika` session takes the request, else one is born and takes it. **She is a singleton** — two Mikas would both write the catalog. | `docs/mika.md` |

**The law: PROPOSE, NEVER WRITE.** Every catalog entry and every setting Mika touches is
shown as what it will become and waits for a yes; the confirm then goes through the write
path that already exists. There is no second write path, no new refusal rule, and the ▣ tab
stays a co-editor rather than quietly becoming an owner.

**She honours the dial; a koshi does not.** A koshi is house machinery in the recorder's
category — it reads panes nobody talks to. Mika is a session the owner **converses with**, so
reaching her tile is an ordinary send. A house agent that cannot be silenced by the dial is a
house agent that cannot be silenced.

**MIKA is cowork.** All four of her macros operate on cowork's own machinery — the catalog,
the launcher, SETTEI, the documents — and cowork must run alone. Her session_launch_spec comes from the
launch table like any session's, so the owner pays for her the way they pay for their own
work.

**Counted, never blocked** (owner, 2026-08-14). Mika occupies a tile and a session_launch_spec like
anything else on the roster, so the census counts her — but the cap never refuses *her*:
**blocking someone who is asking for help is rude.** She can be the eleventh of ten. What
that costs is the next spawn, which the ordinary guard refuses; nothing is evicted to make
room, and no session is ever chosen to die.

**Her mark is the katakana ミ**, not a kanji — she is a name, not a system noun. That closes
for MIKA the question § OPEN R23 leaves open for KOSHI.

---

## § KOE (声) — voice in, voice out

| Term | Scope | Means | Record |
|---|---|---|---|
| **KOE** | system_scope | the voice surface, both directions: speech to text going in, spoken summaries coming back. **[planned]** | `ronin_catalogs/HOTWORDS.md` |
| **hotwords** | system_scope | the dictation glossary — the words dictation keeps mishearing, sent along with the voice. **Two things in two systems:** the *tab* is coworkspace like every UI surface; `src/services/koe/hotwords.ts` and the stock list are KOE's. **Two FILES too:** the shipped stock list, and the owner's own in the catalogs store — which is SETTEI, and is the one every write lands in | `ronin_catalogs/HOTWORDS.md` |
| **`koshi_koe`** | system_scope | the koshi job doing the work. **KOE is the surface, `koshi_koe` is the worker** — not two names for one thing **[planned]** | § KOSHI |

**KOE is the noun for the whole surface** — the owner's question, answered: not just
dictation in, not just speech out, but both and the machinery under them. Dictation already
reaches the_owner's face through the ▥ Hotwords tab, so the English word is **Hotwords** for
that tab and the name KOE stays ours.

**Unbuilt, and the weights are unaccounted for.** Whisper weights existed on old dohyo; whether
they survived onto `dohyo-unified` has not been checked. **[planned]** stands until they are
found and something reads them — see § OPEN R24.

---

## § COWORKSPACE — what the owner drives

**The whole UI is one noun: the `coworkspace`.** Header, tiles, the commons, the wipeboard,
the dials, the keypad, and every button on any of them. It was `WORKSPACE` in one table and
nameless everywhere else, so the UI as a *whole* could not be referred to at all — you could
say *tile* or *commons* but not the thing containing them.

**It is the counterpart of the commons, one level up.** A coworkspace holds tiles; a tile
with no session showing holds the commons. Different scales of the same idea, and neither
word may be used for the other.

| Term | Scope | Means | Record |
|---|---|---|---|
| **coworkspace** | system_scope | **the whole UI** — every surface, tile, panel and button the owner drives. All of it ships in `RONIN_COWORK`; a `ronin_service` fills a subset of *cowork's own* UI and ships no HTML, JS or CSS of its own | `docs/architecture.md` |
| **tile** | system_scope | one cell of the coworkspace, showing one session. **The public word** — see § THE GROUND for why it beats *pane* | `docs/architecture.md` |
| **viewer session** (`grid_*`) | system_scope | hidden grouped tmux session backing a tile; killed on disconnect | `docs/architecture.md` |
| **coworking_commons** | system_scope | the shared surface inside a tile, when no session is showing. Ten commons_tabs behind one strip. Alias: **the commons** | `docs/gbrain.md` |
| **commons_tab** | system_scope | one section of the coworking_commons, reached from its tab strip: **⌂ Roster · ＋ New session · ▤ Wipeboard · ▧ Docs · ▣ Roots · ▥ Hotwords · ▦ Stats · 目 Koshi · gbrain · ⚙ Setup**. Alias: **tab**, prose only — bare *tab* is a common word and is not the term. **Never a "pane" or "panel"** — see § THE GROUND | `docs/gbrain.md` |
| **session_launch** | system_scope | the commons' **＋ New** tab — where a session is born with a `project_root`, a `session_job` and an opening prompt. Alias: **launch**. One door: `launch_job` (the catalog fill) · `launch_bare` (a name alone) | `docs/commons.md` |
| **session_roster** | system_scope | the commons' **⌂ Roster** tab — every session on the ronin_machine. The session list, full stop; the macro forms beside it were removed 2026-08-09. Alias: **the roster**. Never "the board" | `docs/commons.md` |
| **locked 🔒 / unlocked 🔓** | system_scope | locked = *this view is attached to the live tmux session*; unlocked = *the session is still running, this view is not attached to it* | `docs/LOCKED-VS-UNLOCKED.md` |
| **compose overlay / copy sheet / ⛽ context gauge** | system_scope | the mobile input box, the touch copy panel, the context readout | `docs/context-gauge.md` |
| **▦ the keypad** | system_scope | the physical macropad driving Ronin by hand — the one surface that is hardware | `co-working/user_repo/README/KEYPAD_README.md` |
| **pad key** | user_scope | one key bound to a send; sends reaching the server are group-expanded like any other | `co-working/user_repo/README/KEYPAD_README.md` |
| **wipeboard** | user_scope | the commons' **▤ Wipeboard** tab and the file behind it — one markdown file a set of sessions all read and append to; append-only, watermarked posts. **Alias: whiteboard** only, because voice-to-text hears it that way. **Never "the board"** | `docs/wipeboards.md` |
| **▧ Docs** | user_scope | the commons tab where the owner opens a session's documents. **The tab is cowork; the list behind it is TEGAMI's — see § TEGAMI, MDEDIT.** There is deliberately **no file browser**: a document is reachable because a session listed it, and the way to reach an unlisted one is to ask the session for it (`+show_file`) | `docs/mdedit.md` |
| **Brief** | system_scope | the owner's statement of what a wipeboard is for. **Agents never edit it** | `docs/wipeboards.md` |
| **membership** (`@ronin-wipeboards`) | system_scope | lives on the *session*, not in the file, so a roster can never drift from reality | `src/tmux.ts` |
| **dial** (`@ronin-control`) | system_scope | 👤 user / 👁 read / 🤖 write; owner-only to flip; enforced by the shim. Defaults to write, so it rarely bites — but **no role is exempt**, `QuarterBack` included. A dial with an exception is not a dial | `docs/session-control-dials.md` |
| **shim** | system_scope | `bin/shim/tmux`, `bin/shim/systemctl` on PATH — vendor-neutral enforcement of dials and host guards | `docs/session-control-dials.md` |
| **control-check** | system_scope | read the dial before touching a session — every session, every role, reading as well as writing | `ronin_catalogs/ACTIONS.md` |
| **tag / group** (`@ronin-tags`) | system_scope | owner-set, multi-valued; addressing, not decoration (`+tag:`) | `CLAUDE.local.md` |
| **note** (`@ronin_note`) | system_scope | the owner's one line about a session | `src/status.ts` |
| **session_job**, the mark | system_scope | what a session is DOING, held in its **letter** (`Tegami.session_job`) — seeded at birth with the job it was launched as, changed by the session with `write_tegami`. The catalog's `icon:` is drawn wherever sessions are listed. **The letter's role half is cowork's; the ladder half is michi's.** **⚠ RETIRED: the leader 人 (`@ronin-lead`)** — it named only who coordinated a group, had to be hand-set, and was a second thing to maintain that the job already implied. The coordinator is the session whose job is `QuarterBack` 🏈 | `src/tegami.ts` · `ronin_catalogs/SESSION_JOBS.md` |
| **▥ Hotwords** | system_scope | the commons tab. The dictation glossary itself belongs to KOE — see § KOE | `ronin_catalogs/HOTWORDS.md` |
| **ghost text** | system_scope | text typed into a tile's prompt but not submitted; never type over it | `ronin_catalogs/ACTIONS.md` |

---

## § SETTEI (設定) — the owner's configuration of Ronin

**What the owner has SET about how this install behaves.** Not their recipes, not their
code. The term is `system_scope` — it ships, it is Ronin's own noun. **The values are
`user_scope`**: they live under `ronin_user_root`, so an uninstall leaves them.

### The two words, and the test that separates them

Three things had been living in one drawer. The first cut of this split tested on *what
changes when you change it* — Ronin's behavior, or the work — and the owner's rulings broke
it: keypad bindings and hotwords change neither, and both are SETTEI. **The axis is what
kind of thing it is.**

| Term | Scope | Means | **The test** | Record |
|---|---|---|---|---|
| **SETTEI** | system_scope | the owner's configuration of Ronin | **You SET it** — a value, a list, a mapping, a credential — through one of Ronin's own configuring surfaces | `docs/user-config.md` |
| **user_customization** | system_scope | the owner's extensions to TEJUN — their own session_jobs, macros, actions, tools | **You AUTHOR it** — a recipe | `reading-list/TEJUN.md` |

A hotword list is a list you **set**; a macro is a recipe you **write**. The old test could
not tell them apart and put both in the wrong drawer.

**The owner's own code is not a third term.** `project_root` and `project_repo` already name
it (§ THE GROUND), and a third umbrella would collide with them. What SETTEI holds about it
is the `inclusion_list`: **SETTEI holds the pointer and the policy; the directories it points
at are the owner's and are none of SETTEI's business.**

### Surviving an uninstall is NOT the line between them

Both are `ronin_user_root`. A macro the owner authored must survive as surely as a setting —
it is their work. The rule is `docs/stores.md`'s one sentence, and it covers both:

> **If deleting it would lose the_owner's own work or their choices, it is `user` scope.**

SETTEI is *choices*, `user_customization` is *work*. The split decides what the word covers
and what the Setup commons_tab shows — never what survives.

### The kinds of row, because they must not look alike

| Kind | Example | Where it lives | Editable in the UI |
|---|---|---|---|
| **fact** | hostname, cores, RAM, the resolved bind, the store roots | measured at request time | **never** |
| **setting** | `owner.name`, `sessions.max` | `ronin.json` + the bus | **yes** |
| **knob** | `PORT`, `SCRIBE_URL`, `TMUX_WINDOW_SIZE` | `process.env`, a memory copy from boot | **no** — inert until a restart, which is **BYOKI** wearing a UI |
| **secret** | `OPENAI_API_KEY`, `GRID_PASS` | `.env`, never sourced | **no, and never rendered** |

> **`ronin.json` now holds the login record — so it is NEVER served whole.** The owner's
> auth landed `auth` (scrypt + the session signing secret) and `passkeys` in it
> (2026-08-17 correction: the old rule said "never holds a credential, served whole by an
> HTTP GET", and both halves are now false — no route serves it whole, and none may ever
> be added). Settings leave it per-field, through their own routes. `.env` stays the
> store for provider keys, and `bin/ronin-doctor` refuses to source it *because it holds
> secrets*. A key's **presence** and its variable name may be shown. Never a byte of its
> value, and never a field to type one into.

### The bus is a copy, never a home

`@ronin-session-max`, `@ronin-owner`, `@ronin-url` and `@koshi-weights` are tmux **server**
options carrying published copies of SETTEI, so a Node server and a zero-dependency bash tool
can both read a value without two JSON parsers. **A write is two acts, always** — save the
file, then publish. `docs/user-config.md` is the contract.

### Where a setting must never live

Three rows were in the wrong home when SETTEI was named, and each is its own defect
(`co-working/user_repo/wip/buildouts/SETTEI.md`):

- **not the data root.** `koshi-outlets.json` sat under `storeDir('session')` — the root
  DAIKUSAN promises uninstall deletes. Which model a koshi asks is a **choice**. **Fixed
  2026-08-13**: it is the `koshi` section of `ronin.json`, and the old location is read once
  as a fallback until every install has saved.
- **not the install tree.** Hotwords were read and written inside `ronin_catalogs/`, which is
  `system_scope` and therefore *replaced on upgrade*. It was also why our own proper names
  shipped as stock into a tenant's dictation prompt — a JUSHO leak. **Fixed 2026-08-13**:
  the shipped list is read-only stock, every write lands in the catalogs store, and the
  owner's file wins from their first edit.
- **not a browser.** Keypad bindings are in `localStorage`, so they are not on the
  ronin_machine at all: absent on the phone if they were bound on the Mac.
  (`co-working/user_repo/wip/buildouts/KEYPAD.md`.)

**Device state is the honest exception.** The grid layout and which tiles are open stay in
the browser and are **not** SETTEI — a phone showing one full-screen tile while a Mac shows a
2×2 grid is correct behavior, not drift. Owner, 2026-08-13.

---

## § WHERE FILES LIVE — the three scopes

The words only. Where things live, why, and the rules for extending Ronin are
**`DAIKUSAN.md`** — that argument does not belong in this file.

**JUSHO (住所) — the address rule.** *Nothing shipped names a machine, a person, or a
place.* Machines, people and locations are **resolved** at runtime or **injected** at
install; a literal naming one is a defect with a name now. It is the umbrella over the two
roots, the store table, and the gate that keeps them true — and over the whole class it was
coined for: references to a dead box, a dead URL, a dead username, a directory that existed
somewhere else. Ronin has no address of its own; it asks. Record: `docs/stores.md`.

| Term | Scope | Means | Record |
|---|---|---|---|
| **JUSHO** (住所) | system_scope | **the address rule** — nothing shipped names a machine, a person or a place. Resolve, inject or delete; `check-place` fails the build on the rest | `docs/stores.md` |
| **system scope** | system_scope | the Ronin install; an upgrade overwrites it | `DAIKUSAN.md` |
| **user scope** | system_scope | what Ronin accumulates, in its own directory, outside every repo | `DAIKUSAN.md` |
| **session scope** | system_scope | one session's own files; dies with the session | `DAIKUSAN.md` |
| **the upgrade test** | system_scope | the question that assigns scope: *if Ronin is upgraded, is this replaced?* | `DAIKUSAN.md` |
| **shadowing** | system_scope | how custom beats stock: same filename in the user's catalog directory wins over the shipped one | `DAIKUSAN.md` |
| **ronin_user_root** | system_scope | the visible root: the user's own choices and what they told us to keep. **Uninstall leaves it.** `RONIN_USER_ROOT` moves it; `bin/ronin-store --root user` prints it | `docs/stores.md` |
| **ronin_data_root** | system_scope | the hidden root: working state that is ours, regenerable, losable. **Uninstall deletes it**, and nothing of theirs goes too. `RONIN_DATA_ROOT` moves it; `bin/ronin-store --root data` prints it | `docs/stores.md` |
| **ronin_store** | system_scope | one declared location under one of the two roots — a row in the store table, resolved at runtime. **Never a path spelled by hand.** `bin/ronin-store <id>` prints one, `--all` prints the table | `docs/stores.md` |
| **ronin_library** | system_scope | the shipped reference shelf — the longer reading an action or macro sends an agent to, fetched by the MACHINERY (`- **library:** <name>`, inlined at compile). Ships in cowork, starts near-empty and grows one screened piece at a time; the owner's own library (the `library` store, user scope) shadows it file-for-file, so the shipped way of working is a default, never a prescription | `ronin_library/README.md` |
| **ronin_sops** | system_scope | the shipped standard operating procedures — how a house goes about a domain, one SOP per file, fetched by the SITUATION and never by the machinery. **The pair test: if you can name the action that would cite it, it is library.** Starts near-empty like the library; the owner's own `sops` store shadows it file-for-file — a `user_customization` you author, like a macro | `ronin_sops/README.md` |
| **ronin_session_boot** | system_scope | the shipped **session boot shelf** — what a NEW SESSION reads before anything else. Named for booting a *session*, never the application. Three levels that ADD UP rather than override: `all/` (every session) · `root/<project_root>/` · `job/<session_job>/`; the owner's `session_boot` store shadows it file-for-file. Stock may ship `job/` but never `root/` — the jobs ship, the owner's directories do not. Replaced the project_root's `read:` field, which stored literal paths and went stale in silence | `docs/session-boot.md` |
| **ronin_bin** | system_scope | **everything an agent types, and nothing else** — every `tejun*` plus `write_tegami`/`read_tegami` (moved out of `bin/` 2026-08-14). On PATH via setup.sh, behind `bin/shim` and ahead of `bin/`. A **tool** is the subset that also implements a cataloged action. The fifth shelf: ronin_session_boot · ronin_catalogs · ronin_library · ronin_sops · ronin_bin | `ronin_bin/README.md` |
| **SHELVES** | system_scope | the one page that says the four shelves exist and what each answers, so an agent can *find* a catalog, a library page or an SOP without any of them being pasted at it. Names **no individual entry**, so adding one never dates it. Owner, 2026-08-15: the name is `SHELVES`, it lives in `docs/`, and it is a file rather than lines in a brief. It reaches a session through the **boot shelf** — `ronin_session_boot/all/` symlinks it, and `buildBrief` lists that level at spawn — so every session is handed it, and no pointer is written down anywhere to go stale | `docs/SHELVES.md` |
| **libexec** | system_scope | executables **the machine invokes and nobody types** — `ronin-gate` (ExecStartPost), `rireki/` (the tmux applet), `koshi` (the job process), `ronin-may-spawn`, `ronin-claim` (the git hooks). The Unix split `bin` (a person types it) vs `libexec` (a program invokes it), adopted 2026-08-14. NOT on PATH | § SCRIPTS |
| **the session directory** | session_scope | the `session` store, `<store>/<key>/` — one session's own record: TEGAMI, RIREKI's tape, the scroll. R5 closed: the store resolves it, and there is no second answer | `src/stores.ts` |
| **house_dirs** | system_scope | the three directories of a project_repo the documents library page writes into (owner, 2026-08-14): **`wip/`** — what might be, mutable and mortal, deleted when the work lands; **`docs/`** — what is, state-of-fact only (a project_repo's docs/; the Ronin repo's own docs/ stays the system-docs tier); **`manifest/`** — the drawer: one terse line per entry, date · what · pointer, past/present/future all welcome, prose never | `ronin_library/documents.md` |
| **build-out doc** | user_scope | the plan, in `wip/buildouts/`; **shrinks toward empty** — a leg completes by being DELETED, the file by landing | `ronin_library/documents.md` |
| **handoff** | user_scope | what one session hands the next, in `wip/handoffs/`; expires, and is deleted when its work lands | `ronin_library/documents.md` |
| **tejun-plan** | system_scope | the parser for a michi written as a doc — see § MICHI **[planned]** | `co-working/user_repo/wip/buildouts/MICHI.md` leg 4a |

---

## § NUANCE — distinctions we can feel but have not named

**A parking lot, not a naming exercise.** Each row is a difference that shows up in
conversation and has no word yet. Nothing here needs settling now; the point is to stop
the distinction dissolving every time we talk past it. When one gets sharp enough to be
worth a word, it graduates into a section above and leaves here.

### session

| The distinction | Word today | What a word would buy |
|---|---|---|
| a session vs **the agent run inside it** — kill claude, start it again in the same pane: same session, new agent, no memory of the last one | none | TEGAMI dies with the *session*, but context dies with the *run*. We describe both as "the session dying" |
| a session vs **its panes** — RIREKI tapes per pane, addressing is per session; Ronin assumes one pane and mostly gets away with it | none | the 1:many is real and unhandled; a two-pane session has two tapes and one name |
| a session vs **its topic** — `forkit` treats them as equal ("spin the topic into its own session"), `yokomichi` exists precisely because they are not | none | a long session holds many topics; that is the whole reason for a frame stack |
| **live vs dead vs hidden** — a session that ended, versus one archived out of the list, versus a viewer | partly (`end`, ⚠R8) | see R8 |

### agent

| The distinction | Word today | What a word would buy |
|---|---|---|
| the **CLI** (claude, codex) vs the **model** vs **this run of it** | all three are "the agent" | vendor neutrality is about the first; context limits are about the third |
| an agent that is **a shell script** — no model at all | covered by the definition, never said out loud | the neutrality claim is stronger if we mean it literally |
| **inside vs outside** — commons is the inside of a tile; the dials speak of *outside agents* | half a term | the dial vocabulary already leans on this without defining it |

### owner

| The distinction | Word today | What a word would buy |
|---|---|---|
| owner of **the install** vs owner of **a session** vs owner of **the repo** | one word for all three | today they are the same person; on a shared box they are not, and the dials assume the first |
| the owner as **authority** (flips dials, decides) vs as **author** (posts as `user: glen`) | one word, hardcoded in two places | `OWNER_AUTHOR` / `OWNER` are already the seam where a profile would go |

### system

| The distinction | Word today | What a word would buy |
|---|---|---|
| the **product** vs **this install** vs **the running operator** | ⚠R14 proposes three | the whole circularity lived here |
| "the system" meaning **software** vs meaning **the way we work** | none | the second is what we actually ship; the first is how it is delivered |

---

## § OVERLAP — where two surfaces name the same concept

**1 · Progress is measured twice.** A ladder counts legs by status; TOMODACHI counts
`stop`. Both answer "how far along is this?" and `stop` is not derivable from leg counts by
name. ⚠R7

**2 · How a session ends is named on three surfaces.** `harakiri` (TEJUN), `cold·warm·
archive` (the delete modes), `end` (TOMODACHI's ledger). ⚠R8

**3 · "gauge" names two things.** ⚠R6

**4 · The overlap that is deliberate.** `project_root` and `session_job` are used verbatim by
the launcher, OBOERU's match and TOMODACHI's dimensions. One token, every surface — which
is what R17's merge protected.

---

## § PRINCIPLES (the one-liners; full text in `co-working/user_repo/README/internal/POSITIONING.md`)

**environment over enforcement** · **terminal view only / vendor neutrality** · **sessions
are mortal, files are the memory** · **speed bumps, not vaults** · **neon signs for
agents** · **the cockpit motif** (dials are inputs, gauges are readouts) · **TEJUN's law**
(a macro is nothing but cataloged actions) · **do it, don't narrate it** · **show the
result** · **fast or mechanical — never slow and clever**

---

## § OPEN — needs your ruling

**R1 · CLOSED — there is no "macro launcher".** It was one name reaching for three
things. They are now named separately: **`session_launch`** (the ＋ New tab, where a
session is born), **`session_macro`** (an invocation the agent executes) and
**`workspace_macro`** (one Ronin executes above any session). `ronin_bin/tejun` and
`ronin_bin/tejun-step` are tools serving the second, not a surface.

**R2 · DISSOLVED.** A michi is the session's plan, not a named shape a kind maps to, so
the `lifecycle:` key has nothing to point at.

**R3 · CLOSED — a michi is a plan.** Phases containing legs, legs carrying
`planned`/`underway`/`completed`. The kind says what a session is doing; the michi is the
plan it is working through. MICHI is the umbrella over all of it. The rows that named a
second list of states — and the machinery built to hold them — are gone from this file,
pending your go on `co-working/user_repo/wip/buildouts/MICHI.md`, since they are `[planned]` rather than built.

**R4 · CLOSED. There is no bare "board"** — it could mean a thousand things, and neither
named board may ever be aliased to it. **`session_roster`** is the commons' ⌂ Roster tab (alias:
*the roster*). **`wipeboard`** is the shared markdown surface (alias: *whiteboard* only,
because voice-to-text hears it that way). `wipeboard` is our own coinage and stays — it is
in the tmux option, the tool and the macro token, and *wipe* is right for a surface many
hands write on and erase. The ladder view across all sessions is rendered by
`ladder_reader` and has no name of its own.

**R5 · CLOSED — no path is spelled anywhere any more.** Owner, 2026-08-13. The session
directory is a **ronin_store** under **ronin_data_root**, resolved at runtime from one
table (`src/stores.ts`, and `bin/ronin-store` for bash). There is no second answer and no
fallback: the older location was moved, once, and naming it is now a build failure. The
disagreement was never about which path was right; it was that a path was written down
twice. See `docs/stores.md`.

**R6 · "gauge" means two things.** The cockpit sense (any readout) vs SOROBAN's (a sampled
level). Under SOROBAN a census readout is emphatically not a gauge.

**R7 · `stop` is a weak noun.** Fits the road metaphor, but reads as *halt* and sits one
letter from `step`.

**R8 · `cold / warm / archive` collide on two axes.** The delete modes name the action;
`end` names the outcome. Also "archive" already means "not preserved after death" for the
session directory, while the archive *mode* preserves nothing — the mode that preserves is
**warm**. Recommendation: one word one meaning; the three modes become `end`'s vocabulary
and `deleted` is dropped as merely their parent.

**R9 · The `lens` row will drift.** The tile now reads the scroll, so "the pure read-side
projection" describes the settler better.

**R10 · CLOSED — a koshi is an agent doing an internal job for Ronin.** Owner, 2026-08-13.
The umbrella over `koshi_monitor`, `koshi_reaper` and whatever follows.
Narrowed by R31 — a koshi is one model call over a closed question, and never authors. The two old uses are retired: the form-fill helper is not
a koshi, and "a tile running `orchestrating`" was a session with a `session_job` all along —
`QuarterBack`. `system_scope`, not `dev_scope`; it ships. See § KOSHI.

**R11 · "the hopper" is not the word you use.** You called it "the WIP directory" and
weren't sure that was its name. If the owner doesn't reach for the house word, the house
word is not working. I'd retire **hopper** and index it as **the working directory**,
which is what the scope column needs it to be anyway. Done provisionally above — say if
you want it back.

**R12 · A retired word is still alive in prose.** `co-working/user_repo/wip/buildouts/MEMORY.md:421`.
A two-word fix; say go. (The other instance lived in the LIVE manifest, which has since
been retired along with its file — and its KOTOBA row with it.)

**R13 · Should BUNKAI stay in the file?** Closed, but the word is still used in
`CLAUDE.local.md` and `landed/MANIFEST.md`. Marked `dev`, so it no longer reaches the
public file either way.

**R14 · CLOSED, and it was doing more than three jobs.** The bare word **Ronin** means the
product only. The rest are compounds, because *the operator* and *the Ronin repo* were bare
common words — the exact failure this file records for *project*, *user*, *board* and
*system*. Four links, not two: **`ronin_repo` → `ronin_artifact` → `ronin_install` →
`ronin_operator`**, with the middle two skipped today. See § THE GROUND.

**R15 · CLOSED by R20.** `project_root` and `project_repo` are separate nouns, and a
project_root is not required to be a repo — `co-working/user_repo/README/internal` stays legal.

**R16 · CLOSED — `user` is a scope and never a person.** Owner, 2026-08-14. The human is
**the_owner**, always; `user` survives only in `user_scope`, `ronin_user_root` and "the
user's own catalogs", where it means *that scope's*, not *that person's*. Renaming the
scope instead would have touched two store tables, every path and every doc for the same
result. The word that was doing two jobs now does one, and which job is on the page is
answerable by which word is there.

**Ruled with it: the_owner is not the ronin_developer.** Two roles, one human most days —
the_owner runs an install and decides what happens on it; the ronin_developer builds Ronin
itself. Their agents differ too (**owner_agent** vs **developer_agent**), and so do the
rules that bind them: the catalogs, SOPs and library are written for the first; `CLAUDE.md`,
the byoin_checks and every `dev_scope` row are the second's. The hat that is on decides which
applies, and a tenant only ever has the first.

**R17 · CLOSED — it did not.** The role catalog is deleted and its remits were
carried into the seven `session_job`s; the `session_job` *is* the role. The two axes are now two:
`project_root` (where) and `session_job` (what it is doing). The third axis is dropped from
OBOERU and TOMODACHI too (owner, 2026-08-10) — neither is built, so it cost nothing.

**R18 · DISSOLVED.** No michi names survive, so there is no shape rule to agree.

**R19 · A migrating `session_job` is no longer a key.** They now change mid-session, and two
surfaces were promised a fixed value: **OBOERU** matches once at birth, so a session that
becomes `CutCode` holds memories matched against the `session_job` it used to be; **TOMODACHI**
counts by `session_job`, so a session with three has no single value to count and needs
job-at-birth and job-now as separate fields. The plan is unaffected — a michi survives a
role change, it is the same plan either way. Worth noting the gain: migration becomes a
countable event, which is a truer funnel than `stop` (⚠R7).


---

**R20 · SETTLED — there is no bare "project".** The word meant a repo, a directory, a body
of work and a machine at once. Three nouns replace it: **project_root** (the directory, and
the key everything is partitioned by), **project_repo** (the git repo it sits in), and
**ronin_machine** (the outer limit of what an install can reach). Anything that used to say "project" now
says which one it means.

---

**R21 · CLOSED — the tab is `⌂ Roster`.** *Home* named both the surface and its first tab.
The tab now carries the roster's own name in the UI, so the tab strip reads
**⌂ Roster · ＋ New · ▤ Wipeboard** — three distinct things.

---

**R22 · SETTLED — the condition is BYOKI (病気).** The ronin_operator differing from the
ronin_repo: what is running is not what is written. Spelled without the long vowel, as
`DOHYO` (どひょう) and `ATARASHI` already are.

**It is a condition, not an event.** Nothing announces it, which is the whole difficulty — a
change reaches the operator by four mechanisms with four latencies. `public/` is served from
disk, live on reload. `src/` is read at process start, so a restart. `deploy/*.service` is
**copied** into `~/.config/systemd/user/` by `setup.sh`, so a setup run *and* a
daemon-reload. `~/.claude/settings.json` is written by `setup.sh` and read live.

It has cost us three times: the render-gate hook lived in the template for months while the
installed unit lacked it, `/staging/` served a snapshot of a deleted UI, and a commit sat
half-live — `home.js` from disk, `src/index.ts` not. The 2026-08-08 failure family exactly:
believing something of the running thing because it was true of the source.

**`DAIKUSAN.md`'s "the checkout we edit is the checkout that runs" is false**, and reads as
reassurance. True of `public/` alone.

**BYOKI is ours; the readout speaks English.** Same split as TEJUN, whose name never reaches
the ⚡ dropdown. The_owner is told *"3 changes not yet running — restart needed"*, never
*"BYOKI detected"*.

**Detection is `ronin doctor`** (`docs/atarashi/README.md`, unbuilt) — ask the operator what
it is running rather than infer it from the tree. **Interim by design, and worth building
anyway:** restoring the two skipped hops gives every artifact a version to compare, which
makes the doctor's job trivial rather than unnecessary — the units, the statusLine
registration and `node_modules/` are outside any artifact and can still drift. Artifacts are
also a round trip between changing Ronin and using it, which `DAIKUSAN.md` says to avoid
*until it is worth paying for* — so: doctor now, artifacts after the split.

---

**R23 · KOSHI has no kanji, and I will not pick one.** Every other name on the twelve
carries one; this one never has. 腰 (waist — the seat of strength, and it would sit well
beside `dohyo`) is a guess, and a guess written into this file becomes the record the moment
someone cites it. Owner's call, or leave it bare deliberately and say so here.

**R24 · KOE is `[planned]`, and the weights are unaccounted for.** Whisper weights existed on
old dohyo. Whether they reached `dohyo-unified` has not been checked, and nothing in the
house reads them today. **The word is settled; the thing is not** — which is exactly what
`[planned]` is for. Cheap direction: look for the weights before designing around them.

**R25 · `cowork` and `coworkspace` share a stem.** `RONIN_COWORK` is the repo,
`coworkspace` is the UI it ships — two terms, one grep. They are correctly related, so this
may be a feature rather than a collision; noting it because *project*, *user* and *board*
all looked harmless at this stage too.

**R26 · CLOSED — the key is `action_kind:`.** Owner, 2026-08-14: *"do the action_kind
rename. elevate the mechanical/judgement as we can."* Every `ACTIONS.md` entry carries
`action_kind: mechanical` (run it, don't deliberate) or `action_kind: judgement` (your
reasoning is the work); `ronin_bin/tejun-step` shows the tag, and MACROS.md's header now
tells the agent to read it as the pace to take a step at. Bare *kind* stays retired.

**R27 · CLOSED 2026-08-14 (all three items). The law's overreach, and the reason "scripts" felt unsettled.**
*"A tool must implement a documented action — no orphan scripts"* reads as though every
script in the house owes an action. **It only governs tools** — see § SCRIPTS. Thirty
scripts, four tools; `setup.sh` will never have an action and is not deficient for it.
Recommend the rule be narrowed to say so in `TOOLS.md` itself.

**Three things it does catch, and they are real:**

1. **CLOSED 2026-08-14** — `recall-memories` and `remember-lesson` are in ACTIONS.md and
   TOOLS.md names them. **No `—` row is left**: every tool in the house implements a
   cataloged action, so TEJUN's law now holds without exception, which is the first time
   it has been true since the law was written.
2. **CLOSED 2026-08-14.** `read_tegami`/`write_tegami` got the actions they always
   deserved (`read-letter`, `write-letter`) and moved to `ronin_bin/`: MICHI owns the
   letter, but an agent types the tool, and the shelf goes by audience. `koshi` left
   TOOLS.md entirely — it is a process, not a tool, and it lives in `libexec/` now.
3. **CLOSED — the two `orphan_script`s are gone.** `scripts/proto-recorder.mjs` and
   `scripts/proto-v2.mjs`, the DVR prototypes from the parked time-scrub work, were deleted
   2026-08-14 (owner's call; git holds them).

**R28 · `kansou` (感想) or plain `feedback`?** The three `packet_kind`s want to be house
nouns, and two already are (`tomodachi`, `tejun`), which is the case for `kansou`. Against it:
the kind is a JSON string with no reading face, so the Japanese buys consistency in the one
place nobody looks — and *feedback* is a word every user already has. **AGERU itself is
settled** (the owner's own word, 2026-08-13); this is only the third kind's name.
`co-working/user_repo/wip/buildouts/AGERU.md` § OPEN 1.

---

**R29 · CLOSED by the rename — the directory is `hostside/`.** It held one file,
`statusline-ronin.sh`, which Claude Code runs from `~/.claude/settings.json` — no cataloged
action, not agent-invoked, not a tool by our own definition, so the house had a directory
named for a term whose meaning it did not contain. **The `project`/`user`/`board` failure
caught early**, and resolved the cheap way it proposed: the directory was renamed
`hostside/` in the 2026-08-13 tweak batch.

---

**R30 · CLOSED — "gate" means the ladder rung, and nothing else.** Owner, 2026-08-13:
*"Gate is already on the user interface. It's a part of the tegami. We're not changing
that."* The repo-side sense — a check that reads the tree and fails the build — is now
**`byoin_check`** (§ THE GROUND, beside BYOIN): the owner's own frame, "the sub tests
within BYOIN". `docs/byoin.md` carries the term; `libexec/ronin-gate` and `--gates` keep
their pre-ruling filenames (an installed unit names the first). Line 61's preamble was
right that *gate* had escaped; this closes it.

**R31 · CLOSED — MIKA is a second family, and KOSHI is clean.** Owner, 2026-08-14. **A
koshi is one stateless model call over a closed question, and it never authors.** Two jobs
that had been filed under the umbrella broke that rule — filling a launch form and answering
a question about the house are both authoring — so either the laws bent or the word stopped
meaning anything. They are gone, deleted rather than annotated. KOSHI is `koshi_monitor` and
`koshi_reaper`.

MIKA takes that work as a **seated agent**: `MikaAssist`, four `mika_macro`s, spawn-or-inject,
and the law *propose, never write*. She is cowork — her macros operate on cowork's own
machinery and cowork must run alone.

**Ruled with it, all four:**

1. **Her mark is the katakana ミ**, not a kanji. She is a name, not a system noun, so the
   thing R23 will not invent for KOSHI does not arise for her.
2. **The session cap: counted, never blocked.** She takes a tile and a session_launch_spec like anything
   else, so the census counts her — but she is never the spawn the cap refuses, because
   blocking someone asking for help is rude. Eleventh of ten is legal; the cost lands on the
   *next* spawn. Nothing is evicted, and no session is chosen to die.
3. **She defaults to `system_help`.** Not "refuse and point" and not "offer to spawn" — help
   is the floor she falls back to, and the long reading list that makes it good is a later
   pass, not a blocker.
4. **She is a helpful assistant, and that goes in her `session_job`** — the posture, where
   an agent's manner is already specified, rather than a new field or a doc nobody reads.

**R32 · CLOSED — the map is `docs/SHELVES.md`, and the boot shelf delivers it.** Owner,
2026-08-15. The four shelves had no "you are here" page, so an agent never handed a
catalog could not discover that an SOP exists. It is **`docs/SHELVES.md`** — the borrowed
`HOW_TO.md` is deleted, a name carried in from the frozen tree where it meant a different
document (`public/js/docs.js` still has to tell two files of that name apart).

**CLOSED on the reach too, by the boot shelf rather than by a pointer.** `ronin_session_boot/all/`
symlinks `docs/SHELVES.md`, and `buildBrief` lists that level **at spawn**, so every
session is handed the map without anything being written down. That is a better answer
than the pointer line proposed here: a stored path — the `read:` key it replaced — goes
stale in silence the moment a file moves, while a level listed at the instant of use
cannot, because a file that is gone simply is not named. The SOP shelf's second reach
route (*found by name*) now has something behind it.

---

**Housekeeping rules for this file:** adding a term here is deliberate, like adding an
action — if two docs disagree with this file, this file wins and the docs get fixed.
Retired words are deleted, not annotated (git holds the history). One line per term; the
record column is where the detail lives, so this file never grows essays. **Every new row
gets a scope** — a row without one cannot be published or withheld correctly.
