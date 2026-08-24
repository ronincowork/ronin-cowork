# Model providers

Ronin launches agents from one provider/model catalog:
`ronin_catalogs/PROJECT_ROOTS.md`. Each populated table cell is a
`session_launch_spec` — `{provider, model, cmd}` — and the ＋ New session picker is a
direct rendering of those cells.

This is intentionally data, not provider code. Adding a provider or model must not add a
route, UI branch, parser branch, or spawn branch.

Provider setup has three records with deliberately different contents:

| Record | Holds |
|---|---|
| this document | the provider/model extension contract |
| `ronin_catalogs/PROJECT_ROOTS.md` | public model IDs and complete launch commands |
| `ronin_sops/secrets.md` | how the owner supplies and audits the credential that pays |

Account identity is handled by `ronin_sops/accounts.md`. Secret values never cross into
this document or the launch catalog.

## One command registry

`src/agents.ts` is the single executable registry for agent-provider CLI syntax. A route,
installer, archive lifecycle, or UI must not spell a provider command itself. Each row owns:

| Field | Command contract |
|---|---|
| `operations.install` | Shell line used by Ronin's visible installer. Empty means Ronin cannot perform it. |
| `operations.update` | Either a package-manager shell line or argv for the installed CLI's native updater. |
| `operations.version` | Args used to read the installed CLI version. |
| `cmd` | Executable name resolved through the owner's login shell. |
| `initial` | Whether a new interactive launch accepts the brief positionally. |
| `operations.session.newIdFlag` | Optional flag for a Ronin-minted new conversation UUID. |
| `operations.session.resume` | Arguments before the provider conversation UUID. |
| `operations.session.discovery` | The exact identity-discovery adapter, or `unsupported`. |

Current verified lifecycle syntax:

| Agent CLI | New conversation identity | Resume | Archive support |
|---|---|---|---|
| Claude Code | `claude --session-id <uuid> …` | `claude --resume <uuid>` | yes; exact legacy fallback also exists |
| Codex | discovered from matching open rollout + writer-lock FDs | `codex resume <uuid>` | yes |
| Gemini CLI | CLI-managed UUID | `gemini --resume <uuid>` | command verified; identity discovery not yet integrated, so no |
| Grok CLI | not verified | not verified | no |
| Hermes | not verified | not verified | no |

