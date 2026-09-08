# Ronin Setup

Ronin Setup is where a new installation becomes a running one: connect a model provider,
keep a folder or two, and launch. Nothing here asks you to configure Ronin to a personal
specification first.

## Where it is

**Ronin Home** is three blocks: **Machine Settings**, **Teams**, and **New Project**.
Machine Settings always opens. Teams and New Project stay legible but unavailable until
one model provider is activated; focusing either one says so.

Machine Settings holds two workbenches. **Ronin Setup**, this guide, opens by default
while zero or one provider is activated. **Ronin Settings**, the full configuration
workbench, opens by default once two or more are. The place name in the top bar switches
between them without reloading; an explicit choice lasts for the visit.

## The Setup workbench

Setup is one workbench with two workspaces and a selector column between them:

- **Workspace 1** always holds **Presets**.
- **The selector** lists the setup surfaces in this order: Model providers, Register,
  Workspace folders, Ronin Services, gbrain, Launch your own. Each card carries a one-line
  state, never an explanation.
- **Workspace 2** shows the selected surface. Setup opens on Model providers until a
  provider is activated; after that it remembers the surface you left open.

On a phone the same three columns stack. While Setup is open, the right of the top bar
holds a phone / desktop switcher and a light / dark control; they set the appearance of
that surface and nothing else.

Every stone surface in Setup shares one shape: square stones on the left; select one and
the stones fold into a rail with the stone's page beside it; Escape closes it.

## Presets

Presets are eight quick starts. Each is an ordinary template with a small, fixed set of
choices in front of it and a launch that opens in a new browser tab.

Above the stones, **You use Ronin for** narrows the eight to a purpose: **Build software**
(Bare Metal, Ronin Team, Code Stack Eval, Develop a New Project), **Life Assistants**
(Personal Assistant, Home Health, Agent + Editable Doc), **Research and writing** (Grokbot
Morning Briefing, Personal Assistant, Bare Metal), or **All Sample Presets**. The choice is
remembered.

Selecting a stone opens its page: the name, its one line, its own choices, an **Initial
message to agent** (every preset except Bare Metal), and **Launch**. There is no separate
customize step; to shape a launch beyond these choices, use Launch your own.

| Preset | What launches | Its choices |
|---|---|---|
| **Bare Metal** | a bare-metal team: the native provider CLIs themselves, no Ronin packet, three by default | one row per session, each with a provider and model; tile layout |
| **Ronin Team** | a Team Lead and two agents in the full Ronin team room | **Where**; the rows, each with a provider and model |
| **Code Stack Eval** | a team that reads a codebase and reports on the stack | which folder to evaluate |
| **Develop a New Project** | a project lead and feature agents, each in its own worktree | **Where**; the feature rows |
| **Personal Assistant** | one assistant that remembers, or a Chief of Staff that recruits | **Single assistant** or **Chief of Staff**; for the second, who to recruit |
| **Home Health** | Head Coach, Nutritionist, Race and Event Guide | each role's kick-off message; remove or add roles |
| **Grokbot Morning Briefing** | a briefing written on a schedule you set | **When**: every day, a day of the week, or one time; what it looks at |
| **Agent + Editable Doc** | one coding agent beside a document you both edit | **Where** and which document |

**Gates.** Every preset needs one activated model provider. Personal Assistant also needs
gbrain running; Grokbot Morning Briefing also needs Ronin Services active. A gated stone
still opens; its Launch is held and a line beside it says what is missing. Activating the
provider unlocks the stones at once.

**Where.** Ronin Team, Develop a New Project and Agent + Editable Doc ask where to start:
every workspace folder Ronin keeps, Ronin Lab and Ronin Project 1 first and Ronin Lab
chosen by default, then the rest by name — the same list the Workspace folders surface
shows. **＋ workspace folder** beside it opens Workspace folders in the next workspace; a
folder kept there is a choice at once, with your choice and typed message left as they
were.

**Rows.** On Bare Metal, Ronin Team and Develop a New Project each row is one session:
its name, and a provider and model picked in the line from the same catalog the Agent and
Team forms use, with what this machine cannot launch greyed. Left at Default, a row takes
the machine's configured defaults.

**Bare Metal, in particular.** Each press makes a team named `bare_metal_<code>`, a
three-digit code that also rides every session name (`session_1_042`), so several can run
side by side. Its members are the native CLIs, started in Ronin Lab with your words and
nothing of Ronin's; the team's Ronin base and worktrees are off. Ronin Team is the same
shape with Ronin agents and the usual team defaults, started in the folder chosen under
Where. Both open their team page with the team's configuration top-right and the centre
column kept narrow: Ronin Team seats its Team Lead top-left and Agent 1 and Agent 2 below,
whatever order they were born in; Bare Metal seats its sessions top-left and below.

