# The Agent card

An Agent's card is the one truth about that Agent. The browser (its selector pill, tile head,
Chat's status line and question, the roster and home rows), the Agent flags, the no-progress
timer, the answer and Resume routes and the lead notices read the card and nothing else.
Nothing reads tmux, a hook record or a log to say what an Agent is doing; those are inputs to
the card.

## Its parts and their owners

A card is the Agent's listing entry plus three parts, each read only when it is marked
(KAN-641), the rest kept as last read.

| Part | Fact on the card | Its one owner |
|---|---|---|
| listing entry | name, title, Teams, leads, key, Campaign, transcript source | the server's session list: tmux session options (`listSessions`, `src/tmux.ts`) |
| listing entry | `identity` (CLI, provider, model asked for) | launch identity, the `@ronin-identity` option written at launch |
| `pane` | `ctx` (context gauge), `model` (what the CLI says it runs) | tmux: the pane's screen (`readPane`, `src/routes/launch.ts`) |
| `pane` | a question drawn on screen, for a CLI without hooks | tmux: the pane's screen (`asksForInput`, `src/status.ts`) |
| `fields` | `stance`, `at`, `tool`, `exit` | two inputs, one rule (below): the CLI's hooks (`hook.json`, `src/asking.ts`) and the CLI log via rireki (Services `rireki/stance.ts`); a dead pane (`src/pane-death.ts`) |
| `fields` | `question` | the hooks alone |
| `fields` | `stopped_at` | a Stop Ronin sent (`src/stopped.ts`), until the Agent writes a line |
| `fields` | `secret_ask` | the `secret` tool's open ask (`src/secrets.ts`) |
| `record` | `tegami`: objective, repos, Teams, holds, items, docs, brief, `flags` (items' entries) | the work record files (`tegami.md`, `AGENT_BRIEF.md`, `drop/`) and item writes |
| derived | the Agent's own entry in `tegami.flags`: `{ why }` with `asking`, `no_progress` or `stopped` | worked out in `cardOf` from the parts above; never stored |

### Flags: one source (KAN-776)

`tegami.flags` is the only place an Agent's flag lives; every surface reads it and nothing
else, and a non-empty list is ⚑: the selector pill (⚑ after the name, amber), the Team rows,
Home's flagged colour, the tile header ⚑ and phone bar, and the work record. Each entry is
`{ id?, why }`:

- **With an id**: a flagged item the Agent holds, or, for a lead, one a Team it leads holds.
  `why` is the item's last "Flagged:" comment. `readTegami` (`src/tegami-read.ts`) builds these
  from the work record's reading. The entry goes when the item is unflagged; one press on the
  header ⚑ unflags them all.
- **Without an id**: the Agent's own flag, `why` one of `asking`, `no_progress`, `stopped`.
  `cardOf` adds it to the same list from the pane and hooks; it goes when the Agent moves on,
  and the header press leaves it.

### Where two inputs meet: status (KAN-664)

`cardFields` in `src/asking.ts` is the one place status is decided:

- A dead pane (*stopped*, KAN-660) is over everything.
- Otherwise the turn state (working, awaiting you, interrupted, error) is the newer input's, by
  time: the hook record's `at` against the log's newest status line. A hook event lost while
  Ronin restarts, or a turn no hook closed (Esc), is put right by the log's next line.
- What only one input knows comes from it: a question or permission prompt from the hook
  record, kept while the hook is newer or the log still says *asking*; an error as the log
  states it.
- An Agent with one input has that one: a CLI without hooks, its log; a log with no line yet,
  the hooks.

On top of that, `cardOf` shows *asking* for a question (hooks, or the screen for a CLI
without hooks), *no progress* for a working card whose `at` is 12 minutes old
(`createNoProgress`), and *interrupted* while a Ronin Stop waits for the Agent's next line.

## How it travels

```
 tmux pane output ─────────► mark(name,'pane')   ┐
 hook event, log line,                           │
 dead pane, answer, Stop,  ─► rowChanged ─► mark(name,'fields') ─► rebuild ─► cardOf ─► {t:'card', rev, card}
 secret ask, no-progress                         │
 work record file, item write ─► mark(name,'record') ┘
 session list moved (tick) ─► mark every card ─► rebuild ─► {t:'cards', rev, cards}
```

- **Mark.** Each writer marks the one part it changed on the one card it touched:
  tmux's activity subscription marks `pane`; every `rowChanged` (a hook event, a log line
  rireki wrote, a dead pane, an answer from Chat, a Stop, a secret ask, the no-progress timer)
  marks `fields`; the Agent's folder watcher (`watchRecord`) and an item write (`cardsOf`,
  `src/work-items.ts`: holders, watchers, the holder it moved from, a holding Team's leads)
  mark `record`.
- **Rebuild.** `rebuild` (`src/ws/events.ts`) reads each marked card's marked parts only,
  through `cardOf`, and sends `{t:'card', rev, card}` when its text moved. A mark that lands
  meanwhile is read on the next round.
- **Whole set.** `{t:'cards', rev, cards}` goes only on connect and when the session listing
  moved (the tick). A tab whose next card is not `rev + 1` renews its socket for a whole copy.
- **No polling.** Nothing is read on a clock; with no tab connected nothing is marked, and the
  next connection's tick makes every card.
- **notify_me.** Every `rowChanged` also runs `checkTurnEnd` (`src/notify-me.ts`), tab or no
  tab. An Agent with a `notify_me.json` in its folder has its fields read; a turn's end
  (`awaiting_you`, `asking`, `error`) newer than a caller's mark sends that caller one House
  notice through the message queue and drops its mark.

### A status change repaints one node

A status change marks `fields` only: never `pane` or `record`, never every card, never
`{t:'cards'}`. The server sends one `{t:'card'}` per change. In the browser the store swaps
that card in by name (`public/js/store.js`); the keyed lists (KAN-412) redraw only that
Agent's row, and the tile's Chat redraws only its status node (`setStance` →
`paintStance`, `public/js/tile-transcript.js`), leaving the transcript and the rest of the
card as they are. Every tile hears every card push (`subscribe('home')`, `public/js/tile.js`),
so whatever a tile paints from it writes only what changed: another Agent's push changes
nothing in this tile.

## In the code

| What | Where |
|---|---|
| making a card | `src/routes/launch.ts` `cardOf` |
| the fields part, status precedence | `src/asking.ts` `readFields`, `cardFields` |
| the hook record | `src/asking.ts` `hookRecordOf`, `recordHook`; `/api/asking` in `src/routes/launch.ts` |
| the log's status line | Services `rireki/stance.ts` `readStance`, contributed by `rireki/register.ts` |
| a dead pane | `src/pane-death.ts` `paneDied` |
| a Ronin Stop | `src/stopped.ts` `noteStop`, `stoppedAt` |
| no progress | `src/asking.ts` `createNoProgress` |
| the pane part | `src/routes/launch.ts` `readPane` |
| the record part | `src/tegami-read.ts` `readTegami` |
| marking, rebuild, the tick | `src/ws/events.ts` `mark`, `rebuild`, `tick`, `watchRecord`, `startSessionsBroadcast` |
| whose cards an item write touches | `src/work-items.ts` `cardsOf` |
| a turn's end told to a caller | `src/notify-me.ts` `markTurnEnd`, `checkTurnEnd`; `ronin_bin/notify_me` |
| the browser's copy | `public/js/store.js` (`home`) |
