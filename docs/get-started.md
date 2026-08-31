# Get started — from the private URL to one working Agent

This guide is for an outside Agent helping the owner after installation. Stay beside the
user through `cowork_setup`, establish one provider, prove one harmless exchange, and then
hand off. Do not answer owner choices, enter credentials, or promise post-Save behavior the
screen does not show.

## Before opening the URL

Report the URL together with its access posture: the actual bind, whether Ronin login is
enabled, and who can reach the tailnet or tunnel. If those facts are not known, return to
[the install checks](install.md#5-verify-the-running-install).

Prepare the owner for one page with two parts:

- **Shape the coworkspace:** owner and machine names, Agents, default models, maximum Agent
  sessions, and optional Services or gbrain choices.
- **Optionally start the first project:** if the owner chooses to add one now, it needs an
  existing working folder; its name and purpose may be left blank. The owner may also skip
  the project section completely.

The page shows measured machine and Agent facts beside choices. Installed Agents are facts,
not proof that their provider account is authenticated. An absent Agent with an offered
installer is a choice; an Agent Ronin cannot install has no working selection control and
says why. Ronin remains usable without optional Services.

## Walk `cowork_setup`

1. Open the exact URL printed by installation. A fresh install routes to
   `/cowork-setup`.
2. Let the owner read and answer the form. Explain consequences, but do not choose their
   machine name, identity, project folder, provider, model, session limit, paid option, or
   activation email for them.
3. Use the **When you save** panel as the review. It is the current account of answers,
   measured facts, and consequences; do not invent a hidden consequence.
4. If the owner chooses a first project, confirm its folder is the existing directory they
   intend. Folder inspection is local and read-only; it does not create or clone a
   repository. If they skip the project, do not inspect or require a folder.
5. If Services is selected, make sure the disclosed activation request and email are
   understood. Declining it sends no activation request and does not diminish Ronin.
6. The owner saves. Confirm that the coworkspace opens and report every visible install,
   sign-in, warning, or failure state exactly as shown.

Owner settings remain editable where Configuration exposes them. Measured facts are not
answers, and Services activation is not an ordinary reversible setting. Save dispatches
supported selected Agent installs and may launch the setup Agent when runnable. The
intended automatic set of post-Save installation tiles is not yet a reliable contract: use
only the tiles and states actually rendered on this machine.

## Establish one provider

Do not configure every provider. Choose one Agent the owner wants and continue with
[Provider sign-in](provider-sign-in.md). An installed CLI is not authenticated evidence;
the first launch is the universal proof when no safe status command exists.

## Prove one working Agent

1. In **＋ New**, choose the configured project root, one available provider/model, and a
   harmless session role or ordinary new session.
2. Launch it. Never answer a provider trust, login, billing, or authorization dialog for
   the owner.
3. Wait for the Agent's ready prompt. If authentication is requested, follow the provider
   route and retry after the owner completes it.
4. Send a harmless prompt that needs no private data or file change, such as:

   > Reply with exactly: Ronin Agent ready

5. Success means the new tile remains running and visibly returns the requested response.
   A process existing, model label, or cleared input line alone is not success.

Record the Agent CLI, provider/model selected, and observed response—never a credential.
If launch fails, keep the tile and exact message available, confirm the CLI is installed,
re-check provider status without exposing secrets, and use a different provider only with
the owner's choice.

## Hand off

Show the owner **＋ New**, the roster, and [how to find work in the Workbench](workbench.md).
The outside Agent's installation job ends only after one successful exchange or an honest
blocked report naming the missing provider capability. Do not claim later product guidance
or optional Services are complete merely because this route succeeded.
