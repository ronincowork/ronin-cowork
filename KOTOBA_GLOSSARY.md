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

## Where the Japanese stops

From KOTOBA: **Ronin is the product name and goes everywhere.** Our internal system names —
**TEJUN · MICHI · TEGAMI · SHINGO · RIREKI · OBOERU · TOMODACHI · SOROBAN · KOSHI · KOE ·
DAIKUSAN · KOTOBA · AGERU · JUSHO · BYOIN · SETTEI · KYOKAI** — **stay ours.** Useful shorthand between us; a translation tax
on anyone else.

**Seventeen, and the list is KOTOBA's.** This file repeats it and may never carry an eighteenth
KOTOBA does not have. Two divergent copies is how a closed set stops being closed — it had
already happened once, which is why the list is now quoted rather than remembered.

**Words a user or their agent works with are plain English.** Nothing a third party must
learn in order to use Ronin should cost them a second language first.

---

## § ON SCREEN

| House term | Plain English | One line |
|---|---|---|
| Ronin | **Ronin** | The product. The one word anyone learns on purpose. |
| `coworkspace` | **the coworkspace** | The whole UI — every tile, panel, tab and button in it. Say *the coworkspace* for the lot, *a tile* for one cell, *the commons* for a tile with no session in it. |
| tile | **tile** | One cell of the coworkspace, showing one session. The public word for the terminal you look at. |
| pane | *(say tile)* | The tmux terminal underneath. **Machinery only** — legal where tmux's own meaning is the subject (RIREKI tapes per pane), and nowhere else. If *tile* could be substituted without making the sentence wrong, it was supposed to say tile. |
| session | **session** | One agent, one job, one name. Keeps running when you close the tab. |
| agent | **agent** | The CLI in a tile — `claude`, `codex`, `pi`, a shell script. |
| `coworking_commons` | **the commons** | The shared surface inside a tile when no session is showing. Already plain English — no translation needed. |
| `commons_tab` | **tab** | One section of the commons, reached from its tab strip. Say *the Roster tab*, *the Setup tab*. **Never "pane" or "panel"** — pane already means the tmux terminal a tile shows, and panel adds a second word for a tab. |
| SETTEI (設定) | **Setup** *(the tab)* · **your settings** *(the things in it)* | What you have set about how your Ronin behaves — your name, how many sessions may run, which folders are yours, what it is connected to. **The name SETTEI stays ours and never reaches a user's face**; the tab says **⚙ Setup**. |
| `user_customization` | **your own macros and jobs** | The recipes you write to extend what Ronin can do. Distinct from settings: **you set a setting, you write a recipe.** |
| `session_roster` | **the roster** | The commons' **⌂ Roster** tab: every session on the machine. The session list, full stop — the macro forms beside it were removed 2026-08-09. **Never "the board".** |
| `session_launch` | **launch** | The commons' **＋ New** tab. Where a session is born. |
| `wipeboard` | **wipeboard** | The commons' **▤ Wipeboard** tab and the file behind it. Our own coinage and it stays — *wipe* is right for a surface many hands write on and erase. Alias **whiteboard** only, because voice-to-text hears it that way. **Never "the board".** |
| Brief | **Brief** | Your statement of what a wipeboard is for. Agents never edit it. |
| `MDEDIT` | **the Docs tab** | The commons' **▧ Docs** tab: the documents each session is working on — buildouts, handoffs, plans — opened and edited in the tile. **MDEDIT is ours and never reaches a user's face**; on screen it is just *Docs*. Say *list a doc* for putting one there, never *track* or *attach*. There is no file browser and that is the design: ask the session to show you a file (`+show_file`) rather than going looking for one. |
| `project_root` | **project root** | A folder on the machine Ronin is allowed to work in. |
| `inclusion_list` | **the project root list** | Which folders those are. Ships empty. |
| ▦ keypad | **Pad** | Physical keys wired to macros. Optional hardware. |
| — | **Hotwords** | The words dictation keeps mishearing, sent with your voice. The **tab** is coworkspace like every UI surface; `hotwords.ts` and `ronin_catalogs/HOTWORDS.md` belong to **KOE**. |
| KOSHI | ⚠ **see § OPEN 1a** | Ronin's own agents, doing the house's internal jobs. **Reaches a user's face today** — the `目 Koshi` tab, `↻ Restart Koshi`, and body copy calling it *"your AI admin"*. |
| KOE (声) | *(no user word needed yet)* | Voice in, voice out. Unbuilt. What a user meets is the **Hotwords** tab; the name KOE stays ours. |
| locked 🔒 / unlocked 🔓 | **Locked / Unlocked** | Locked: this view is attached to the live session. Unlocked: the session is still running, this view is not attached to it. |
| AGERU (上げる) | *(no user word — the tab says what it does)* | The one door out: nothing leaves except through it, and the model provider. The name stays ours; the tab, the buttons and every label on them read plain English. **[planned]** |
| `packet_kind` | **Usage counts · Feedback · Macro submission** | The three things that can be sent. The JSON says `tomodachi` / `kansou` / `tejun`; **a user never sees those three words.** |
| `ageru_packet` | **what gets sent** | Shown in full before anything leaves, and kept afterwards. Never *your data*, never *diagnostics*, never *telemetry* — it is a file, and the sentence should say so. |
| `egress_log` | **where Ronin has connected** | Every outbound request Ronin ever made, model providers included. The honest answer to "does this thing phone home", which is a list, not a promise. |


