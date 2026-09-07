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

Installation and activation are different facts. An installed provider can open a
temporary native sign-in session. The provider may ask the owner for credentials, an API
key, a subscription login, device authorization, or trust approval; Ronin does not answer
those prompts or inspect account health.

Choose **Done / Close** only after the provider's own flow is complete. That records the
provider as activated and closes the temporary session. **Close** abandons the session
without activation. One activation unlocks Teams and New Project; two activations make
Ronin Settings the next fresh Machine Settings default.

## Workspace folders

A new installation creates and registers two folders inside `RONIN_USER_ROOT`:

- **Ronin Lab** (`ronin_lab`) for ideas, assistants, research, and pre-project work;
- **Ronin Project 1** (`ronin_project_1`) for project work.

Each is a Git repository with a README and first commit. Ronin Project 1 also has the
reviewed `dev` / stable `main` arrangement and managed-worktree readiness. These defaults
do not replace or rename any external folder; the existing add/load-root flow remains.

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
next sentence and at most one action for the state Ronin measured from `GET
/api/setup/registration`, `GET /api/installed` and `GET /api/services/activation`:

| Measured | Status | The one action |
|---|---|---|
| no registration, or the read failed | Not active on this machine | Register |
| an anonymous hello only | Not active · anonymous hello sent | Register |
| the confirmation email is being requested | Sending the confirmation email… | none; re-read in 15 s |
| the email is out, unconfirmed | Confirmation email sent to p\*\*\*\*\*@example.com | Check status (`POST /api/services/activation/poll`) |
| the confirmation link expired | Confirmation link expired | Open Register |
| HQ could not be reached while sending | Waiting to send | Check status |
| entitled, parts absent | Access confirmed · Ready to install | Install Services (`POST /api/services/install`) |
| the installer is running | Installing Services… | none; re-read in 5 s |
| the installer did not start or finish | Install did not finish | Try again |
| parts present without an entitlement | Installed · not activated | the registration row's action |
| entitled and installed, switched off | Installed and activated · switched off | none; the next line names the switch |
| switched on, not yet loaded | Switched on · not yet running | none; restart Ronin |
| switched on and loaded | Active on this Cowork | none |

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
| the read is still in flight | Reading local gbrain status… (painted at once; the real read can take seconds) | none |
| the gbrain service is absent | Not installed on this machine | Open Ronin Services |
| Services installed but switched off | Installed · Ronin Services is switched off | Open Ronin Services |
| installed, but not loaded | Not installed on this machine | Load gbrain |
| the installer is running | Installing… (the surface re-reads every few seconds) | none |
| the installer failed | Install did not finish, with the log folded below | Retry install |
| loaded and answering, no model provider activated | gbrain is ready · a model provider comes first | Open Model providers |
| loaded and answering, one provider activated | Everything is good to go | Start your first Personal Assistant |
| loaded and answering, with a note (keyword-only, network reach, outside model) | Running, with a note | Start your first Personal Assistant |
| loaded and the process is silent | Installed · not running | Ask an Agent to check gbrain |
| the read itself failed | Status could not be read | Check again |

When gbrain is loaded the surface adds **What Ronin measured**: one plain sentence per
measurement saying what it means for the person (the process answers; search by meaning is
on; only this machine can reach it; no outside model is used; which accounts are linked, and
which the Personal Assistant can link, one at a time, with approval), each beside the
snapshot's own value, with the observed time and a quiet Check again. Whether accounts are
linked is read mechanically from gbrain's integrations list, never assumed. **Start your
first Personal Assistant** makes exactly the launch the Personal Assistant preset makes, a
single assistant in a new tab. The selector card's summary follows the measured state. The
Personal Assistant preset waits for gbrain to be active, and the surface says so in every
state. The pure state mapping is `public/js/gbrain-setup-state.js`; `docs/gbrain.md` holds
what gbrain is.
