# PROJECT_ROOTS — the launch table (system scope, ships with NO roots)

> **This file is stock, and an upgrade replaces it.** It holds one thing: the
> **provider · model launch table**, the session_launch_specs every install needs. It is DATA the
> TEJUN recipes look things up in — not a fourth member of the macro/action/tool triad.
> Nothing in here executes.

**Your own directories are NOT here.** There is no such thing as a stock project root, so
this file ships empty of them. The list of directories you work in lives in **user
scope**, the catalogs store's `PROJECT_ROOTS.md` — outside every repo, created by Ronin on
first use, and untouched by any upgrade (`DAIKUSAN.md`, the three scopes). Adding a root
here would put your directories in a file the next upgrade overwrites.

A **`project_root`** is *where* the work happens — one of the two universal axes
(`project_root` · `session_job`) used everywhere: spawn forms, memory frontmatter,
macros. See `ronin_catalogs/SESSION_JOBS.md` for what a session is for and therefore who
it is. One lookup fixes: where to work (`dir`), what a cold agent reads first (`read`),
and which memories it recalls (`memory`). A root never chooses a model — sessions have
ONE default (`agents.sessions.default`, set in ⚙ Configuration), and every launch may
pick otherwise on the form (owner, 2026-08-18).

## Providers and models — the launch table

A session_launch_spec is chosen in two steps: **provider** (whose CLI) then **model** (which
model, by its real name — no cheap/mid/heavy euphemisms). The launch form picks one,
else the install default applies — one default, one place. Adding a provider is a row
in this table, and adding a model is a column — never a code path; that is the
whole of what vendor-neutrality requires.

The extension contract and third-party provider checklist live in
`docs/model-providers.md`.

The column headings ARE the model names the UI shows, and the **first column is
the provider's default**.

**A provider whose models are its own gets its own table.** The columns are model
names, and OpenAI's are not Anthropic's — so a `| provider | …` heading row simply
restarts the column names, and every table below feeds the same one list. That is
still a row and a column, not a code path.

### Anthropic

Anthropic model IDs are passed unchanged to Claude's `--model` option.

| provider | opus | fable | sonnet | haiku |
|---|---|---|---|---|
| `anthropic` | `claude --model opus` | `claude --model fable` | `claude --model sonnet` | `claude --model haiku` |

- **mcp_off:** `--strict-mcp-config`

`mcp_off` is the provider's own "launch with no MCP servers" flags — appended to the
cell's command when a launch turns MCP off (the ＋ New form's toggle). With no
`--mcp-config` given, `--strict-mcp-config` means Claude loads zero MCP servers:
no shared memory layer, no connectors, for that session only. A provider section
without an `mcp_off` line cannot launch with MCP off; the spawn refuses rather than
launching connected.

### OpenAI

OpenAI model IDs are passed unchanged to Codex's `--model` option. The current model
family and IDs are recorded in the [official OpenAI model catalog](https://developers.openai.com/api/docs/models).

| provider | gpt-5.6-sol | gpt-5.6-terra | gpt-5.6-luna |
|---|---|---|---|
| `openai` | `codex --model gpt-5.6-sol --dangerously-bypass-approvals-and-sandbox` | `codex --model gpt-5.6-terra --dangerously-bypass-approvals-and-sandbox` | `codex --model gpt-5.6-luna --dangerously-bypass-approvals-and-sandbox` |

- **mcp_off:** `-c mcp_servers={}`

The first column, `gpt-5.6-sol`, is Ronin's OpenAI default. Every cell names the complete
command, so selecting another column launches that exact model rather than inheriting
Codex's local default. Availability belongs to the owner's OpenAI account: if an account
cannot use a model, Codex reports that refusal in the new tile; Ronin never substitutes.
This install runs Codex unrestricted because the ronin_machine is the external sandbox;
the explicit `--dangerously-bypass-approvals-and-sandbox` flag is visible in every cell.

Other providers (pi, perplexity, …) arrive the same way: a contributor PR adding a
table block.

**Other launch settings** a spawn may carry (not role-level; chosen per session):
CLI permissions mode (`default` / `bypass`) and the `@ronin-control` dial the
session is born with (`user` / `read` / `write` — see
`docs/session-control-dials.md`).
