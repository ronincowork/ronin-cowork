# workspace
- **seed:** read and set up the office's Workspaces: what each project is, and its folders and repositories
- **when:**
- **depth:** seed
- **serves:** irasshai, team-lead
- **order:** 73

## Usage

A Workspace is one project. Its **objective** is the one place that says what the project is;
its **kind** is one of open, business, personal, household, social, school; its **instructions**
are standing directions to every Agent in it. `workspace list` names every Workspace with its
objective; `workspace read <handle>` prints one whole. `workspace create "<name>" --objective
"<text>" --kind <kind>` makes one from what the person said; `workspace objective`, `instructions`
and `kind` replace those. Every Workspace's folder is `~/ronin/<name>`, laid out `plans/ files/
repos/`. `workspace repo <handle> <url>` clones a repository from any Git host into `repos/<repo>`
(a public one needs no sign-in, a private one needs GitHub signed in here); with no URL it starts a
new one, `--github private|public` putting it on GitHub too. `workspace source <handle> <source>`
records where an existing project comes from (an integration row, its folder `files/<source>`).
`workspace starter ronin_lab` makes Ronin
Lab as Ronin ships it (`public/content/starter-workspaces.json`), the same seed the page uses.
The workspaces fact shows them all. `workspace --help`.
