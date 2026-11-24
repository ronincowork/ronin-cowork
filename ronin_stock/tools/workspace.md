# workspace
- **seed:** read and set up the office's Workspaces: what each project is, and its folders and repositories
- **when:**
- **depth:** seed
- **serves:** irasshai, team-lead
- **order:** 73

## Usage

A Workspace is one project. Its **objective** is the one place that says what the project is;
its **instructions** are standing directions to every Agent in it; its folders and
repositories list only what is there. `workspace list` names every Workspace with its
objective; `workspace read <handle>` prints one whole. `workspace create "<name>" --objective
"<text>"` makes one from what the person said; `workspace objective <handle> "<text>"` and
`workspace instructions <handle> "<text>"` replace those. `workspace add <handle> <what>` adds a
folder (made under `~` when it is not there) or clones a repository from any Git host and adds
it: a public one needs no sign-in, a private one needs GitHub (or the host) signed in here.
The workspaces fact shows them all. `workspace --help`.
