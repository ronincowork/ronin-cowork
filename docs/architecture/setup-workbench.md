# Ronin Setup — construction

For contributors: what each Setup surface shows and measures, in full. The user's page is
[Ronin Setup](../getting-started/setup-workbench.md); harness construction is in
[model providers](harness-catalog.md), and Workspaces in [Workspaces](../using-ronin/workspaces.md).

## Where it is

**Ronin Home** has the doors **Teams**, **Epics** and **Workspaces**, and the smaller stones **Setup**,
**Help** and **Settings**, with **Business Lounge** on a hosted office (owner, 26 Nov; KAN-856, w1059).
Teams, Epics and Workspaces wait for an Activated harness; the small stones are open from the start.
The Setup stone is always there; Harnesses has no stone and is reached through Setup's Harness step.
Nothing decides that Setup is finished. Settings is Settings, with no toggle to Setup. A link that names a page still opens that page.

### The ticks

Setup records nothing of its own (owner, 22 Nov; KAN-768). Each step is ticked when the
office's facts say it is done (`src/setup-progress.ts` `setupTicks`, read from the same readers the
facts print, `src/facts.ts`), and every press is a real setting or nothing. Three steps, in any
order, none a gate:

| Step | Ticked when |
|---|---|
| Harness | one of the person's own harnesses is Activated, never Ronin's house models (`harnessesOn`, the integrations_authentications fact's "Harnesses Activated") |
| Workspace | any Workspace is made, Ronin Lab included (`madeWorkspaces`, the workspaces fact; owner, 25 Nov) |
| Team | a Team has a live lead (`ledTeams`, the teams_agents fact) |

`GET /api/setup/progress` answers the steps in order with their ticks, and the machine's Tailscale
address and `no_password` for Settings' Password card; each time a fact is written they are pushed
again as `setup-progress`, so a change made anywhere ticks its step.

## The Setup workbench

The owner's onboarding prototype is the look. The selector is a walkthrough down the column, as the prototype's runs across the page: the three steps, **Harness**
(`setup.harness`), **Workspace** (`setup.roots`) and **Team** (`setup.team`, the ordinary New Team
form), and **Tour**, the Ronin Tour with no tick (`setup.tour`, setup-tour.js): one labelled drawing per part
of `docs/getting-started/tour.md` (two kinds of Agent, the toolkit, how the work runs, giving your Team
work, when you come back), each with a line or two of caption, stepped with Back and Next. While it is
open it takes both work surfaces (Workspace 1, the Ask Ronin panel, is hidden); its − or its last
Close the Tour brings back the step before it (owner, 24 Nov: "This needs to be a picture"). Each step is a numbered disc (✓ once
ticked) joined to the next by a line, its name, and one line of what it asks (`SETUP_SCENES` `line`); the
step on screen is kaki-edged. The selector's header carries the three step marks and nothing else: Setup
has no density toggle (owner, 24 Nov). The selector is the same whether she
runs or not; she has no pill of her own (it did nothing the panel does not).

**Next**, one way on (owner, 25 Nov): one foot drawn by setup-view.js and by no surface, pinned to the
foot of the step's work surface at its right (on a phone, a full-width bar at the bottom of the step),
so no form scrolls it away: "Next: Workspace", "Next: Team", "Next: Tour". Steps are not gates, so it
always moves. The one case: on Workspace with no Workspace
yet, "You'll work in Ronin Lab" beside it, and the press makes Ronin Lab (from
public/content/starter-workspaces.json, kind open) before moving on. Never on the Tour, which keeps its Back and Next.

**Changed, beside each tick** (owner, 25 Nov; w984): src/setup-progress.ts holds a switch per step, in
memory, pushed in `setup-progress` as `changed`. A write of the step's fact (harness
`integrations_authentications`, without its 'Last measured' line; workspace `workspaces`; team
`teams_agents`) that changes its text turns it on. Leaving a step (selector, Next, Tour) whose switch
is on, with her running, the view calls `POST /api/setup/left {step, to}`, and the server sends her (always her, never a session the page names) one line,
`Moved to <step>. <Left step> changed while they were on it: office read <fact>.`, and turns it off.
Off, a move tells her nothing; presses inside a step are unchanged.

Setup has no hints: no Agent vocabulary, no session controls. At the foot of the selector, where
they were, is **the step's guide**, kept thin (owner, 24 Nov): the step's title, the questions
people ask about it, each one line that opens to its answer, and its one guide doc. The title and
doc come from the step's canvas (`public/content/setup-garden.v2.json`, `garden.setup.*`, painted
with the canvas's own copy and media rows); its `asks` name questions by their wording in the
Tour's Questions, and the answers are read from `docs/getting-started/tour.md`, so the Tour stays
their one source.

The columns are the selector, the step's surface, and on the right the **Ask Ronin** panel, which
is only her: her chat, or, not running, the offer of her. Its button posts `POST /api/irasshai/open`, which shows her if she
runs, restores her archive within its seven days, or makes her fresh. Opening Setup alone does
not start her; an office starts her when none of the three steps is ticked. Moving between the
steps tells her nothing; she sees the step (Setup reports its view) and opens what it needs with
`show`. A button on a step's surface may message her, named on the button.

