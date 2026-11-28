# Ronin Setup — construction

For contributors: what each Setup surface shows and measures, in full. The user's page is
[Ronin Setup](../getting-started/setup-workbench.md); harness construction is in
[model providers](harness-catalog.md), and Workspaces in [Workspaces](../using-ronin/workspaces.md).

## Where it is

**Ronin Home** has the doors **Teams**, **Epics** and **Workspaces**, and the smaller stones **Setup**
and **Settings** (Help's stone is off Home until Mika is ready; its page stays; w1069), with **Business Lounge** on a hosted office (owner, 26 Nov; KAN-856, w1059).
Teams, Epics and Workspaces wait for an Activated harness; the small stones are open from the start.
The Setup stone is always there; Harnesses has no stone and is reached through Setup's Harness step. Until all three steps are done, the Setup stone carries Setup's own 1-2-3 bar (`createSetupStepsBar`, from `GET /api/setup/progress`); once they are, the stone is quiet (KAN-987).
Nothing decides that Setup is finished. Settings is Settings, with no toggle to Setup. A link that names a page still opens that page.
**A new office's first visit lands on Setup** (owner, 28 Nov; KAN-986): the office's campaign record is made
with `first_visit: true`; the first bare address any browser or person (not a member) opens asks
`POST /api/campaigns/first-visit`, which answers true once and clears the mark, and that visit opens Setup.
Every later bare address goes Home.

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

Ronin Services, Password and launching your own are not Setup steps (see "Not in
Setup or Settings" below). Install makes no Workspace and no folder; Ronin Lab is made in the Workspace step
(its "Not sure yet" door), as any Workspace is. Plans make their folder on their first
write.

On a phone the columns stack. Setup reads the ticks when it opens, again after each of its own
actions, and from the `setup-progress` push; it does not poll.

Every stone surface in Setup shares one shape: square stones; press one and its page opens in
their place with the kaki − top right; the − or Escape closes it back to the stones.

## Harnesses

Setup's Harness step and Settings' harness surfaces mount the one harness panel
(`public/js/harnesses-surface.js`): the same stones, the same state word, the same panel. The place
decides only where the Helpful Assistant opens (`openAgent`): Setup's work surface, Ask Ronin's panel
(`showAssistant` in `setup-view.js`); Settings' window over the surface (`models-surface.js`). The
panel, its services and its rules are in [model providers](harness-catalog.md), *One harness panel*.
The CLI's own credential file is the record of an in-harness sign-in; Ronin keeps nothing beside it.

Keys and codes are typed only on the panel, in the Ronin key vault, or in the harness's own terminal,
never in chat.

**See and Chat are one conversation.** A press goes to the Helpful Assistant as the person's own line
(`press.js`, drawn in her chat as "Pressed: …"), only after its route answered OK. The rule: a press
goes to her when it changes what an Agent can run on or starts something she should follow; one that
only moves around the page, or handles a secret, stays silent. So she gets `Codex · Sign in with
subscription`, `Codex · Sent the code` (never its text), `Codex · Cancel sign-in`, `Grok · Terminal`
and `Grok · Close sign-in`. A result nobody pressed, the CLI exiting, reaches her from the run
itself: `Codex is signed in.` or `Codex sign-in did not finish: <last line>`.

**Her hands.** She never presses the page. Her `harness` tool (`ronin_bin/harness`) calls the same
routes the panel calls (`sign-in`, `cancel`, `state`, `open`, `close`, and the Hermes `entries` and
`entry add|remove`, over `/api/model-services`); the route changes the record and the page redraws
from its push (`harness-sign-in`, setup progress, `model-services-changed`). A change she made sends
her no press line: the tool's answer is her confirmation. Keys are never hers to enter.

Ronin only checks that a sign-in exists; it never reads a credential or asks the provider about
your account.

## The Helpful Assistant (Irasshai)

People see her as the **Helpful Assistant**; her session, route and files say `irasshai`. She is a
session type, not special code ([brief](brief.md)): her behaviour (`irasshai`), her voice
(`irasshai-voice`) and one behaviour per step (`irasshai-harness`, `irasshai-workspace`,
`irasshai-team`, read in full as she takes the step) are `when: irasshai` stock in
`ronin_stock/behaviours/`. Those files are the authority on what she says; this section is how she
fits Setup.

**See and Chat.** The step's surface (See) draws the office from its facts and records; her chat
(Chat, the Ask Ronin panel) is where she asks, explains and acts. Nothing in Chat is the only
record: what she does lands in a fact, the Workspace record or an item, so See shows it and the
next Agent finds it.

**Her hands.** She never presses the page. Her tools call the same routes its buttons do, and the
page redraws from the record: `harness` (sign-ins, `open`/`close` a harness's terminal, Hermes model
entries), `workspace` (create, repositories, sources, `starter ronin_lab`), `team`, `item`, `office
read`, `show`. Keys and codes are pasted on the page, never into her chat. She never starts a
sign-in on a harness already signed in unless the person asks: it signs out every Agent on it until
it finishes, and she says so first.

**What she hears.** A press of a surface button that names her comes as the person's words
(`From <person> [Button]: …`); a sign-in's end as a House notice; leaving a changed step as the
Moved-to line above. Her own changes send her nothing; the tool's answer is her confirmation.

**What she does with what she hears.** Setup she can do now (a sign-in, a key) is a task on her
onboarding epic, done there. Project work ("deploy to Netlify") is an open item held by the
Workspace. A want for later goes under the Workspace's Icebox, which no Agent pulls from. On the Team
step she hands the Workspace's open items to its first Team (`item handoff <ids> team:<t>`).

**Start and end.** An office starts her when none of the three steps is ticked; otherwise the panel's
button does. Done, she runs `session_end`, which archives her; the button restores the archive
within seven days, and after that she starts fresh from the facts and `~/ronin/library/ABOUT_USER.md`.

## Workspaces

The Workspace step defines what a Workspace is, so any Agent that picks it up knows (owner, 25 Nov;
KAN-809). It is not the Workspaces page: the Workspaces already made are one link at its foot ("You
have 5 Workspaces."). One question, **How are you starting?**, four doors (`setup-workspace-kickoff.js`);
a door pressed opens only its questions under it, then Create. After Create the doors are there
again: people have several Workspaces, and one Workspace can hold several repositories.

1. **From a Git repository**: their GitHub repositories (once signed in) and pasted Git URLs, many;
   each cloned into `repos/<repo>` (`POST /api/workspaces/<name>/repos`).
2. **An existing project, not in Git**: where it comes from (Google Drive, WordPress, Shopify,
   Netlify, files from their computer), each an integration row with its folder `files/<source>`.
   Nothing is pulled in here: the Team step's Epic brings it in.
3. **From scratch**: a new Git repository in `repos/<name>`, on GitHub too (private) when signed in.
4. **Not sure yet**: Ronin Lab, what it is and its folder, then Create. Made, the door reads "Ronin
   Lab is ready", greyed.

Door 1 with GitHub not signed in starts with **Connect** (the Helpful Assistant runs `github sign-in`, one
call: gh's device login on the harness sign-in run, KAN-997; while it runs, the link and code with Copy and
Cancel stand in Connect's place, and once approved Ronin runs `gh auth setup-git`), at
the top. Until GitHub is connected, Connect and its sign-in window are the only live things: the rest of
door 1 is shown greyed and unpressable (`inert`, the kit's greyed look; KAN-998), and comes alive once
connected. Signed in, it goes straight to its questions. Doors 1–3 ask, in this order: what kind of project (open, business, personal, household, social,
school; a Workspace's only, `WORKSPACE_KINDS`: Teams and Agents have none) · its name · what you are working on (the name
follows it until one is typed) · the door's own question · for doors 1 and 3, how Agents work in the
repositories (**Desks** unless they say **Direct**) · anything every Agent there should follow ·
Create. Doors 2 and 3 end with an optional GitHub
Connect while GitHub is not signed in. With no door chosen, or the chosen one pressed again, the space
under the doors says what a Workspace is, with an illustrative example. After Create, one line: "Made
<title>, in ~/ronin/<name>." and **Open it**.

The same doors, without that explanation and the foot link, are **New Workspace** everywhere else:
the Workspaces door and Settings' Workspaces card (`workspaces-surface.js`), where Create opens the made
Workspace (KAN-900). There is no other form that makes a Workspace.

Every answer lands on the Workspace record (`src/workspaces.ts`):

| Asked | Record field |
|---|---|
| What you are working on; its name | `objective`; `title`, and the handle `name` made from it |
| Kind | `kind` |
| Anything every Agent should follow | `instructions` (Agents are born with it) |
| Repositories (door 1); its new one (door 3) | `repos`, at `repos/<repo>`, Desks or Direct as asked |
| Where it comes from (door 2) | `integrations`, one row per source with `folder: files/<source>` |
| (always) | `folders`: the Workspace's own folder |

Every Workspace's folder is laid out the same on Create, whoever creates it (`layOut`); a plain
folder, only the repositories are Git. Desks (the Agents' worktrees) stay where worktree-desk puts them.

```
~/ronin/<name>/
  plans/          its plans (the default place)
  files/          anything that isn't code: documents, notes, uploads
    <source>/     one per source it comes from (door 2)
  repos/<repo>/   each repository, cloned or started, its own Git
```

The Helpful Assistant does the same with her `workspace` tool (`create --kind`, `repo`, `source`,
`starter ronin_lab`). Two things on the step reach her, and nothing else: **Connect · Helpful
Assistant** (the button names her) and Create, which tells her what was made as the person's
`[Button]` line, `Workspace · Created <name>. Its record: workspace read <name>.`. A Workspace's handle
in her chat is a link to its own page (`chat-item-links.js`). On this step the words are Workspace,
objective (shown as "What are you working on?"), folder, repository, instructions; never root,
project root, gh or worktree.

GitHub is never a step of its own: a public repository clones without it. For a private one, or
"my repositories", the page's **Connect · Helpful Assistant** sends her "Connect GitHub.", and she
signs the GitHub CLI in with GitHub's device flow and `gh auth setup-git`, so a headless machine
shows a code the owner approves in a browser elsewhere.

## Team

A Team is always made in one Workspace, and its lead takes that Workspace's work. The step's surface
(`setup.team`, `createTeamSurface` in `setup-surfaces.js`) is the ordinary New Team form, the same as on
the Teams workbench ([new Team](new-team.md)): name and title, the **Team objective** (what the lead picks up
and starts on, said to it at birth with its epic), the **Team instructions** (in every member's brief,
`facts/team.md`), the **Workspace** (required), the **Agents** (the lead first, each on a signed-in
harness, so Agents on different harnesses share one Team), and the **Epic** (one of the Workspace's open
epics handed to the Team, or a new one). The form has no Kind, defaults, toolkit or payload: a Team copies
its Workspace's defaults when it is made, and its Configuration changes them afterwards
([team workspace](team-workspace.md)).

No press on this surface messages her: Launch is a real setting she reads in the facts. Her chat on this
step is drawn as on every step (`tile-transcript.js`): item ids and Agent names are links
(`chat-item-links.js`), and her choices are question cards (`chat-question.js`).

The step is ticked when a Team has a live lead (the ticks above). The rest of the step is waiting on the
owner (KAN-810): Irasshai proposing the Team structure as soon as a Workspace is made (one Team, several,
or a Team of several Agents, with epics and items: for example a cloned repository gets an Agent that walks
it and writes a project map), and the surface around the form showing it: a line and a **Workspace** press
when there is no Workspace, and a card per running Team (lead, Agents, items held).

## Not in Setup or Settings

There is no Password, Launch your own or Ronin Services card (owner, 25–26 Nov): the
account and any password are the Business Lounge's, a self-hosted machine is reached over the
tailnet, New Team and New Agent are on Teams, and Ronin Services ships with Cowork with every part
running ([installations.md](installations.md)). Settings itself: [settings.md](settings.md).