## § WHAT IS SOLD

Base Ronin is open source. The rented capabilities on top are **`ronin_service`**, alias
**Services** — owner-ruled 2026-08-10.

| House term | Plain English | One line |
|---|---|---|
| `ronin_service` | **Services** | A rented capability on top of base Ronin: a folder, plus optionally a long-running process that reads files base already writes. Base never imports one. |

**Never** *module* (the client is 25 ES modules) · *plug-in* (OpenClaw's kojinsa-tools and
skinner) · *extension* (two live bind-mounted directories) · *applet* (RIREKI's recorder is
one). All four are taken elsewhere in this environment. *add-on* is free and is the fallback.

The stock services, from POSITIONING §5:

| Service | What it is |
|---|---|
| **the ladder** | TEGAMI + SHINGO + Koshi — **one service, indivisible.** TEGAMI does not work without Koshi, and a stale ladder is worse than none |
| **RIREKI** | the recording — and therefore unlocked mode, and therefore the good phone |
| **OBOERU** | memory. Depends on the ladder service; cannot stand alone |
| **KOE** | dictation in, spoken summaries back. Not built |
| **the Pi package** | Pi configured, fuelled and maintained |

## § THE CONTROLS ON A SESSION

| House term | Plain English | One line |
|---|---|---|
| dial (`@ronin-control`) | **Control** | Per session: you-only 👤, read 👁, read-and-write 🤖. Only the owner flips it. |
| tag / group (`@ronin-tags`) | **Groups** | Labels used to address a set of sessions at once. |
| note (`@ronin_note`) | **Note** | The owner's one line about a session. |
| `session_job` (in the letter) | **what it's doing** | The job's icon, drawn beside every session in the roster and the tile picker. Set when you start the session; the session changes it itself as its work changes. Replaced the old **leader** 人, which only ever said who was in charge — that is the 🏈 quarter back. |
| — | **Status · Ladder · Macros · Detach · Kill session** | The rest of the per-session menu. Already plain. |

## § PROGRESS AND HISTORY

