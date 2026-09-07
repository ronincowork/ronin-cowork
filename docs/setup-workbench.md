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
switch to the retired phone-only drill-down.

## Activate a provider

**Model providers** shows one stone per provider in the runtime catalog, each wearing a
short measured state: **Activated**, **Sign-in open**, **Needs sign-in**, **Not
installed**, or **Manual install**. Selecting a stone opens that provider's detail beside
the rail: the same four rows for every provider, in this order.

| Row | What it measures | The action it owns |
|---|---|---|
| **Use with Ronin** | the persisted opt-in for this provider, kept with the Setup preferences | the checkbox |
| **Install** | whether the CLI is found, with its path when it is | **Install** runs the catalog's own install command; a provider Ronin cannot install safely gets a guide link instead |
| **Authenticate** | whether Setup completion was recorded | **Authenticate** opens the provider's native sign-in as a temporary tile in this workspace, once the provider is opted in and installed |
| **Ready** | the recorded activation | none; it is the measured result |

Installation and activation are different facts. The provider's own flow may ask the
owner for credentials, an API key, a subscription login, device authorization, or trust
approval; Ronin does not answer those prompts or inspect account health.

Choose **Done / Close** only after the provider's own flow is complete. That records the
provider as activated and closes the temporary session. **Close** abandons the session
without activation. Ronin does not monitor the provider's sign-in afterwards; if the
provider needs it again, it asks in its normal flow. One activation unlocks Teams and New
Project; two activations make Ronin Settings the next fresh Machine Settings default.

## Workspace folders

A new installation creates and registers two folders inside `RONIN_USER_ROOT`:

- **Ronin Lab** (`ronin_lab`) for ideas, assistants, research, and pre-project work;
- **Ronin Project 1** (`ronin_project_1`) for project work.

Each is a Git repository with a README and first commit. Ronin Project 1 also has the
reviewed `dev` / stable `main` arrangement and managed-worktree readiness. These defaults
do not replace or rename any external folder; the existing add/load-root flow remains.

In Ronin Setup one line above the stones says what a workspace is, in three terms: it may
be a Git repository; Agents are born from it and start making their own files in it; and
their work accumulates there. The folders are square stones on the shared stone work
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

Replacing a slot with an ordinary template immediately removes the special controls and
seating. The replacement still has User Message, Customize, and ordinary Launch; no
template schema or backend launch contract is added.

## Registration and optional extras

Registration is optional for local Ronin. A submitted identity may be pending or
registered; a registered identity grants Services entitlement, but entitlement,
installation, activation, and the Routine switch remain separate facts. Newsletter,
release-update, follow-up, and **No communication** preferences are independent of
Services access.

Loaded templates and making a template work locally. **Ronin Library** and **Share Yours**
require Services entitlement. The Services, gbrain, and Templates surfaces state what each
is for, what it requires, and how to use it before showing their specialized controls.
The Services surface wears its own mark, `brand/services-mark.svg`: an R and S monogram
inside the house hexagon, drawn in code in the same kaki as the hito mark, so it reads on
both shells. The heading beside it carries the accessible name; the image is decorative.

## Ronin Services

The Services surface opens with what Services adds — the template library, the background
assistant that keeps work records current, voice and team memory — then one status line, one
next sentence and at most one action for the state Ronin measured from `GET /api/installed`,
`GET /api/setup/registration` and `GET /api/services/activation`. Installation and
registration are two separate facts. Installed parts are shown installed and usable whether
or not anyone registered; registration is an optional account line beneath, never a gate.

| Measured | Status | The one action |
|---|---|---|
| nothing installed, no registration, or the read failed | Not installed on this machine | Register |
| nothing installed, an anonymous hello only | Not installed · anonymous hello sent | Register |
| nothing installed, the confirmation email is being requested | Sending the confirmation email… | none; re-read in 15 s |
| nothing installed, the email is out, unconfirmed | Confirmation email sent to p\*\*\*\*\*@example.com | Check status (`POST /api/services/activation/poll`) |
| nothing installed, the confirmation link expired | Confirmation link expired | Open Register |
| nothing installed, HQ could not be reached while sending | Waiting to send | Check status |
| nothing installed, registered | Registered · Ready to install | Install Services (`POST /api/services/install`) |
| the installer is running | Installing Services… | none; re-read in 5 s |
| the installer did not start or finish | Install did not finish | Try again |
| parts installed, switched off | Installed · switched off, with running and installed part counts | none; the next line names the switch |
| parts installed, switched on, not yet loaded | Switched on · not yet running | none; restart Ronin |
| parts installed, switched on and loaded | Active on this Cowork, with running and installed part counts | none |

With parts installed, the account line says *Registration is optional. It unlocks the
template library and the hosted parts.* with a quiet Register, or the registration state
in flight with its own quiet action, or *Registered* with none.

The selector card's summary follows the same state. The Grokbot Morning Briefing preset waits
for Services to be active, and the surface says so in every state. The pure state mapping is
`public/js/services-setup-state.js`; `docs/services-activation.md` holds the activation flow
itself.

## gbrain

The gbrain surface is the Setup presentation of the cowork commons gbrain tab: the same
`GET /api/gbrain` read and the same Load press, painted as value first, then one measured
status. It opens with what gbrain gives (find by meaning, shared recall, stays local) and a credit to the upstream project, then one status line, one next sentence
and at most one action for the state Ronin measured:

| Measured | Status | The one action |
|---|---|---|
| the gbrain service is absent | Not installed on this machine | Open Ronin Services |
| Services installed but switched off | Installed · Ronin Services is switched off | Open Ronin Services |
| installed, but not loaded | Not installed on this machine | Load gbrain |
| the installer is running | Installing… (the surface re-reads every few seconds) | none |
| the installer failed | Install did not finish, with the log folded below | Retry install |
| loaded and the local process answers | Running on this machine | Start with Personal Assistant |
| loaded and the process is silent | Installed · not running | Ask Personal Assistant to check gbrain |
| the read itself failed | Status could not be read | Check again |

When gbrain is loaded the surface adds **Measured now**: local process, local embeddings,
reach, outside model use and integrations, each the snapshot's own value, with the observed
time and a quiet Check again. The selector card's summary follows the measured state. The
Personal Assistant preset waits for gbrain to be active, and the surface says so in every
state. The pure state mapping is `public/js/gbrain-setup-state.js`; `docs/gbrain.md` holds
what gbrain is.