Registration, Installations (Ronin Services), Password and Launch are not Setup steps: their cards
stay in Settings. Install makes no Workspace and no folder; Ronin Lab is made in the Workspace step
(its "Not sure yet" door), as any Workspace is. Plans make their folder on their first
write.

On a phone the columns stack. Setup reads the ticks when it opens, again after each of its own
actions, and from the `setup-progress` push; it does not poll.

Every stone surface in Setup shares one shape: square stones on the left; select one and
the stones fold into a rail with the stone's page beside it; Escape closes it.

### The header zone

Every step opens with a band across the top of its surface, above a hairline: one line
saying what is true on this machine right now, and the choices that act on it. It states a
fact and never explains — the guidance in Workspace 1 is where the reasoning lives — and it
carries no title, because the surface already has one.

A choice does the thing, and the mark fills when the facts say the step is done. Nothing is
chosen for you: a choice shows as taken only once its setting is on.

The zone says what the step needs decided, never what one stone is doing. A stone's own
condition — *Coming soon*, *Needs sign-in*, *Activated* — stays on the stone.

Once a step is settled the band goes blank, and its space stays. That space is what holds
the stones at the same height as you move between steps, so nothing jumps. While a stone is
open the band is gone entirely: that is the step's own page, not its question.

**Password** (in Settings) never goes blank, because how you reach this machine is an arrangement you may
want to revisit rather than a one-time fact: it keeps its choices for good.

## Harnesses

One surface on two seats: Setup's Harness step (`setup-harness-surface.js`) and the Harness pages in
Settings (`harnesses-surface.js`). Both read the same measured runtime, so a change shows on both.
The CLI's own credential file is the record of a sign-in; Ronin keeps nothing beside it.

### Setup's Harness step

One bar per harness, registry order, Claude Code and Codex first, each saying **Not set up**,
**Signing in**, **Active** or **Off**.

- **Claude Code and Codex** sign in without a terminal, one way at a time: **Subscription** or
  **API key** (a new sign-in replaces the old one, as the CLI itself does). Ronin runs the CLI's own
  login command for that way (`login` in `src/agents.ts`, run by `src/harness-sign-in.ts`), reads the
  link and code it prints, and the bar shows only what the person must do: the link and code
  (Codex subscription), the link and a box for the code it gives back (Claude Code), or a key box
  (Codex API key), with **Send** and **Cancel**. When the CLI exits Ronin measures again and the bar
  turns Active; a run that did not sign in leaves the CLI's last line under the bar.
- **Other harnesses** sign in on their own terminal, opened in the bar (**Open its sign-in**,
  **Close**); `signIn` in `src/agents.ts` says what that CLI asks.
- **Hermes** shows its three model services (Ronin Gateway, API key, OpenRouter), each ticked when
  set up, and the model entries of the one pressed (`setup-hermes-services.js`). Adding or changing
  them is a link to Model services in Settings.

Keys and codes are typed only in the bar or the harness's own terminal, never in chat.

**See and Chat are one conversation.** A press goes to the Helpful Assistant, when she is live, as
the person's own line (`press.js`, drawn in her chat as "Pressed: …"), only after its route answered
OK. The rule: a press goes to her when it changes what an Agent can run on or starts something she
should follow; one that only moves around the page, or handles a secret, stays silent. So she gets
`Codex · Sign in with subscription`, `Codex · Sent the code` (never its text), `Codex · Cancel
sign-in`, `Grok · Open its sign-in` and `Grok · Close sign-in`. A result nobody pressed, the CLI
exiting, reaches her from the run itself: `Codex is signed in.` or `Codex sign-in did not finish:
<last line>`.

**Her hands.** She never presses the page. Her `harness` tool (`ronin_bin/harness`) calls the same
routes the bar calls (`sign-in`, `cancel`, `state`, `open`, `close`, and the Hermes `options` and
`option add|remove`); the route changes the record and the page redraws from its push
(`harness-sign-in`, setup progress, `model-services-changed`). A change she made sends her no press
line: the tool's answer is her confirmation. Keys are never hers to enter.

### The Harness pages in Settings

A harness's page is three numbered steps. A finished step wears a check; the next unmet step owns
the control.

| Step | What it measures | The control |
|---|---|---|
| **Install** | whether the CLI is on this machine | **Install** opens the installer in a tile on the page; a CLI Ronin cannot install safely gets an **Install guide** link |
| **Authenticate** | whether the harness is signed in here | **Authenticate** opens the CLI's own sign-in in a terminal tile, with what that CLI asks (`signIn`); **Done** under it re-measures, **Cancel** ends the terminal. While it is open the runtime reads the CLI's credential file each time it answers |
| **Ready** | activation, which unlocks Home's doors | **Turn off** stops Ronin measuring, updating and launching the harness; running tiles and the sign-in are kept. **Turn on** brings it back |

