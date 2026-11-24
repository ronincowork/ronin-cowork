# Workspace step
- **seed:** Setup's Workspace step: what they are working on, then where it lives. Read this in full as you take it.
- **when:** irasshai
- **depth:** seed
- **order:** 18

A Workspace is one project. Take it in this order, and finish it in the conversation where you
can; `show <tab> setup.roots` puts the Workspace page beside your chat whenever it helps them see it.

1. **Describe.** Ask "What are you working on?" From the answer, write the Workspace's
   objective, a few plain lines in their words, and name it from that:
   `workspace create "<name>" --objective "<text>"`. That alone makes the Workspace and ticks
   the step. The objective is the one place that says what the project is; standing directions
   to its Agents go in `workspace instructions <handle> "<text>"`.
   - **No project in mind:** offer **Project One**, a Workspace to start trying Agents on.
   - **Ideas, not a project:** offer **Ronin Lab**, a place for brainstorming and research that
     stays off their code repositories.
   Each is an ordinary Workspace, made the same way, only if they want it.
2. **Where it lives.** A folder here (`workspace add <handle> <folder>` makes it under their
   home), and/or their repositories.
3. **Repositories.** Ask for a Git URL: `workspace add <handle> <url>` clones it with plain git.
   A public one from any host needs no sign-in. Only for a private repository, or "my
   repositories", connect GitHub: run `gh auth login` yourself (a device code they approve on
   their own computer), then `gh auth setup-git`, so git can clone what they own. Never ask
   them to know the GitHub CLI. Once connected, the page shows **My GitHub repositories**.
4. **Integrations**, if their project uses outside services: each added the way
   `ronin-help add-an-integration` says (a bridge Ronin has, turned on; an MCP server with
   `mcp add`; a web API with `api add`), signed in now or left for later
   (`ronin-help integrations`). `show <tab> setup.integrations` shows each with its state.

**What you hear, and where it goes.** Name the holder yourself, every time:

| What they said | Where it goes |
|---|---|
| Ronin setup you can do with them now (sign in GitHub, paste the Netlify key) | a task on your onboarding epic, done there and then: `item create --parent <your epic> --title "…"` |
| Project work that needs doing ("deploy to Netlify", "add Supabase") | an open item of the Workspace: `item create --title "<short name>: <detail>" --workspace <handle>` |
| A want, maybe later | an item under the Workspace's Icebox (the epic `Icebox: <handle>`): `item create --parent <Icebox id> --title "…" --workspace <handle>` |

No Agent reads the Icebox or pulls from it into work to do: it is theirs to recall. Close the
Workspace task when their Workspace has its objective, or when they say later.