| House term | Plain English | One line |
|---|---|---|
| MICHI (道) | **ladder** | Ruled in KOTOBA: never say MICHI to a user. The UI says Ladder. |
| ladder | **ladder** | What a session has done, is doing, and knows is next. |
| rung · leg · phase · gate | **rung · leg · phase · gate** | One line on the ladder; a unit of work; a group of them; a stop waiting on someone. **Leg stays** — no rename to *step*, which is taken by `tejun-step` (position in a macro run). |
| undetermined | — | Not rendered at all. The ladder never guesses ahead. |
| SHINGO (信号) | *(no user word)* | The ladder shown on a tile header. A user sees the ladder, not a name. |
| TEGAMI (手紙) | ⚠ **none — see § OPEN** | The one file a session keeps about its own work. **The only Japanese name still reaching a user's face.** |
| RIREKI (履歴) | **the recording** | Everything a pane printed, written to disk as it happens. |
| OBOERU (覚える) | **memory** | Notes that outlive the session that wrote them. |
| TOMODACHI (友達) | **Stats** | What your sessions have been doing — counts, not content. |

## § HOW WORK IS ASKED FOR

| House term | Plain English | One line |
|---|---|---|
| TEJUN (手順) | **macros** | The UI says Macros. A user never needs the word TEJUN. |
| macro | **macro** | A saved instruction you would otherwise have typed to your agent. |
| invocation | **typing a macro** | `+name: what you want`. That is the whole syntax. |
| `session_job` | ⚠ **none settled — see § OPEN** | What a session is doing now: RiffOnIt · DraftPlan · CutCode · ChaseBug · CheckWork · QuarterBack · OddJob. The seven read plainly on their own; the *category* has no user word. |
| forkit | **fork** | Split the current topic into its own session. |
| harakiri | **harakiri** | A session ends itself. Kept — it is a word people know. |

---

## § NOT TRANSLATED, DELIBERATELY

A user never meets these, so they never need an English word. Listed so nobody helpfully
translates one and creates a second vocabulary.

**Counting:** SOROBAN · tally · gauge · census · ledger · diff · derived · drop · install id
**The recording machinery:** tape · scroll · recorder · ring · settler · decoder · lens ·
faucet A / faucet B
**Files and layout:** DAIKUSAN · system_scope · user_scope · session_scope · the upgrade
test · shadowing · the session directory · build-out doc · handoff · `landed/`
**Plumbing:** shim · control-check · viewer session · scrape · compile · step tracker ·
`session_macro` · `workspace_macro` · one-way flow
**Ours only:** KOTOBA · KOSHI · SHINGO · BUNKAI · KYOKAI · `ronin_repo` · dohyo

---

## § RULED — owner, 2026-08-13

- **`coworkspace` is the whole UI** — every surface, tile, panel and button. It had no name
  at all, so the UI as a whole could not be referred to. Nests with what already existed: a
  coworkspace holds tiles; a tile with no session in it holds the commons.