Below the steps, **Models** (`harness-model-entries.js`) picks what New Agent offers for this
harness, in two tiers. First a stone per model service: **In harness** (the CLI's own list from
the last **Refresh all harnesses**) and each service type the harness can use (`serviceTypesFor`
in `src/model-services.ts`); filled means on, and a type with no service yet reads **Not set up**
and opens Model services on its tab in the other pane. Then one table per service that is on,
Name and Model ID, a **Hide** or **Show** per row, a hidden row muted. Every press saves
(`PUT /api/new-agent-models/:cli`): a service on with nothing hidden follows its full list, so
models it adds later show by themselves. Ronin Gateway starts hidden until someone shows it.
Hermes's page is only this Models section: it has no sign-in of its own.

Ronin only checks that a sign-in exists; it never reads a credential or asks the provider about
your account.

Details of the catalog and what is measured are in [model providers](harness-catalog.md).

## Register (a Settings card)

Registration is optional; local Ronin works without it, and the step stays unticked until you
register (nothing records a decline). The form is on show until you do; registered anonymously,
**Register here** brings it back to add an email. The form asks how you would like to register — with email, or anonymously — then an email, what
brings you here, which core Ronin feature you prefer, which of the starting patterns you
are most likely to use, what describes you, where you will install, a two-line introduction
for your Cowork Agents, and anything else. The introduction stays on this machine as the
owner `ways/floor/user-intro.md` shadow of the stock-empty Behavior and is included in every
Cowork Agent's birth brief; leaving it blank removes the shadow and leaves the placeholder
empty.
Sending the form is always your own press; nothing in the header zone submits it for you.
Share only what feels useful. A registered identity is what Ronin Services entitlement
hangs on; it is not a subscription and it switches nothing on by itself. Communication
choices are separate, and **No communication** is one of them.

## Password (a Settings card)

How you reach this machine. Most people reach Ronin over Tailscale, which
is already private, so the zone says whether Tailscale is available here and asks whether
you want a password as well.

With Tailscale, the choices are **Tailscale only** and **Add password**. Without it,
**Tailscale only** is shown but not selectable — it is not an arrangement this machine can be in — and
**None** takes its place, for a machine already protected some other way. Once a password is
set the only thing left to offer is **Disable password**. **Tailscale only** and **None** are one
machine setting, `machine.no_password` (`PUT /api/password/none`), which the machine fact
prints; setting a password turns it off.

Having Tailscale does not tick this step for you. Whether Tailscale alone is enough is a
judgement about your own machine, so Setup waits for you to say.

## Workspaces

The Workspace step defines what a Workspace is, so any Agent that picks it up knows (owner, 25 Nov;
KAN-809; samurai_lab wip/SETUP_WORKSPACE.md §2). One question, **How are you starting?**, four doors
(`setup-workspace-kickoff.js`, above the Workspaces already made):

1. **From a Git repository**: their GitHub repositories (once signed in) and pasted Git URLs, many;
   each cloned into `repos/<repo>` (`POST /api/workspaces/<name>/repos`).
2. **An existing project, not in Git**: where it comes from (Google Drive, WordPress, Shopify,
   Netlify, files from their computer), each an integration row with its folder `files/<source>`.
   Nothing is pulled in here: the Team step's Epic brings it in.
3. **From scratch**: a new Git repository in `repos/<name>`, on GitHub too (private) when signed in.
4. **Not sure yet**: Ronin Lab, made on the press.

Doors 1–3 then ask what it is (objective; the name from it), its kind (open, business, personal,
household, social, school: the one list Agents, Teams and Workspaces share) and anything every Agent
there should follow (instructions). Every answer lands on the Workspace record (`src/workspaces.ts`).
Every Workspace's folder is `~/ronin/<name>`, laid out `plans/ files/ repos/` on Create, whoever
creates it (`layOut`). The Helpful Assistant does the same with her `workspace` tool (`create --kind`,
`repo`, `source`, `starter ronin_lab`).

GitHub is never a step of its own: a public repository clones without it. For a private one, or
"my repositories", the page's **Connect · Helpful Assistant** sends her "Connect GitHub.", and she
signs the GitHub CLI in with GitHub's device flow and `gh auth setup-git`, so a headless machine
shows a code the owner approves in a browser elsewhere.

## Ronin Services

There is no Services card or step (owner, 2026-11-26, KAN-914): Services ships with Cowork and
every part runs. See [Ronin Services](../getting-started/services-activation.md) and
[installations.md](installations.md).

## Launch your own (a Settings card)

Two stones:

- **Agent** opens the ordinary New Agent form here: name, kind, provider and model,
  instructions, mandate, and its behaviours.
- **Team** opens the ordinary New Team form here: the team, its agents, and where it
  works.

Each launch opens its result in a new tab. Inside a Team's own page, adding an Agent from
the roster seats the newborn in the workspace that made it instead; see
[team workspace](team-workspace.md).