**Code Stack Eval's folders.** The page browses your folders and says which are
repositories. Tick any number to **Keep** and press **Apply**: they become workspace
folders at once, on the Workspace folders surface beside you. **Evaluate** picks the one
this run is about and keeps it too. Nothing is kept until Apply.

**What opens.** Launch opens the new team or agent in a new tab, already seated: Home
Health puts the Head Coach top-left and the Wipeboard beside it; Grokbot seats the agent,
its Cron jobs and the briefing; Agent + Editable Doc seats the agent beside the document.

**When something is refused.** If the machine's session limit, a name already in use, or
anything else stops a row, the team still opens with whoever was born and a line beside
Launch names the missing rows and why. Only a launch that born nobody closes the tab, and
the reason sits in the same place.

## Model providers

One stone per provider CLI Ronin knows, each wearing its state: **Activated**, **Sign-in
open**, **Needs sign-in**, **Not installed**, or **Manual install**. Opening this surface
measures the machine, so its facts are current when you look.

A provider's page is three numbered steps. A finished step wears a check and no control;
the next unmet step owns the one control; a later step waits.

| Step | What it measures | The control |
|---|---|---|
| **Install** | whether the CLI is on this machine | **Install** runs the provider's own install; a provider Ronin cannot install safely gets an **Install guide** link |
| **Authenticate** | whether the provider is signed in here | **Authenticate** opens the provider's own sign-in in a tile on this surface; **Done** records it, **Close** leaves things as they were |
| **Ready** | activation, which unlocks Teams, New Project and the preset stones | none; it is the result |

Below the steps sits what the catalog knows about the provider: its models, their tier and
cost as read, and the default. Ronin only checks that a sign-in exists; it never reads a
credential or asks the provider about your account. A provider that needs to sign in
again asks in its own flow.

Details of the catalog and what is measured are in `docs/model-providers.md`.

## Register

Registration is optional; local Ronin works without it. The form asks for an email, what
brings you here, which core Ronin feature you prefer, which of the starting patterns you
are most likely to use, what describes you, where you will install, and anything else.
Share only what feels useful. A registered identity is what Ronin Services entitlement
hangs on; it is not a subscription and it switches nothing on by itself. Communication
choices are separate, and **No communication** is one of them.

## Workspace folders

A workspace folder is a folder Ronin keeps for Teams and Agents to start in. A new
installation makes two inside Ronin: **Ronin Lab** for ideas, assistants, research and
pre-project work, and **Ronin Project 1** for project work, prepared for worktrees. Each
is a Git repository with a README and a first commit. Neither replaces or renames any
folder of yours.

The surface shows the folders as stones, with **Add A Workspace** first. Adding one is a
keep-or-ignore decision: browse, and **Keep** the folder you want. Folders with a
repository are listed first. Selecting a stone opens its page: name and actions
(**Edit**, **Archive**, **Exclude**), one state line, then its summary, folder facts and
repository facts. More in `docs/project-roots.md`.

## Ronin Services

Services is the community half of Ronin, in beta: readable transcripts and the Unlocked
tile views, the template library, the background assistant that keeps work records
current, voice, and team memory. Registering says who is using it; nothing is for sale.

The surface shows one measured status line and three controls in one shape:
**Register**, **Install**, and a **Turn on / Turn off** switch. Register and Install read
**Done** once they are. Installing needs a registered identity; switching on cascades to
new Teams and Agents, and a Team can still differ in its own configuration. When a restart
is the one thing left to do, a fourth control, **Restart**, appears until Ronin is back.
Installed parts are usable whether or not anyone registered. The Grokbot Morning Briefing
preset waits for Services to be active. The activation flow itself is in
`docs/services-activation.md`.

## gbrain

gbrain is the memory the Personal Assistant runs on. The surface is three questions with
measured answers and one control each: **Installed** (with **Load gbrain**, or the one
step the state calls for), **Available to Agents** (default for all Agents, or only
selected ones), and **Accounts linked** (one row per account gbrain can link; the
Personal Assistant links one when asked, with your approval). Under them sits the next
step: **Open Model providers** if none is activated yet, otherwise **Start your first
Personal Assistant**, the same launch the preset makes. What gbrain is lives in
`docs/gbrain.md`.

## Launch your own

Three stones for anything the presets do not cover:

- **Agent** opens the ordinary New Agent form here: name, kind, provider and model,
  instructions, mandate, and the Routines it runs with.
- **Team** opens the ordinary New Team form here: the team, its agents, and where it
  works.
- **Template** opens Templates: what is on your system, shipped with Ronin, installed, or
  saved by you, ready for the Agent and Team forms. The Ronin library and sharing your own
  come with Ronin Services.

Each launch opens its result in a new tab. Inside a Team's own page, adding an Agent from
the roster seats the newborn in the workspace that made it instead; see
`docs/team-workspace.md`.
