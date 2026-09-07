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