Upstream command references used for these rows: [Claude CLI and update reference](https://code.claude.com/docs/en/cli-reference),
[Codex CLI repository](https://github.com/openai/codex), [Gemini CLI reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md),
and [Hermes CLI reference](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md).
They are evidence for maintainers; they are not runtime inputs. Runtime consumers read
`AGENTS[].operations` only.

“Not verified” and `discovery: unsupported` are executable behavior: archive refuses before
stopping tmux. Adding support means verifying the installed CLI's own help, locating its
exact current-session identity without ambiguity, and proving a real resume journey; then
change its one registry row and this table together. Do not infer syntax from another
provider.

## Provider and agent are different axes

The **provider** serves inference and bills the request. The **agent CLI** is the
interactive process in the tile. OpenAI through Codex, DigitalOcean through Codex, and
Hugging Face through Codex are three provider configurations but one agent interface.
They share Codex's new-session behavior. A provider with its own CLI introduces a new
agent interface and must satisfy the new-session contract below.

This distinction is what keeps an OpenAI-compatible addition small without pretending
every terminal agent behaves like Claude.

## The contract

| Part | Meaning |
|---|---|
| provider | The service/CLI identity shown before the dot in the picker |
| model | The provider's real model ID, taken from a column heading |
| cmd | The complete interactive agent command stored in that cell |
| first model column | That provider's Ronin default |

The heading and command must agree. For example, `openai · gpt-5.6-terra` resolves to a
Codex command carrying `--model gpt-5.6-terra`; it must never resolve to bare `codex` and
inherit an unseen local default. This install also puts Codex into unrestricted mode with
`--dangerously-bypass-approvals-and-sandbox`: the ronin_machine is its external sandbox.

The launch path does no provider interpretation, but it does adapt to the agent's terminal
interface after starting the command:

```text
PROJECT_ROOTS.md cell
  → GET /api/session-launch-specs
  → ＋ New session picker
  → POST /api/launch { cmd }
  → run that cmd verbatim in the new tile
  → recognize dialog or ready prompt
  → type the built brief
  → submit it and verify that it left the prompt
```

## New-session integration contract

Starting the right executable is only half of adding an agent. A usable
`session_launch_spec` must carry the owner's startup request into a ready agent exactly
once. Every distinct agent CLI must define and prove these terminal behaviors:

| Stage | Ronin must know |
|---|---|
| launch | The complete command, model selector, profile and required permission policy |
| dialog | How trust/login/choice screens appear, so Ronin waits and never answers for the owner |
| ready | The prompt marker that means the CLI can accept the initial brief |
| pending text | How typed-but-unsubmitted text is distinguished from dim suggestions |
| submit | Which key submits, and how Ronin can verify the prompt actually cleared |
| busy | What visible cue means the agent is working rather than ready |

The implementation seam is deliberately small:

- `src/status.ts` classifies visible terminal text as ready, working, or awaiting input.
- `src/send.ts` reads the active prompt, types the brief, submits it, and verifies it left.
- `src/routes/launch.ts` builds the brief and runs that handshake after the CLI starts.
- `tests/agent-prompts.test.ts` holds terminal fixtures for every supported prompt/dialog
  form.

Pattern order is safety-critical: a selected dialog row must be recognized before a
generic prompt marker. Claude uses `❯`; Codex uses `›` for both its prompt and its selected
trust row. Treating either glyph as universally ready can answer a trust question and
discard the owner's brief.

An OpenAI-compatible provider using an already-supported Codex profile inherits this
contract and normally needs no source change. A provider's native CLI does not: capture
its real startup, trust dialog, empty prompt, typed prompt and working screen; add those
fixtures and the smallest corresponding patterns before adding its launch-table row.

## Adding a native provider

Give a provider its own subsection and Markdown table beside Anthropic and OpenAI in
`ronin_catalogs/PROJECT_ROOTS.md`. Use the provider's real model IDs as headings and a
complete command in each cell:

```markdown
### Example

| provider | model-a | model-b |
|---|---|---|
| `example` | `example-agent --model model-a` | `example-agent --model model-b` |
```

The command must start an interactive coding agent in the current directory and remain
alive to receive Ronin's opening brief. A raw HTTP client or one-shot completion command
is not a session agent.

## Adding an OpenAI-compatible provider

Protocol compatibility does not make the provider `openai`. Give DigitalOcean, Hugging
Face, or another service its own provider name so the picker states who receives the
request and whose account pays for it.

When Codex is the interactive client, keep endpoint/authentication configuration in a
named Codex profile and put only the profile plus model selection in the launch table:

```markdown
| provider | vendor/model-a | vendor/model-b |
|---|---|---|
| `example` | `codex --profile example --model vendor/model-a` | `codex --profile example --model vendor/model-b` |
```

The profile owns the compatible endpoint and protocol settings. Its credential comes
from an environment variable or the provider's supported login store, following
`ronin_sops/secrets.md`. Neither the secret nor its value belongs in this repository, the
catalog, a project_root, or a launch command.

OpenAI-compatible is a claim to verify, not a blanket guarantee. Before adding cells,
prove that the provider supports the API shape the current Codex CLI uses, streaming,
tool calls, and the chosen model IDs. Then launch one real session through Ronin and
confirm that the tile reaches a prompt and receives the complete built brief.

## Candidate examples

- **DigitalOcean Gradient AI** documents `https://inference.do-ai.run` as its serverless
  inference base and explicitly describes Codex and other coding agents as supported
  clients. Its model access key stays outside Ronin. Add a `digitalocean` table only after
  a named Codex profile and at least one exact model ID have been exercised end to end.
- **Hugging Face Inference Providers** documents an OpenAI-compatible chat-completions
  endpoint at `https://router.huggingface.co/v1` and model IDs such as
  `openai/gpt-oss-120b:cerebras`. Its compatibility is currently described for chat
  completions, so do not assume it satisfies Codex's full agent/tool protocol; prove that
  with the installed CLI before adding a `huggingface` table.

These are examples, not stock launch entries. A provider appears in the picker only when
its commands are known to launch successfully and its setup can be stated without putting
a credential in the shipped catalog.

## Addition checklist

1. Verify the provider's current first-party API and model documentation.
2. Decide whether this is a new provider profile for a supported agent CLI or a new agent
   terminal interface.
3. Configure and test the CLI/profile outside Ronin; keep credentials out of the repo.
4. For a new agent CLI, capture and test every new-session state in the contract above.
5. Add one provider subsection and one table row; use real model IDs as columns.
6. Put the desired default first and make permission/sandbox policy explicit in the cell.
7. Run `node scripts/check-tests.mjs`, `npx tsx scripts/check-catalogs.ts`, and
   `npm run verify`.
8. Launch every new cell through ＋ New session. Confirm the receipt's command, the agent
   and model visible in the tile, and the complete startup request received by the agent.
