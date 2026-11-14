# templates/canvases — starting outlines for a canvas

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
| `integration` | optional: the integration record (`ronin_catalogs/integrations/<id>.md`) it belongs to, so an Agent with that integration finds it |
| `drawing` | optional link to a drawing of it, for people judging the outline |

## Blocks

`## blocks` holds one `### <name>` section per block, in the order they paint:

| field | means |
|---|---|
| `source` | `integration <id>` (read live from that integration), `integration` (any linked one of that kind), `live` (read where it lives: repos, work, documents), or `typed` (entered by an Agent or a person, shown with who and when) |
| `holds` | one line: what the block is for |
| `entries` | the entries it holds, each `name (its one line)`; `only if` / `only while` marks one that shows only when it exists |

Every entry is a link and one line. No keys or tokens, ever.

## Yours

A same-named file in your catalogs store (`bin/ronin-store catalogs` → `templates/canvases/`)
replaces ours whole; a new name adds an option.
