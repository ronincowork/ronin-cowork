# The tile

A tile shows one session inside a workspace. Open an Agent from the workbench's discovery
column, or drag its card into the workspace where you want to see it.

## The header

| Control | What it does |
|---|---|
| Title / ⛩ | Edit the Agent's displayed title; its session name remains its identity |
| Work Record | Open the Agent's objective, work, and tracked repositories |
| Output | **Terminal Mirror** — the live terminal — or **Locked**, the same terminal to watch without typing into it |
| Transcript / Chat · Notes · Work · All · Term | When Terminal transcript is active, cycle from the terminal through ever fuller readings of the Agent's conversation and back |
| Mention | Add another session's name to the message box |
| Docs | Open documents tracked by this Agent |
| × | Open the archive/delete choices |
| − | Close this view while the Agent keeps running |

The context gauge appears when Ronin has a reading from the session. An empty workspace
has no Agent for session-specific actions to operate on.

New Agents start read/write. There is no Control choice in the current tile header.

## Type, copy, and paste

Use the terminal to interact directly with the provider CLI, or write a message in the
composer under it. Enter sends the composer message; Shift+Enter (Option+Enter on a Mac)
adds a line. The composer keeps the draft when delivery fails so you can recover it.

For terminal text selection, hold **Option** on a Mac or **Shift** on Windows/Linux while
dragging, then use the normal copy shortcut. Without the modifier, the running terminal
application may receive the drag as mouse input.

Use [Terminal controls](terminal-controls.md) for Stop, Clear, Copy, and Close, including
provider differences and mobile controls. Close and hide view have different consequences;
see [Archived sessions](archived-sessions.md).

## Output availability

The separate **Transcript** button appears when Ronin Services has loaded Terminal
transcript. It cycles: **Term → Chat → Notes → Work → All → Term**, each press
showing more of the record as the CLI itself wrote it; the button always names where you
are now. Chat is the conversation alone;
Notes adds the gaps and interruptions; Work adds each tool call as one line; All is
everything, tool output included. The readings are the ones the server offers, so a new
reading appears as a new step. The button is opaque when this Agent has nothing to show — born before Ronin
recorded launch identity, started outside Ronin, on a CLI with no readable journal, or
simply nothing written yet; pressing it says which. Switching the service on later, or a restart, does not lose
an Agent whose identity was recorded. **Term** returns to the normal interactive terminal.

While you are reading any of the readings, the message box stays with you: the record
itself is read-only, but the Agent is live, and the box below it talks to the Agent the
same way it does over the terminal.

On a phone the button sits in the bar at the top, because the tile's own header is not on
screen there, and it is a two-state toggle: **Term** or **Chat**. The fuller readings are a
desk thing; a thumb wants the conversation or the terminal.

The Output selector beside it is a different question — whether this tile's terminal takes
your typing — and it offers Terminal Mirror or Locked. It once listed Detailed, Condensed,
Cherry Pick and Agent Summary as well: those were views of a recording Ronin no longer
makes, so choosing one showed an empty tile. They have left the list, not the source; if
Agent Summary returns it will be written from the conversation, like everything else here.

## What an Agent is doing

While you are reading the conversation, the end of it shows what the Agent is doing now:
three dots on the Agent's side, where its next line will appear, while it is working or
writing one. When it is your turn the end is simply empty — that is how a conversation says
it is waiting for you. If it is stopped at a question it says so in words instead, because
that one needs you to do something and a decoration would not say it. If the dots are
unwelcome, a system "reduce motion" setting leaves them still.


Each Agent's row says its **stance**: *working…*, *replying…*, *awaiting you*, or *asking
you*. It is read from the conversation the CLI itself wrote — a tool going out is a record,
a finished reply is a record — so it does not depend on what happens to be drawn on the
terminal. An Agent whose CLI keeps no readable conversation says nothing rather than
guessing.

*Asking you* is the exception and the one that matters most: a permission prompt is drawn on
the screen and no CLI writes it down, so that one is read from the terminal, and it outranks
the rest. An Agent stopped at a question is busy as far as its own journal knows, and "busy"
is the wrong thing to tell the person whose answer it is waiting for.

See [Work record](work-record.md) for authored work and [Workbench](workbench.md) for
arrangement and navigation. Contributors can find the implementation in the
[UI ownership index](../../public/js/README.md) and [contributor map](../contributor-map.md#user-interface).
