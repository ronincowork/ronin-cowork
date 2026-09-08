# Ronin Setup — launch without a settings project

Ronin Home is the **Three Blocks** landing: **Machine Settings**, **Teams**, and
**New Project**. Machine Settings always opens. Teams and New Project remain legible but
unavailable until one model provider has been activated; focusing them explains the gate.

Machine Settings has two workbenches:

- **Ronin Setup** is the guided launch path. It opens by default with zero or one activated
  provider.
- **Ronin Settings** is the complete existing configuration workbench. It opens by default
  with two or more activated providers.

The place name in the header switches between them without reloading Ronin. An explicit
choice lasts for the current visit; the provider threshold decides the next fresh entry.

## The Setup workbench

Setup always uses two workspaces. **Presets** is pinned in workspace 1. Workspace 2 starts
with **Register** and receives the selector choices in this order:

1. Register
2. Model providers
3. Workspace folders
4. Ronin Services
5. gbrain
6. Templates

The same workbench is responsive at phone width and remains keyboard operable. It does not
switch to the retired phone-only drill-down. The phone stack comes from the window's width
alone; there is no presentation switch, and the selector header carries no controls.

While Setup is open, the right of the top header holds a subtle phone / desktop switcher
(📱 / 🖥) and a compact **light / dark** control (◐ / ☀). The switcher picks which surface is
being set; light / dark writes the Campaign's theme for that surface — the same setting the
cowork commons' Appearance control saves — and repaints. Neither changes the workspace
count, what is shown, the layout, or a width. The Setup / Settings island is unchanged.

## Activate a provider

**Model providers** shows one stone per provider in the runtime catalog, each wearing a
short measured state: **Activated**, **Sign-in open**, **Needs sign-in**, **Not
installed**, or **Manual install**. Selecting a stone opens that provider's detail beside
the rail: the same three numbered steps for every provider, in this order. A finished step
wears a check and no control, the next unmet step wears the kaki mark and owns the one
control, and a later step waits with none. A refused press shows the server's answer
under the steps.

| Step | What it measures | The action it owns |
|---|---|---|
| **Install** | whether the CLI is found on this machine | **Install** runs the catalog's own install command; a provider Ronin cannot install safely gets an **Install guide** link instead |
| **Authenticate** | whether the provider is signed in here: its own credential file is on this machine, or a sign-in was recorded through **Done** | **Authenticate** opens the provider's native sign-in as a temporary headerless tile that takes most of this workspace; **Done** records it, **Close** leaves things as they were |
| **Ready** | the resulting activation, which is what unlocks Teams and New Project | none; it is the measured result |

