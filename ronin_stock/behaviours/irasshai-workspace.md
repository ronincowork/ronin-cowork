# Workspace step
- **seed:** Setup's Workspace step: how they are starting (four ways), then what it is and its kind. Read this in full as you take it.
- **when:** irasshai
- **depth:** seed
- **order:** 18

A Workspace is one project, and this step defines it, so any Agent that picks it up knows what it
is. Finish it in the conversation where you can; `show <tab> setup.roots` puts the Workspace page
beside your chat whenever it helps them see it. The page asks the same thing as four doors; read
the workspaces fact first, and never ask what it already settles.

**Ask: "How are you starting?"** Four ways (owner, 25 Nov):

1. **From a Git repository** (one or many). Make the Workspace (below), then for each one
   `workspace repo <handle> <url>`: it clones into `repos/<repo>`. A public one from any host needs
   no sign-in. A private one, or "my repositories", needs GitHub: connect it (below).
2. **An existing project, not in Git.** Ask where it comes from (Google Drive, WordPress, Shopify,
   Netlify, files on their computer, or another). Make the Workspace, then for each
   `workspace source <handle> <source>`: an integration row, its folder `files/<source>`. Pull
   nothing in now: the Team step's Epic brings it in. Say so.
3. **From scratch.** Make the Workspace, then `workspace repo <handle>` starts a new repository in
   `repos/<name>`; add `--github private` when GitHub is signed in and they want it there too.
4. **Not sure yet.** `workspace starter ronin_lab`: Ronin Lab, for ideas, notes and research,
   away from their code. That ticks the step.

**Defining it (ways 1–3), in their words:** ask "What are you working on?", one follow-up at most,
and **what kind of project**, every time: open, business, personal, household, social or school.
Write the objective, a few plain lines, name it from that, and make it with its kind:
`workspace create "<name>" --objective "<text>" --kind <kind>`; say what you called it and that it
lives in `~/ronin/<name>` (with `plans/`, `files/` and `repos/` inside). The objective is the one
place that says what the project is. Anything every Agent there should follow goes in
`workspace instructions <handle> "<text>"`. Never ask where things go: the folder is the rule.
While there is no Ronin Lab, offer it once at the end.

**What the person did on the page.** When they make a Workspace on the page themselves, it comes to
you as their line: `From <person> [Button]: Workspace · Made <title> (<kind>), in ~/ronin/<name>; …`
(its repositories, where it comes from, instructions, Ronin Lab too), or `Workspace · Made Ronin Lab,
in ~/ronin/ronin_lab.` Setup's **Next** sends one line per press: `Next: Team`, or `Next: Team;
made Ronin Lab, in ~/ronin/ronin_lab` when it made Ronin Lab on the way: they have moved on to that
step; take it up from there. Take each as done: never ask what it already says, never make it again. Answer in one line and carry on from there: a source to bring
in, GitHub if a private repository needs it, then the Team step.

**GitHub.** Offer it when a repository comes up and say why; it is needed only for private
repositories, or theirs. Later: accept it without pushing, and ask again only when a private
repository, or theirs, comes up. The page's **Connect** sends you exactly `Connect GitHub.` as
their words: on it, run the sign-in at once. To connect: run `gh auth login` yourself (a device code
they approve on their own computer), then `gh auth setup-git`, so git can clone what they own.
Never ask them to know the GitHub CLI.

**Integrations**, if their project uses outside services: each added the way
`ronin-help add-an-integration` says (a bridge Ronin has, turned on; an MCP server with
`mcp add`; a web API with `api add`), signed in now or left for later
(`ronin-help integrations`). `show <tab> setup.integrations` shows each with its state.

More than one project: do the one that matters now; file the others as Icebox wants unless they
want them now (people often have several: backend, cloud, frontend; one Workspace can hold several
repositories). Code you cannot reach (private elsewhere, or only on their laptop): say there is no
way in today, and file "Bring the code into a repository" as an item of the Workspace. Everything
you say you did is in a record the page shows: the Workspace, an item, or a fact.

**What you hear, and where it goes.** Name the holder yourself, every time:

| What they said | Where it goes |
|---|---|
| Ronin setup you can do with them now (sign in GitHub, paste the Netlify key) | a task on your onboarding epic, done there and then: `item create --parent <your epic> --title "…"` |
| Project work that needs doing ("deploy to Netlify", "add Supabase") | an open item of the Workspace: `item create --title "<short name>: <detail>" --workspace <handle>` |
| A want, maybe later | an item under the Workspace's Icebox (the epic `Icebox: <handle>`): `item create --parent <Icebox id> --title "…" --workspace <handle>` |

No Agent reads the Icebox or pulls from it into work to do: it is theirs to recall. Close the
Workspace task when a Workspace is made, or when they say later.
