# canvas
- **seed:** list the canvas templates; make, read and edit the Workspace's canvases (read shows each live block as it is now)
- **when:**
- **depth:** seed
- **serves:** canvases
- **order:** 36

## Usage

`templates` | `ls` | `create <name> [--template <t>]` | `read <name>` | `edit <name> add|change|remove …`; `--workspace <name>` as `plan`. A canvas name is lowercase letters, digits and -. A canvas is Markdown in the Workspace's plans folder (`canvases/<name>.md`), committed like a plan; it stores blocks and typed entries, never a live reading and never a command. An integration block's commands (`netlify sites`, …) are its template's, from the catalog; Ronin runs them each time the canvas is read, by `canvas read` or from the Workspace page. `canvas --help`.