Ronin reads only that a credential file exists (for example Claude Code's
`~/.claude/.credentials.json` or Codex's `~/.codex/auth.json`); it never reads the
credential and never asks the provider whether the account is still good. A provider that
needs to sign in again asks in its own flow.

## Workspace folders

A new installation creates and registers two folders inside `RONIN_USER_ROOT`:

- **Ronin Lab** (`ronin_lab`) for ideas, assistants, research, and pre-project work;
- **Ronin Project 1** (`ronin_project_1`) for project work.

Each is a Git repository with a README and first commit. Ronin Project 1 also has the
reviewed `dev` / stable `main` arrangement and managed-worktree readiness. These defaults
do not replace or rename any external folder; the existing add/load-root flow remains.

In Ronin Setup one line above the stones says what a workspace is, with a kaki **Learn
more** that opens three short points: it may be a Git repository; Agents are born from it
and make their own files there; their work accumulates there. The folders are square stones on the shared stone work
surface; the first, dotted stone is **Add A Workspace**, so adding one is never below the
fold. Its page speaks in keep-or-ignore terms: the folder browser's row action is **Keep**,
the chosen path is labelled **Path**, a folder already kept says **Kept** and offers
nothing, and nothing says where an Agent will start — that belongs to a session launch, not
to the catalog. The browser lists folders with a Git repository first, under their own
line, then plain folders, because the repositories are the ones that matter. Selecting a folder opens one page about it beside the
rail, in the shape every stone detail shares: the name with its actions on the same line
(**Edit**, **Archive**, **Exclude**), one state line under it, then **Summary**, **Folder**
facts (directory, docs and plans shelves, match words), and **Repository** facts (remote,
branch, publishing flow, Worktrees) or one line saying it is not a repository. Edit replaces
the facts with the same fields under the same head, and **Save** and **Cancel** take the
actions' place on that line; nothing else on the page interacts. The Campaign's Project roots surface keeps its list of blocks with inline controls.

## Presets

Every preset has **User Message**, **Customize**, and the standard hito-in-hexagon
**Launch** action. Launch opens the result in a new browser tab. Seven shipped handles add
fixed browser controls and initial seating: Bare Metal, Code Stack Eval, Develop a New
Project, Personal Assistant, Home Health, Grokbot Morning Briefing, and Agent + Editable
Doc. The treatment follows the core handle, not its slot.

The launch view is the browser's, not the template's. When Launch returns, the preset's
fixed seating is written into the new tab before it opens: the workspace count (one, two,
or four; three sessions use four) and what each workspace holds — a session by name, the
team commons on a named tab (Home Health opens the Wipeboard in workspace 2, Grokbot the
Cron jobs), or a document beside its agent. The team page fills each workspace from that
seating as the roster arrives; a seat naming something the launch did not return is left
to the ordinary default rather than filled with a placeholder.

Replacing a slot with an ordinary template immediately removes the special controls and
seating. The replacement still has User Message, Customize, and ordinary Launch; no
template schema or backend launch contract is added.

The **You use Ronin for** row sits above the stones, and the stones themselves rest at the
same height as the Model providers stones: the row's height is taken out of the rail's top
room rather than added to it. A preset launches its template as stored, through the same
team loader the New Team form uses: each row is one of the template's agents with its
instructions, mandate, lead mark and Routine switches, and the owner's starting message
appended. A row may pick its provider and model in the line, from the launch table, the same
choices the New Agent form offers, sent as the launch's own keys; left at Default, the
launch takes the Configuration and Campaign defaults every launch uses. The preset decides only which rows launch, what they
are called, and how the new tab is seated. Bare Metal is the one exception by design: it is a
bare-metal team, `bare_metal_<code>`, whose members are the native CLI started in Ronin Lab
with the owner's words and no Ronin birth packet or mandate, seated side by side on that
team's page. One three-digit code per launch names the team and rides every row's name
(`session_1_042`), so several Bare Metals can live together. A team launch the server refuses in part, for the
session limit, a name already in use or anything else, still opens the team with whoever
was born and says beside Launch which rows are missing and why, until the next press. Only
a launch that born nobody closes the tab and fails, with the server's sentence in the same
place. A stone's gate reads the same runtime the
Model providers surface keeps current, so activating a provider unlocks the stones at once. Grokbot Morning Briefing's **When**
asks only for what its cadence needs: **Every day** a time, **Day of the week** a day and a
time, **One time** a date and a time; the schedule is written in the Cron jobs grammar
(`daily 08:00`, `weekly mon 08:00`, `once 2026-09-08 08:00`). A role's kick-off message is
one line at rest and about three while it is being edited. Code Stack Eval browses folders
here, each row saying whether it is a repository: tick any number to **Keep** and press
**Apply**, and they become workspace folders on the Workspace folders surface beside it at
once; **Evaluate** picks the one this run is about, ticking it too, since the evaluation
needs a kept folder. Nothing is kept until Apply, and a repository is kept with the
profile Ronin measured, unchanged. Develop a New Project offers the same door under its
folder choice; Personal Assistant's **Single assistant** and **Chief of Staff** are two
buttons, and Recruit appears only for the second.

## Registration and optional extras

Registration is optional for local Ronin. A submitted identity may be pending or
registered; a registered identity grants Services entitlement, but entitlement,
installation, activation, and the Routine switch remain separate facts. Newsletter,
release-update, follow-up, and **No communication** preferences are independent of
Services access.

Loaded templates and making a template work locally. **Ronin Library** and **Share Yours**
require Services entitlement. The Services, gbrain, and Templates surfaces state what each
is for, what it requires, and how to use it before showing their specialized controls.
The Services surface wears its own mark, `brand/services-mark.svg`: an R and S built from
the house hexagon and leaning with its edge, the R in the shell's reference blue, the S and
the open frame in kaki. The heading beside it carries the accessible name; the image is
decorative. The surface paints the file as an image first, then inlines the markup
from that same file, so the R's stroke reads the app's `--accent-2` token and follows the
Light/Dark toggle rather than only the OS scheme.

## Ronin Services

The Services surface opens with its mark and one lede, then **In beta**: Services is the
community half of Ronin, open code rather than open source, free to read and not to
commercialise; registering only says who is using it, and nothing is for sale. Then four
benefits — readable transcripts and the Unlocked views they allow, the template library, the
background assistant that keeps work records current, voice and team memory — then one status
line and one next sentence for the state Ronin measured from `GET /api/installed`,
`GET /api/setup/registration` and `GET /api/services/activation`. Installation and
registration are two separate facts: installed parts are shown installed and usable whether
or not anyone registered.

Beneath the status sit three controls in one shape, **Register · Install · Switch**. Register
and Install read **Done** once they are; Register opens the Register surface (or Check status
while a confirmation is out), and Install is `POST /api/services/install`, waiting for the
entitlement that route demands. Switch is a toggle, **Turn on** or **Turn off**, never Done:
it sets the Campaign's `ronin_services` Routine — the same map Routines and Installs saves —
and cascades to new teams and Agents; a team can still differ in its Team Configuration. After
a press the status says the rest, and a fourth control, **Restart**, appears for as long as
`/api/installed` reports `restart_needed`, painted kaki because it is the one thing left to do.
It is `POST /api/machine/restart`, which runs `ronin_bin/tejun-machine-restart` — the one
sanctioned restart, Ronin and nothing else; sessions live in the tmux server and stay up. A
copy of Ronin that is not the installed service (a preview, a hand-started copy) refuses with
a sentence instead of restarting the wrong Ronin. The browser reads the restart off the
machine: `/api/installed` carries the server's `startedAt`, and the control waits for it to
change before re-reading, so a restart an Agent was asked to do is noticed the same way. While
Ronin is down for the moment, the surface keeps what it painted rather than reading as
not installed.
Unlocked views and the other parts start (or stop) on their own; only new Agents are born
with the Services reading.

| Measured | Status | Controls |
|---|---|---|
| nothing installed, no registration, or the read failed | Not installed on this machine | Register · Install (waits) · Turn on (waits) |
| nothing installed, an anonymous hello only | Not installed · anonymous hello sent | Register · Install (waits) · Turn on (waits) |
| nothing installed, the confirmation email is being requested | Sending the confirmation email… | Sending… · Install (waits) · Turn on (waits); re-read in 15 s |
| nothing installed, the email is out, unconfirmed | Confirmation email sent to p\*\*\*\*\*@example.com | Check status · Install (waits) · Turn on (waits) |
| nothing installed, the confirmation link expired | Confirmation link expired | Register · Install (waits) · Turn on (waits) |
| nothing installed, HQ could not be reached while sending | Waiting to send | Check status · Install (waits) · Turn on (waits) |
| nothing installed, registered | Registered · Ready to install | Done · Install · Turn on (waits) |
| the installer is running | Installing Services… | Done · Installing… · Turn on (waits); re-read in 5 s |
| the installer did not start or finish | Install did not finish | Done · Try again · Turn on (waits) |
| parts installed, switched off | Installed · switched off, with running and installed part counts | Register or Done · Done · Turn on (· Restart while it still runs) |
| parts installed, switched on, not yet loaded | Switched on · not yet running | Register or Done · Done · Turn off · Restart; re-read in 5 s |
| parts installed, switched on and loaded | Active on this Cowork, with running and installed part counts | Register or Done · Done · Turn off |

The selector card's summary follows the same state. The Grokbot Morning Briefing preset waits
for Services to be active, and the surface says so in every state. The pure state mapping is
`public/js/services-setup-state.js`; `docs/services-activation.md` holds the activation flow
itself.

## gbrain

The gbrain surface is the Setup presentation of the cowork commons gbrain tab: the same
`GET /api/gbrain` read and the same Load press, painted as three questions with plain
answers and one control each, then the one next step. Nothing on it is asserted; every
answer is measured.

| Question | Answer | The one control |
|---|---|---|
| **Installed** | Checking… · Not installed · Installed · running · Installed · not running · Installed · Ronin Services is switched off · Install did not finish · Could not read | Load gbrain · Retry install · Open Ronin Services · Ask an Agent to check gbrain · Check again, by state; none while installing |
| **Available to Agents** | Default for all Agents · Only selected Agents | the Campaign's own gbrain Routine, saved the way Routines and Installs saves it; selected Agents get it in Team Configuration or on the New Agent form |
| **Accounts linked** | one row per account gbrain can link, Linked or Not linked | none here: the Personal Assistant links one when asked, with approval |

Which accounts exist and whether each is linked is read from gbrain's own integrations
list (Gmail, Google Calendar, X, meeting transcripts on a stock install). Below the
answers sits the next step: with gbrain running and no model provider activated, *A model
provider comes first* and **Open Model providers**; with one activated, *Everything is good
to go* and **Start your first Personal Assistant**, which makes exactly the launch the
Personal Assistant preset makes, a single assistant in a new tab. The surface paints at
once and says Checking… until the read lands; the pure state mapping is
`public/js/gbrain-setup-state.js`, and `docs/gbrain.md` holds what gbrain is.
