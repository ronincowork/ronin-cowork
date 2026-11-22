# canvases — starting outlines for a canvas

Stock files, not foundations (no Agent is built from them): outlines a canvas starts from. The three places and the one rule
are in [stock_readme.md](../stock_readme.md); `~/ronin/custom/canvases/<token>.md` replaces the stock one
of that token, or adds one.

One outline per file, named by its token. The canvas tool looks them up:
`canvas templates` lists this shelf, and `canvas create <name> --template <token>` starts a
canvas from one. A template is one option, never the only shape: the Agent trims it to what
the Workspace has and what the user asked for, and the canvas it starts is then the
Workspace's own, with only provenance left.

## Fields

| field | means |
|---|---|
| `label` | the name in `canvas templates` |
| `blurb` | one line under the name |
| `order` | list order; unordered ones follow, by label |
| `kinds` | which Workspaces it suits, e.g. `site, app` |
| `integration` | optional: the integration's name, as a Workspace's `integration:<name>` holds it (e.g. `netlify`); that integration's brief points at this template |
| `drawing` | optional link to a drawing of it, for people judging the outline |

## Blocks

`## blocks` holds one `### <name>` section per block, in the order they paint:

| field | means |
|---|---|
| `source` | `integration <id>` (read live from that integration; no such integration on the Workspace, no block), `integration` (any linked one of that kind, typed), `live repos`, `live items` or `live documents` (read where it lives: the Workspace's repos, its work items, its plans and the items' documents), or `typed` (entered by an Agent or a person, shown with who and when) |
| `holds` | one line: what the block is for |
| `entries` | the entries it holds, each `name (its one line)`; `only if` / `only while` marks one that shows only when it exists |
| `read` | an integration block's commands, semicolon-separated: the bridge or `api`/`mcp` calls that Ronin runs whenever the canvas is read—from `canvas read` or the Workspace page—for example `netlify sites --workspace {workspace}`. `{workspace}` and integration facts such as `{site}` are filled in. The commands live only here: a canvas file holds none (one written into it by hand is ignored), and Ronin takes them from the canvas's template by block name; no template, or no such block, runs nothing |

A read command that prints one line like
`{"cards":[{"title":"Live site","rows":[{"text":"up","links":[{"text":"open","url":"https://example.com"}]}]}]}`
is painted as cards: a title, rows of plain words and short link labels. A row may also carry
`detail` (a quieter line) and `warn` (what is wrong with it); a link may carry `"button": true`
(painted as a button, the act the row is for); a card may carry `section` (the heading it sits
under, such as Drafts or Live). `netlify <tool> --card`
prints this form. Anything else it prints is shown as lines. The work items block is cards too:
one per epic, with its open items under it.

A typed entry is stored as `- **entry:** <name> · <line> · <by> · <date>`; `canvas edit` writes
it. A block with nothing in it now is left off the reading. Every entry is a link and one line.
No keys or tokens, ever.