# workspace-doc
- **seed:** read and write the office's Workspace docs: each Workspace's Summary and notes
- **when:**
- **depth:** seed
- **serves:**
- **order:** 73

## Usage

Every Workspace has a doc, `~/ronin/office/workspaces/<handle>.md` (the handle is its name): a
Summary section, a few lines on what the Workspace is for and what is in it, then notes. `office
read` shows each Summary. `workspace-doc list` names every Workspace with its Summary;
`workspace-doc read <handle>` prints its repositories and folders with their directories, then its
doc. `workspace-doc summary <handle> <text>` replaces the Summary; `workspace-doc note <handle>
<text>` adds a dated note signed with your name. Grep the folder to search them all.
`workspace-doc --help`.
