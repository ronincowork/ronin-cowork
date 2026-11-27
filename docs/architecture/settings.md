# Settings

Settings is the place someone deliberately visits to change how this office works, or to find out
what happened. There is one Settings (owner, 2026-11-26): Home's ⚙ **Settings** stone. A link from
elsewhere opens the relevant card directly. Code: `public/js/settings-v2-view.js` (the route keeps
its build name, `settings2`), cards in `public/js/workbench-catalog.js` (profile `settings2`).

On screen it is the **office**, never "Campaign" or "Desk" (those stay in code). There are no hints
at the foot of the selector.

## The sections

A heading over the first card of each, with a section's space between them.

| Section | What someone came to do | Cards |
|---|---|---|
| Harnesses and models | sign in to a harness, connect a model service, choose the models a harness offers | **Harness** stones (install, sign in, ready; a harness's page has its Models section). **Model services**: one card, three tabs: Ronin Gateway (comes configured, its model list only), API key and OpenRouter (each a Configure section and a Model entries section). See [model_services_README.md](model_services_README.md) |
| Office defaults | change what new Agents and Teams start with | **Agent defaults**: the starting models (Agent, Team lead), then mandate, launch mode and included behaviors |
| Workspaces and integrations | change where a project lives, or set up an outside service | **Workspaces**: the Workspace stones; each opens its Configuration, **+ New Workspace** opens the four ways. **Integrations**: every outside service, one record each, Jira among them ([integrations.md](integrations.md)) |
| Advanced | edit the actual instructions, or read what is on this machine | **Behavior files** (read and edit behavior, fact and tool files), **Machine status** (the generated report), **Machine stats** (tool-call activity, with its collection period), **Explorer** (the home folder, where it runs) |

Feedback and a document reader (a behavior file's read glyph opens it beside) are on the selector
as on every workbench. The forms follow the New Agent form pattern (`createStep`: numbered sections
that fold) and lists the table pattern (`data-table.js`).

## Defaults are inherited at birth

A default saved in Office defaults reaches what is made next: a Workspace made tomorrow starts with
it; a Team made tomorrow inside an older Workspace starts with that Workspace's own saved default;
an Agent with its Team's. Nothing that already exists changes ([brief.md](brief.md), inherit at
birth). The card says this with that example. Choosing which behaviors new Agents receive (Agent
defaults) is a separate task from changing a behavior file's text (Behavior files).

## Links into Settings

| From | Opens |
|---|---|
| A harness's Models section, Setup's Hermes bar | Model services, on the service's tab (`modelServicePageRequest(tab, id)`) |
| New Agent's and the Teams page's Desk defaults | Agent defaults |
| A Workspace's folder action | Workspaces |

## What is not in Settings

- The account, the office lease, add-ons and any password: the **Business Lounge** (hosted). A
  self-hosted machine is reached over the tailnet; there is no password setting.
- Light or dark: the header's theme button, on every page.
- Archived Agents (Teams), the keypad (the bar), Mika (Help), New Team and New Agent (Teams).
- Ronin Services: it ships with Cowork and every part runs; there is nothing to install or switch
  ([installations.md](installations.md)).

Retired with the old Settings: the Machine card (Themes, Desk, Account, Archived, Messages, Help
desk, Keypad), Cloud Account, Password, Register, Installations, Launch your own, the Desk card and
New Desk, and the separate Jira card.
