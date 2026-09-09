# Get started — from the private URL to one working Agent

This guide is for an outside Agent helping the owner after installation. The one first-run
door is [Ronin Setup](setup-workbench.md), opened from **Machine Settings** at `#/setup`.
Stay beside the owner, establish one provider, prove one harmless exchange, and then hand
off. Do not answer owner choices, enter credentials, or promise behavior the screen does
not show.

## Before opening the URL

Report the URL together with its access posture: the actual bind, whether Ronin login is
enabled, and who can reach the tailnet or tunnel. If those facts are not known, return to
[the install checks](install.md#5-verify-the-running-install).

Open the printed URL. Ronin Home is the landing page; **Machine Settings** opens Ronin
Setup while the machine has zero or one activated provider. Its two-workspace setup view
pins Presets beside Register, Model providers, Workspace folders, Services, gbrain, and
Templates. These surfaces show measured state and save each choice where it lives; there
is no separate first-run form or one-time Save.

## Establish one provider

In **Ronin Setup → Model providers**, choose one Agent the owner wants and continue with
[Provider sign-in](provider-sign-in.md). An installed CLI is not activation. After the
owner completes its native flow, **Done / Close** records the explicit activation step;
**Close** does not. A real launch remains the end-to-end proof.

Do not configure every provider. Never answer a provider trust, login, billing, or
authorization dialog for the owner. Ronin remains usable without optional Services.

## Add a Workspace folder

Open **Ronin Setup → Workspace folders** and follow [Workspace folders](project-roots.md).
Choose an existing folder where the owner intends Agents to work. Inspection is local and
read-only; it does not create or clone a repository. A configured folder is required for
the proof launch.

## Prove one working Agent

1. In **＋ New**, choose the Workspace folder and one available provider/model.
2. Launch the Agent and wait for its ready prompt.
3. If authentication is requested, return to the provider route and retry after the owner
   completes it.
4. Send a harmless prompt that needs no private data or file change, such as:

   > Reply with exactly: Ronin Agent ready

Success means the new tile remains running and visibly returns the requested response. A
process existing, model label, or cleared input line alone is not success. Record the Agent
CLI, provider/model selected, and observed response—never a credential.

If launch fails, keep the tile and exact message available, confirm the CLI is installed,
re-check provider status without exposing secrets, and use a different provider only with
the owner's choice.

## Hand off

Show the owner **＋ New**, the roster, and [how to find work in the Workbench](workbench.md).
The outside Agent's installation job ends only after one successful exchange or an honest
blocked report naming the missing provider capability.
