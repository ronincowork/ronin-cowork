# The tile

A tile shows one session inside a workspace. Open an Agent from the workbench's discovery
column, or drag its card into the workspace where you want to see it.

## The header

| Control | What it does |
|---|---|
| Title / ⛩ | Edit the Agent's displayed title; its session name remains its identity |
| Work Record | Open the Agent's objective, work, and tracked repositories |
| Output | Choose an available output view; Locked is the live terminal |
| Transcript / Chat · Notes · Work · All | When Terminal transcript is active, cycle from the terminal through ever fuller readings of the Agent's conversation and back |
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
transcript. It cycles: **Terminal → Chat → Notes → Work → All → Terminal**, each press
showing more of the record as the CLI itself wrote it. Chat is the conversation alone;
Notes adds the gaps and interruptions; Work adds each tool call as one line; All is
everything, tool output included. The readings are the ones the server offers, so a new
reading appears as a new step. The button is opaque when this Agent has nothing to show — born before Ronin
recorded launch identity, on a CLI with no readable journal, or simply nothing written
yet; pressing it says which. Switching the service on later, or a restart, does not lose
an Agent whose identity was recorded. **Terminal** returns to the normal interactive terminal. The older Output
selector is separate from this switch.

See [Work record](work-record.md) for authored work and [Workbench](workbench.md) for
arrangement and navigation. Contributors can find the implementation in the
[UI ownership index](../../public/js/README.md) and [contributor map](../contributor-map.md#user-interface).
