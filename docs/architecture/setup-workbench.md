# Ronin Setup — construction

For contributors: what each Setup surface shows and measures, in full. The user's page is
[Ronin Setup](../getting-started/setup-workbench.md); harness construction is in
[model providers](model-providers.md), and Workspaces in [Workspaces](../using-ronin/workspaces.md).

## Where it is

**Ronin Home** has the doors **Teams**, **Epics** and **Workspaces**, and the smaller stones
**Harnesses**, **Help** and **Settings**. Teams, Epics and Workspaces wait for an Activated
harness; Help is open from the start.

**One Setup, on every office** (owner, 24 Nov; w926; samurai_lab wip/SETUP_SWEEP.md §7): nothing
decides that Setup is finished, and nothing in Setup branches on hosting. The bare address goes Home;
Home shows a **Get started** stone, opening Setup, while any of the three steps is unticked; Settings
is Settings. A link that names a page still opens that page.

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
always moves. Each press reaches her, when she runs, as the person's one line (owner, 25 Nov): `Next: Team`, or `Next: Team; made Ronin Lab, in ~/ronin/ronin_lab`. The one case: on Workspace with no Workspace
yet, "You'll work in Ronin Lab" beside it, and the press makes Ronin Lab (from
public/content/starter-workspaces.json, kind open) before moving on. Never on the Tour, which keeps its Back and Next.

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

One stone per provider CLI Ronin knows, each wearing its state: **Activated**, **Off**,
**Sign-in open**, **Needs sign-in**, **Not installed**, or **Manual install**. Opening this surface
paints the recorded facts immediately, then measures behind them and repaints when it lands.

A provider's page is three numbered steps. A finished step wears a check; the installed
step also offers Update only when an activated provider has a newer version available and
the registry knows how to update it. The next unmet step owns the setup control; a later
step waits.

| Step | What it measures | The control |
|---|---|---|
| **Install** | whether the CLI is on this machine | **Install** opens the provider's installer and first-run setup in a tile on this surface; a provider Ronin cannot install safely gets an **Install guide** link |
| **Authenticate** | whether the provider is signed in here | **Authenticate** opens the provider's own sign-in in a tile on this surface, on its terminal; the step says how that CLI's sign-in goes (its methods and what to press: `signIn` in `src/agents.ts`, one line per provider, read off the CLI's own screens; KAN-716), then "Signed in? Press Done." **Done** sits right under the terminal, full width, and records it; **Cancel** ends the terminal session. The naming (title and type) comes after Done, already filled with "<provider> subscription" and Account / subscription, so Done never waits on it. While the sign-in is open, the runtime reads the CLI's credential file each time it answers, and the page asks again when you come back to its tab. Once the file is there, the step says the provider is signed in (KAN-723) |
| **Ready** | activation, which unlocks Home's doors | **Turn off** stops Ronin measuring, updating and launching the provider — tiles already running are not touched and the sign-in is kept; **Turn on** brings it back, and nothing needs signing in again |

The install window can continue directly into the provider's sign-in. The temporary
terminal has a normal tmux shell: exiting the CLI returns to its prompt. Installation,
provider authentication, and GitHub setup all use this pattern.

Under the terminal, **Naming this authentication** has a free-text **Authentication title**
and an **Authentication type** stone. Open the stone to choose **Account / subscription**,
**API key**, **Third-party service**, or **Not signed in**; the choices collapse after selection.
The title can be anything meaningful to you, such as “Personal Google” or “Work OpenRouter”.
**Done** saves the title and type and finishes setup. **Cancel** ends the temporary session
without requiring or saving those fields; it does not undo installation or credentials
already saved by the CLI. Both buttons sit together below the fields.

Ronin saves this description separately from credentials, then checks readiness again.
The terminal height is bounded, and opening a provider scrolls its detail panel to the
first unfinished step. This works in both Ronin Setup and Ronin Settings.

Below the steps sits the provider's model list as its CLI gave it on the last **Refresh
all model providers** (the one button at the top of the surface, with the date it last
ran), each model with the CLI's own name and its id, and the tier and cost the catalog
knows. Native is the default. Ronin only checks that a sign-in exists; it never reads a
credential or asks the provider about your account. A provider that needs to sign in
again asks in its own flow.

Details of the catalog and what is measured are in [model providers](model-providers.md).

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

## Ronin Services (a Settings card)

Services adds optional capabilities. The page reports what is installed and enabled on
this machine. Terminal transcript needs both the package and its switch; local weights are
currently parked, and source presence alone does not make a feature available. See [Ronin Services](../getting-started/services-activation.md)
for installation, registration, availability, and data sharing.

The surface shows one measured status line and three controls in one shape:
**Register**, **Install**, and a **Turn on / Turn off** switch. Register and Install read
**Done** once they are. Installing needs a registered identity; switching on cascades to
new Teams and Agents, and a Team can still differ in its own configuration. When a restart
is the one thing left to do, a fourth control, **Restart**, appears until Ronin is back.
Nothing on the page polls: a confirmed email, each install step and a switch's new facts
arrive as Ronin learns them, and after a restart the page reads again when its connection
to Ronin returns.
Installed parts are usable whether or not anyone registered. The activation flow itself is in
`docs/getting-started/services-activation.md`.

## Launch your own (a Settings card)

Two stones:

- **Agent** opens the ordinary New Agent form here: name, kind, provider and model,
  instructions, mandate, and its behaviours.
- **Team** opens the ordinary New Team form here: the team, its agents, and where it
  works.

Each launch opens its result in a new tab. Inside a Team's own page, adding an Agent from
the roster seats the newborn in the workspace that made it instead; see
[team workspace](team-workspace.md).
