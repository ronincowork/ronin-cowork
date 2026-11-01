# Agent output

Every Agent has one output file, `~/.ronin/sessions/<agent>/transcript.jsonl`, whatever its
provider. Two reads write it. Everything else (Chat, status, the tool flow) reads only that
file; nothing reads a provider log or a screen around it.

```
 provider log ──► log read ──────┐
                                 ├─► transcript.jsonl ──► Chat, status, tool flow
 terminal ──────► terminal read ─┘
```

## The two reads

Both live in the transcript part (Services `rireki/`, see its `docs/rireki.md`). They append
through the session folder's one write queue, so their lines never interleave and `seq` runs
on across both.

- **Log read:** one adapter per log format (Claude `message-blocks`, Codex `event-items`). It
  runs when the log file changes (a directory watch), resumes from where it stopped, and pushes
  only the new lines. Claude Code writes its private reasoning as empty thinking blocks and the
  narration it prints between tool calls as thinking blocks that carry text: the first is never
  stored, the second is the Agent's `say`, marked `narration`.
- **Terminal read** (`terminal-read.ts`): runs when tmux reports output on the Agent's pane
  (Core's activity subscription, the `onPaneActivity` socket). It reads the screen once and
  writes only what no log holds:
  - for every Agent, an `ask` when a question or permission prompt opens and a `note` when it
    closes;
  - for a CLI with no log read (Grok, or Gemini until it has one), the conversation as far as
    the screen shows it: a `note` when work starts, then a `say` of what the screen newly shows
    and a `turn` when the CLI is ready again. Less complete than a log, in the same shape.

A CLI that keeps no log gets a transcript source with `format: 'terminal'` and an empty `file`,
so its output lives in its session folder like every other Agent's.

## The shape

One JSON line per event: `seq ts role kind text tool state src`, plus `narration` where it applies.

| Field | Holds |
|---|---|
| `seq` | the line's place in this Agent's output, counting up |
| `ts` | when it happened |
| `role` | `user`, `agent`, `system`, `ronin` |
| `kind` | `say` words; `ask` waiting on the person; `tool` a call started; `done` it finished; `turn` the turn ended, normally or `interrupted`; `note` anything structural (session start, compaction, a question closing) |
| `text` | the words, or the tool's full input or output |
| `tool` | on `tool` and `done` only: `name`, `target` (the first meaningful string of the input: the command, path or pattern), `call` (pairs a `tool` with its `done`), `outcome` (`ok` or `error`, only where the log states it; Codex does not) |
| `state` | `final` or `interrupted` |
| `narration` | `true` on a `say` the CLI printed between tool calls (the Agent working aloud, not its reply); Chat draws it in `--muted` italic |
| `src` | where it was read: the log file, byte offset and model, or `terminal: true` |

Tool input and output can hold secrets. Only the Agent's own tile is served `text`; anything
else that uses the shape takes `tool.name` and `tool.target` only.

## Who reads it

- **Chat** (`public/js/tile-transcript.js`) shows the `chat` reading: `say` and `ask` lines.
  The Agent's words are rendered as markdown through `markdown-reader.js`, in `--font-ui` at
  `--text-label` (`--text-heading` on a phone); code and tool lines use Terminal's
  `--font-term` at `--term-size`. The Markdown check on the tile's メ menu turns the rendering
  off, per device. A message the person sends shows at once in `--muted` and is replaced when
  its own `user` line arrives.
- **Status** (`rireki/stance.ts`) is the newest line: `tool` is *working* (with the tool's
  name and target), `ask` is *asking you*, `turn` is *awaiting you*, anything else is
  *working*, and an empty file is *unknown*. Each write calls `rowChanged`, and Core pushes the
  home rows then; there is no clock.
- **Stale or current** is the `ts` of the newest line; which tool lines count as meaningful
  work is the reader's call.

## Readings

`chat`: `say` and `ask`. `notes` (the route's default): plus `note`. `work`: plus `tool`,
`done` and `turn`, with long text cut to its first line. `all`: everything, injected
scaffolding included.

## How a line reaches an open Chat

A browser tab tells the server, on its `/events` socket, every Chat its tiles show:
`{t:'watch', watches: [{session, reading}, …]}`. Each tile owns one entry
(`transcriptWatch()` in `public/js/events.js`), and the tab always sends the whole list, so a
tile leaving Chat never silences another tile's Chat. When a read writes lines, the part hands
them to Core's `deliverToWatchers`, which sends each watching connection the lines its
reading admits (`src/ws/watchers.ts`). A tab that reconnects says its list again and asks for
what it missed by `seq`.
