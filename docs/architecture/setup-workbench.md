# Ronin Setup — construction

For contributors: what each Setup surface shows and measures, in full. The user's page is
[Ronin Setup](../getting-started/setup-workbench.md); provider construction is in
[model providers](model-providers.md), and Workspaces in [Workspaces](../using-ronin/workspaces.md).

## Where it is

**Ronin Home** has the doors **Teams**, **Epics** and **Workspaces**, and the smaller stones
**Model Providers**, **Help** and **Settings**. Settings opens **Ronin Setup** until Setup is
done (below), and **Ronin Settings**, the full configuration workbench, after that. Teams, Epics, Workspaces and Model Providers wait for a model provider; Help
is open from the start.

Opening Ronin at its bare address, with no page named, lands on **Ronin Setup** until Setup
is done, and on Home after that (KAN-720). On a hosted office, done is the Helpful Assistant's
onboarding epic reaching Done. Everywhere else it is the model provider and Workspaces steps
being ticked; the other three are optional. A link that names a page still opens that page.

### The ticks

Setup records nothing of its own (owner, 22 Nov; KAN-768). Each step is ticked when the
office's facts say it is done (`src/setup-progress.ts`, read from the same readers the facts
print, `src/facts.ts`), and every press is a real setting or nothing:

| Step | Ticked when |
|---|---|
| Model providers | a provider is Activated (the integrations_authentications fact) |
| Register | this machine is registered, by email or anonymously (the machine fact) |
| Workspaces | a Workspace has a folder (the workspaces fact; machine settings' still needed says the same) |
| Installations | anything is installed: a Services part, or an installation switched on (the machine fact) |
| Password | a password is set, or the owner's **Tailscale only** (or **None**) setting is on: `machine.no_password` in machine settings, which the machine fact prints |

`GET /api/setup/progress` answers the ticks and the machine's Tailscale address; each time a
fact is written they are pushed again as `setup-progress`, so a change made anywhere ticks its step.

### Going back to Setup

**Ronin Settings → Machine Settings** keeps a **Setup** card at the head of its column: the
word, then five numbered marks, one for each step Setup asks about — model provider,
registration, Workspaces, Installations, and password. A mark is hollow until that step is
ticked (The ticks, above) and filled once it is; the outlined mark is the step Setup will open
on.

Widen the column, or switch the selector to its fuller cards, and the card also names that
step. Once all five are ticked the marks go and the card reads **Setup Complete**. It
stays where it is, so any step can be opened again whenever you want it.

## The Setup workbench

Setup is one workbench with two workspaces and a selector column between them:

- **Workspace 1** holds the Garden Canvas: short authored guidance for the selected step.
- **The selector** lists Model providers, optional registration, Workspaces,
  Installations, and Launch. A check means the step's actual completion fact is true.
- **Workspace 2** is the actionable surface for the selected step. Selecting a card changes
  both workspaces together.

On a phone the same three columns stack. Setup reads the ticks when it opens, again after
each of its own actions, and from the `setup-progress` push; it does not poll.

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

**Password** never goes blank, because how you reach this machine is an arrangement you may
want to revisit rather than a one-time fact: it keeps its choices for good.

## Model providers

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

## Register

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

## Password

How you reach this machine is the last step. Most people reach Ronin over Tailscale, which
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

The Workspace step is the Workspaces themselves (KAN-728): Ronin keeps no folder list of its
own, so every folder Setup adds is a row of a Workspace record (`src/workspaces.ts`). A new
installation makes two Workspaces inside Ronin (`placeInstalledRoots`, made once each):
**Ronin Lab** for ideas, assistants, research and pre-project work, holding the folder
`ronin_lab`, and **Project One** for project work, holding the repository `project_one`,
Reviewed (working `dev`, stable `main`). Your Lab is a general thinking space, not the code
repository for a specific project. Each folder is a Git repository with a README and a first
commit.

The surface shows the Workspaces as stones (`createWorkspaceStones`, `withNew`), with a **New
Workspace** stone last. Pressing a stone opens the Workspace's page, the same page as the
Workspaces door's ([Workspaces](../using-ronin/workspaces.md)): Summary, Folders with **Add a
folder** and **Clone from GitHub**, then Integrations, Agent info and Behaviors; Archive under ⋯.
New Workspace is its Name and its Folders, then Create; the made Workspace opens in its place.

**Authenticate GitHub** follows three measured steps: **Install**, **Authenticate**, and
**Ready**. If `gh` is absent, one Install button opens a visible temporary provider-style
terminal and runs the supported package-manager path for this macOS or Linux machine; the
owner can see its output and answer a system privilege prompt. Authenticate then offers two
paths: **Use GitHub CLI with Mika** opens the native `setup_github` terminal while Mika reads
that session in the opposite tilespace and guides the owner; **Let Mika connect GitHub** puts
Mika in the current tilespace to run the CLI herself. Both use GitHub's browser/device flow,
so a headless machine shows a code that the owner approves in a browser elsewhere. A connected
account is named and offers **Remove authentication**;
removal deletes that account's saved GitHub CLI login from this machine but does not revoke
the account's GitHub tokens.

## Ronin Services

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

## Launch your own

Two stones:

- **Agent** opens the ordinary New Agent form here: name, kind, provider and model,
  instructions, mandate, and its behaviours.
- **Team** opens the ordinary New Team form here: the team, its agents, and where it
  works.

Each launch opens its result in a new tab. Inside a Team's own page, adding an Agent from
the roster seats the newborn in the workspace that made it instead; see
[team workspace](team-workspace.md).
