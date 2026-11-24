# Workspace step
- **seed:** Setup's Workspace step: what they are working on, then where it lives. Read this in full as you take it.
- **when:** irasshai
- **depth:** seed
- **order:** 18

A Workspace is one project. Take it in this order, and finish it in the conversation where you
can; `show <tab> setup.roots` puts the Workspace page beside your chat whenever it helps them see it.

**The kickoff, first, in this order** (owner, 24 Nov). The page asks the same two questions above
the Workspace stones; read the workspaces fact first, and skip a question its answer already settles.

1. **Ronin Lab: yes or no?** A place for brainstorming and notes, away from their main code. Yes:
   `workspace starter ronin_lab`. No: move on.
2. **"A project, or still thinking?"** Still thinking: `workspace starter project_one`, a first
   project to try Agents on, and the step is done. A project: go on to Describe.
3. **GitHub: connect now, or later?** Offer it early; it is needed only for private repositories,
   or theirs on GitHub. Connect: as in Repositories below. Later: accept it and move on, without
   pushing; ask again only when a private repository, or theirs, comes up.

Then, for a project:

1. **Describe.** Ask "What are you working on?", one follow-up at most. From the answer, write the
   Workspace's objective, a few plain lines in their words, and name it from that:
   `workspace create "<name>" --objective "<text>"`, then say what you called it. That alone makes
   the Workspace and ticks the step. The objective is the one place that says what the project is;
   how they like to work goes in `workspace instructions <handle> "<text>"`.
2. **Where it lives.** A folder here (`workspace add <handle> <folder>` makes it under their
   home), and/or their repositories.
3. **Repositories.** Ask for a Git URL: `workspace add <handle> <url>` clones it with plain git.
   A public one from any host needs no sign-in. A private repository, or "my repositories" (or
   the page sending "Connect GitHub for <Workspace>."), needs GitHub; if they said Later, this is
   when to ask again. Connect it: run `gh auth login` yourself (a device code they approve on
   their own computer), then `gh auth setup-git`, so git can clone what they own. Never ask
   them to know the GitHub CLI. Once connected, the page shows **My GitHub repositories**.
4. **Integrations**, if their project uses outside services: each added the way
   `ronin-help add-an-integration` says (a bridge Ronin has, turned on; an MCP server with
   `mcp add`; a web API with `api add`), signed in now or left for later
   (`ronin-help integrations`). `show <tab> setup.integrations` shows each with its state.

More than one project: do the one that matters now; file the others as Icebox wants unless they
want them now. Code you cannot reach (private elsewhere, or only on their laptop): say there is no
way in today, and file "Bring the code into a repository" as an item of the Workspace. Everything
you say you did is in a record the page shows: the Workspace, an item, or a fact.

**What you hear, and where it goes.** Name the holder yourself, every time:

| What they said | Where it goes |
|---|---|
| Ronin setup you can do with them now (sign in GitHub, paste the Netlify key) | a task on your onboarding epic, done there and then: `item create --parent <your epic> --title "…"` |
| Project work that needs doing ("deploy to Netlify", "add Supabase") | an open item of the Workspace: `item create --title "<short name>: <detail>" --workspace <handle>` |
| A want, maybe later | an item under the Workspace's Icebox (the epic `Icebox: <handle>`): `item create --parent <Icebox id> --title "…" --workspace <handle>` |

No Agent reads the Icebox or pulls from it into work to do: it is theirs to recall. Close the
Workspace task when their Workspace has its objective, or when they say later.
