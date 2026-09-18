# Terminal controls

Every Ronin browser Tile uses four actions. The CLI running inside it does not choose
your browser shortcuts. These controls work on desktop and mobile, locked or unlocked.

## Default shortcuts

| Input | Codex | Claude | Gemini | Grok | Hermes |
|---|---|---|---|---|---|
| Escape — Stop | Escape | Escape | Ctrl+C | Ctrl+C | Ctrl+C |
| Ctrl+Shift+Backspace — Clear | Ctrl+C | Escape | Ctrl+C | Ctrl+C | Ctrl+C |
| Ctrl+Shift+X — Close | Confirm | Confirm | Confirm | Confirm | Confirm |
| Ctrl+C | Blocked | Blocked | Blocked | Blocked | Blocked |

Clear means the entire unsubmitted input box. Confirm opens the Ronin close dialog.
Copy uses Option-drag and Cmd+C on Mac, or Shift-drag and Ctrl+C on Windows/Linux.

**Hints** is pinned below the selector's scrolling cards. **Agent vocabulary** sits above
**Session controls**; each starts expanded and saves its own collapsed state, independently
of the roster. Vocabulary gives short phrases to use with an Agent, drawn from the
[tool catalog](../../ronin_catalogs/TOOLS.md). The vocabulary calls visible creation
**Create new session (Agent)** so an agent CLI does not mistake the owner's request for
internal spawning.

A failed locked-terminal selection attempt expands Session controls and flashes it orange,
instead of showing a popup. Mobile has no Hints card; its four action buttons use the
existing composer keys row alongside the other terminal tools. The output area ends above the
controls and entry box, including when the draft grows or the phone keyboard opens.
Desktop Hints uses bold labels and wrapping text, without action buttons or help links.

## Change your shortcuts

Ask your Agent to change a shortcut. There is no customization or Help button in Hints.

For the Agent: the single saved map is `terminalControls.bindings` in
`machine_settings.json` under `ronin-store config`. Read `GET /api/terminal-controls`,
then update the three bindings together through `PUT /api/terminal-controls`:

```json
{"bindings":{"clear":"Ctrl+Shift+Backspace","close":"Ctrl+Shift+X","stop":"Escape"}}
```

The API validates chords and rejects duplicates and reserved browser keys. Retain the
other bindings when changing one. Avoid chords assigned in the owner's pad. Browser
clients reread the map when they regain focus or reload. Copy is never remapped here.

Provider output sequences are separate: edit `stop_keys` or `clear_keys` in the relevant
[Agent document](../agents/README.md). Ronin reads those fields for each control request.

Native Copy, Cut, Paste, Select All and Undo remain browser operations in ordinary text
fields, including the Ronin composer. Copy has no Ronin shortcut or remapping field. With terminal text selected, native
Cmd+C / Ctrl+C copies it. Terminal Ctrl+C is intercepted so it cannot quit the Agent; without a native Copy
selection it sends nothing. Close uses Ctrl+Shift+X. Escape dismisses an
open Ronin sheet/menu first. No shortcut leaks through that sheet into the Agent.

## Clear and Stop are different

Clear removes the browser's entire unsent draft when that is the focused input. It
never recalls a message already accepted by the delivery queue. At the CLI, Clear sends
its registered native sequence once: Claude gets Escape; Codex, Gemini, Grok and Hermes
get Ctrl+C. Ronin does
not classify the screen or reinterpret the result. These keys retain the CLI's native
behavior, including interrupting activity or handling an empty prompt differently.
Unknown CLIs have no guessed control sequence.

Stop sends the registered interrupt once. It does not wait for the CLI to look idle or
confirm that a tool stopped. A CLI may consume it in an open menu, or stop a tool at its
own cancellation boundary. Repeated deliberate presses have the CLI's native semantics;
Ronin does not repeat held keys or retry after a network failure. Successful control actions are
silent; a failed request reports the error.

## Copy while locked

Desktop: Option-drag on macOS or Shift-drag elsewhere selects through applications
that capture the mouse. Copy uses the originating Tile's selection, never another Tile's.
Mobile: tap Copy to get a still text snapshot and use native selection handles. If the
browser denies clipboard access, the snapshot remains available for native Copy.
The snapshot contains available terminal history, not a claim to the complete transcript.
Selecting/copying neither unlocks the Tile nor sends input to the CLI.

## Close

Close opens the existing Archive / Delete / Hard Delete sheet. Read the consequences
there. Archive requires supported conversation identity and resume. Delete checks the
Agent's managed worktrees. Hard Delete requires its separate explicit confirmation. Hide view only
hides the Tile and keeps the Agent running.

## Implementation ownership

- `src/terminal-controls.ts`: default bindings, validation, settings API, intent dispatch.
- `public/js/terminal-controls.js`: shortcut interception, mobile buttons and Hints.
- `docs/agents/*.md`: authoritative CLI Stop/Clear sequences; [Agent integration index](../agents/README.md).
- `src/tmux.ts`: persisted launch identity (`sessionType`, `cli`, `provider`, `model`).
- `public/js/session-retire.js`: the existing Close confirmation and shutdown flow.

Controls act on the identity stored with the session. They do not detect the provider
from terminal output. Model is the model selected at launch; an in-CLI model switch does
not change the CLI control adapter. Older sessions use their existing CLI launch stamp;
unidentified terminals have no guessed Stop/Clear adapter. Their local Clear, Copy, and
confirmed Close still work. A control waits only for an already-started queued paste and
its Enter to finish, never for the message queue's typing grace.