- **KOSHI is the umbrella for Ronin's own agents** — `koshi_monitor`, `koshi_reaper`,
  `koshi_koe`, `koshi_summary`, `koshi_help` and whatever follows. **Internal by definition:**
  the owner never sets one up or points one at a task, which is exactly what separates a koshi
  from an `agent` (the CLI in a tile, doing the owner's work). Closes KOTOBA R10.
- **KOE is the noun for the whole voice surface** — speech to text going in, spoken summaries
  coming back, and the machinery under both. Not built. `koshi_koe` is the worker; KOE is the
  surface.
- **tile beats pane everywhere a person reads.** Strengthened from 2026-08-10: *pane* is now
  legal only where tmux's own mechanism is the subject of the sentence.
- **AGERU (上げる) is the one door out, and it ships in cowork** — not services. The free user
  is the one whose feedback we most want; a door that exists only in the paid layer only ever
  hears from people who already paid. Thirteenth name on the list.
  `co-working/user_repo/wip/buildouts/AGERU.md`.
- **A submitted macro is open source, and that is the whole deal.** Same terms as a PR to
  `ronin-cowork`: an irrevocable MIT grant, no exclusivity, no payment, and the submitter
  keeps their own copyright. *"You don't get anything for that."* The sentence renders
  literally beside the tick — never a link to terms.
- **Identity is never shared across `packet_kind`s.** Install id, reply contact and
  attribution handle are three fields with three lifetimes and no join, because one feedback
  address joined to an install id retroactively de-anonymises every drop that install ever
  sent. Binds our collector, not just the client.
- **`UCHI` (内) is retired. The word is `commons`.** It was never in `KOTOBA.md` — it had
  already been replaced there — but it outlived the rename in two comments, now fixed:
  `public/js/koshi.js:3` and `deploy/tmux-server.service:6`. UCHI is not on the list of
  Japanese names (thirteen as of 2026-08-13, when AGERU joined).

## § RULED — owner, 2026-08-10

- **tile** is the public word. *Pane* stays internal, where tmux's own meaning matters.
- **legs stay.** No rename to *step*; *step* is `tejun-step`, a different thing.
- **harakiri stays.** A word people already know.
- **`session_job`** is the surviving term for the seven. `AGENT_ROLES.md` is deleted and no
  live code mentions `agent_role`. It survives on KOTOBA's spelling law — a single common
  word is not a term, and both *role* and *kind* are single common words.
- **`ronin_service`, alias Services** is the paid unit. Never module, plug-in, extension or
  applet — all four are taken elsewhere in this environment.
- **There is no bare "board."** Two named surfaces: **the roster** and **the wipeboard**.
  Neither may ever be aliased to *board*. (KOTOBA R4.)

## § OPEN — @kotoba rules, nothing coined here

1. **TEGAMI has no English word.** `public/js/tiledrop.js` labels a menu row `TEGAMI`, and
   `public/js/tile.js`'s tooltip reads *"Read this session's TEGAMI."* The obvious word —
   *Note* — is taken by `@ronin_note`, the owner's one line about a session. Two different
   things, one candidate.

   **It is not the last one, and that claim is withdrawn** (verified 2026-08-13). **KOSHI
   reaches a user's face harder than TEGAMI does** — the tab label `目 Koshi`
   (`commons.js:53`), the button `↻ Restart Koshi` (`koshi.js:32`), and three lines of body
   copy: *"Koshi fills the rest"*, *"Koshi is NOT running. Nothing is watching any ladder."*
   and *"Say it in plain terms and Koshi your AI admin will handle the rest"*
   (`commons.js:223,227`, `koshi.js:58`).

1a. **KOSHI's English word may already exist, on screen, unnoticed: "your AI admin"**
   (`commons.js:227`). This file's own rule is *if the UI already has an English word, that
   word wins — nothing is coined here*, and that is a UI word, written by us, in front of a
   user today. Recommend ruling **AI admin** in rather than inventing anything. Nothing
   coined, only noticed.

2. **`session_job` has no user word for the category.** The seven values are fine; the
   *class* has none, so the launcher has to describe it (*"pick what it is for"*). That may
   be correct. Worth ruling it correct rather than leaving it unnoticed.

3. **Run this list against real co-working vocabulary** (owner). Co-working spaces already
   have words for much of what we built. Where a real word exists for a thing we have, take
   it rather than invent one — **but only where the mechanism matches.** *Notice board*
   matches a wipeboard: posting and reading are two deliberate acts. *The room* does not —
   it implies everyone hears everything, which is exactly what we do not do.

4. **Retired words have nowhere to live, and a planned checker expects a list.**
   `co-working/user_repo/wip/buildouts/BROKEN_TRIAGE.md:50` describes *"check-kotoba's
   retired-word list (UCHI, …)"* — but KOTOBA's housekeeping rule says **retired words are
   deleted, not annotated (git holds the history)**. Both cannot be true: a checker that
   catches a retired word needs a list of them, and the rule forbids keeping one. Either the
   rule gains an exception for a machine-read list, or `check-kotoba` reads git. Not mine to
   decide alone — it changes a housekeeping rule.
