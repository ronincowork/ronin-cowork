# PROJECT_ROOTS — the launch table (system scope, ships with NO roots)

> **This file is stock, and an upgrade replaces it.** It holds one thing: the
> **provider · model launch table**, the brains every install needs. It is DATA the
> TEJUN recipes look things up in — not a fourth member of the macro/action/tool triad.
> Nothing in here executes.

**Your own directories are NOT here.** There is no such thing as a stock project root, so
this file ships empty of them. The list of directories you work in lives in **user
scope**, the catalogs store's `PROJECT_ROOTS.md` — outside every repo, created by Ronin on
first use, and untouched by any upgrade (`DAIKUSAN.md`, the three scopes). Adding a root
here would put your directories in a file the next upgrade overwrites.

A **`project_root`** is *where* the work happens — one of the two universal axes
(`project_root` · `session_job`) used everywhere: spawn forms, memory frontmatter,
macros. See `tejun_catalogs/SESSION_JOBS.md` for what a session is for and therefore who
it is. One lookup fixes: where to work (`dir`), what a cold agent reads first (`read`),
which memories it recalls (`memory`), and the default brain (`provider` + `model`) —
resolved through the table below.

## Providers and models — the launch table

The brain is chosen in two steps: **provider** (whose CLI) then **model** (which
brain, by its real name — no cheap/mid/heavy euphemisms). A `project_root` names a
default for both; the role or the launch may override. Adding a provider is a row
in this table, and adding a model is a column — never a code path; that is the
whole of what vendor-neutrality requires.

The column headings ARE the model names the UI shows, and the **first column is
the provider's default** when a project_root names no model.

**A provider whose models are its own gets its own table.** The columns are model
names, and OpenAI's are not Anthropic's — so a `| provider | …` heading row simply
restarts the column names, and every table below feeds the same one list. That is
still a row and a column, not a code path.

| provider | opus | fable | sonnet | haiku |
|---|---|---|---|---|
| `anthropic` | `claude --model opus` | `claude --model fable` | `claude --model sonnet` | `claude --model haiku` |

| provider | default |
|---|---|
| `openai` | `codex` |

**Why `openai`'s only column is called `default` and not a model name.** A cell holds a
COMMAND, and bare `codex` launches whatever model that CLI is configured to use — the
one Codex pane ever measured on a Ronin box showed `gpt-5.6-sol default · ~/tmux-ronin`
in its status row (`src/services/rireki/decode.ts:219`), but that is Codex's choice on that box on that
day, not ours to assert. Codex's model names are TBD until someone with the CLI installed
verifies them and the `--model` flag against it (it is not installed here). The settled
design is that **a model is optional** — a provider with no model list still launches,
and the picker will eventually be two controls, provider then model, so this column
disappears rather than becoming a name to maintain. Naming it after a model we guessed is
exactly the placeholder that would outlive its reason. One column here, one command, and
codex is launchable today.

Other providers (pi, perplexity, …) arrive the same way: a contributor PR adding a
table block.

**Other launch settings** a spawn may carry (not role-level; chosen per session):
CLI permissions mode (`default` / `bypass`) and the `@ronin-control` dial the
session is born with (`user` / `read` / `write` — see
`docs/session-control-dials.md`).

