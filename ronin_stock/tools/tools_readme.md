# Tools

Something an Agent calls: one command, or a family (`session_*`). One Markdown file per
tool; the file name (no `.md`) is its id, one namespace with `facts/` and `behaviours/` (the
`mika` command's file is `ask-mika`). Every tool is on every Agent's PATH; what the brief
says about it is its file. A tool is a foundation: the person's custom-foundation,
`~/ronin/custom/tools/<id>.md`, beside their own executables there, replaces the stock one
whole or adds one ([stock_readme.md](../stock_readme.md#three-places-each-with-one-meaning)).

Tools live in the repo's `ronin_bin/`, which `setup.sh` puts on PATH — call them by bare name, never by a built path.
(`shim/tmux` is PATH interception, not a command you type; see `ronin_bin/README.md`.)
Agents: prefer the tool over hand-rolled choreography; it reports the result in
the vocabulary used throughout the coworkspace.

[`docs/architecture/brief.md`](../../docs/architecture/brief.md) owns the model and the composite tool
boundary. Describe the public operation here, not its internal routes or modules.

## The header

Every file in `facts/`, `behaviours/` and `tools/` starts the same:

```
# Write it Down
- **seed:** WRITE IT DOWN: put what you work on on your work record.
- **when:** cowork
- **depth:** full
- **order:** 40

<the full text>
```

| Field | Files | Means |
|---|---|---|
| title (`#`) | all | the name the brief prints; for a tool, the command |
| `seed:` | behaviours, tools | the one line. A behaviour's seed stands on its own; a tool's is its one job |
| `line:` | facts | the line the brief prints, with values from the work record |
| `when:` | all | the conditionals that must all hold, comma-separated; `!` for not; blank = every Agent. A tool that serves a behaviour needs none |
| `depth:` | behaviours, tools | `none` (told only when a layer adds it), `seed` or `full` |
| `serves:` | tools | the behaviour ids it serves. Blank: it goes under Other tools |
| `order:` | all | its place in its section, lower first |

Header lines run from the title to the first blank line; an unknown field is ignored and an
unknown conditional never holds. The model is [docs/architecture/brief.md](../../docs/architecture/brief.md).

## Adding a tool

Add the executable in `ronin_bin/` and its file here, as you add its docs. No other list of
tools is kept by hand: the [Tools help page](../../docs/using-ronin/agent-tools.md) list is
generated from these headers (`node scripts/tool-list.mjs`; `--check` in the gate).

- When the job is composite, reuse guarded primitives behind one contract and preserve
  their validation and audit evidence; do not expose copied choreography as another path.
- Tools report stored preferences and operational warnings without treating them as
  access-control decisions.
- Small, zero-dependency bash; concise outcomes and meaningful exit codes.

## Not tools

Private implementation files in `ronin_bin/` get no file here:

- `tool-path.sh` and `ronin-http.sh` are sourced libraries.
- `.edges-send`, `.edges-read`, `.edges-team`, `.edges-wipeboard`, `.edges-page`,
  `.edges-schedule`, and `.edges-peek` implement the public `edges` surface.
- `ronin-url` prints the operator's address for the other tools (`ronin_bin/README.md`).
- `README.md` documents `ronin_bin/`.
