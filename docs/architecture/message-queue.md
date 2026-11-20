# Message delivery

There are two input paths:

- Direct terminal typing stays direct: keys, including Enter, go to the Agent.
- Complete messages use the message queue: direct tells, House receipts, wipeboard
  notices, and Ronin's message box (on mobile and in Unlocked views).

At birth, Team and wipeboard guidance travels with the initial brief. Launch records
Team membership on the board without queuing a second prompt into the starting CLI.
Later membership changes still send their notices through this queue.

## One send operation

Delivery means **paste the text, then press Enter**. A private tmux buffer
uses `paste-buffer -p -r` to mark the paste boundary when the CLI requests bracketed
paste and preserve embedded newlines. The buffer is deleted after use. Enter is sent
separately, outside that boundary, as a real tmux `Enter` key action. Ronin first asks
tmux to leave copy mode, ignores the harmless error when copy mode was not active, and
then unconditionally sends Enter, and one second later sends Enter once more (owner,
2026-10-24): the CLI handles some pastes asynchronously — a long one becomes a
`[Pasted text #N]` chip, an image path an `[Image #N]` chip, and no rule over the text says
which — so an Enter that arrives before the chip finds an empty box and the message sits
unsubmitted; on a box that did submit, the second Enter is a no-op (Claude Code and Codex
each ignore Enter on an empty composer). A carriage return sent through
`paste-buffer` is still pasted data and is not a keypress. Raw `send-keys -l` does not
mark a paste, and a fixed pause cannot repair either boundary. There are no screen checks between them, no
fingerprints, no prompt-disappearance verification, and no repeated Enter loop: one timer, two Enters.

The worker deletes the letter after an attempt whether tmux accepts it or not. Delivery
is best effort and never claims that the Agent processed the message.

## Preflight and the two-minute limit

The worker resolves the current session by name and checks its input before typing. A
recognized draft or dialog holds the message without inserting anything. A dialog is the
CLI's numbered choices or its footer (`Esc to cancel`), so a trust prompt with no numbers
is one.
Thinking by itself does not hold delivery, and must not hide a draft or dialog.
Unknown screens do not hold delivery. The preflight is deliberately best effort.

Waiting messages retry every two seconds. At two minutes from acceptance, Ronin sends once
past a draft. Continued typing and retries do not reset the deadline. An open dialog is
never sent past: its Enter would choose an option (a trust prompt's "No, exit" ends the
Agent), so the letter waits until the dialog is answered.
The deadline is fixed; the former `messages.auto_force_after_s` setting is no longer used.
A stopped server cannot meet the deadline; waiting letters are considered when it runs.
Past the deadline, with no dialog open, the worker attempts delivery once and deletes the letter regardless of outcome.

Ronin's message box posts plain text to `POST /api/messages`, in either terminal view,
and enters the same queue as every other complete message. It does not depend on the
terminal WebSocket. One Enter or tap hands the text over and the box clears on that press,
whatever the answer or the terminal is doing; the box never sends it again (KAN-623: a box
that waited on a late answer kept the text, and the next press delivered it twice). Messages
leave in press order, each after the one before has its answer. Shift+Enter inserts a newline.
A bare Enter in an empty box remains a direct key, except while a message is on its way.
A refusal or network error gives the text back, ahead of anything typed since, with a reason.

Every producer only writes a queue file. One server worker reads letters oldest first by
`created_at`, which the queue keeps total: each letter a process queues is stamped at least
one millisecond after the last, so two queued in the same millisecond never tie and fall back
to their random file names (2026-10-24). The worker
finishes one before considering the next, so paste and Enter transactions cannot interleave.
Direct human terminal input does not enter this queue.

## The From line

Each letter reaches the Agent headed with who sent it and through what:
`From @agent [Tell]:`, `From Owner [Ronin Box]:`, `From Ronin House [House notice]:`. What the
person types in an Agent's own Message box arrives bare, exactly as if typed into the terminal
(owner, 2026-10-22).

In a hosted office the browser request (or the `/pty` upgrade, for an open tab's old Message box
frame) names a signed-in person (src/office-people.ts). Their letter records them in `person`,
`from` is their label, and the head says who, typed included:
`From a@x.com, owner [Message box]:`, or `From Ann Lee <a@x.com>, owner, X Ltd [Ronin Box]:` when
members.json carries a name and organization. Self-hosted, or a local caller, it is as above.

## A seat's inbox

A seat has no terminal to type into: a daimyo, the user's own AI manager driving the office from
outside ([seats.ts](../../src/seats.ts)). A letter for a seat skips the queue and lands in its
inbox with its From and channel. The daimyo reads it through the daimyo API's `inbox` (the
Services part, on the `readInbox` socket), "since my last look": each read gives what came after
the cursor and moves the cursor. With nothing new, a read can wait up to 90 seconds for the
first entry; it watches the store, so any writer wakes it. Nothing on the box reads a seat's
inbox. The daimyo's own Tells go out through the same `message` command as `edges send`, on its
token, so the sender is the seat and the head reads `From @<daimyo> [Tell]`; a Team's name goes
to the Team's live lead(s). That Tell is also kept in the seat's own file, marked with `to`, so
its tile shows the thread both ways (where a terminal would be); the inbox read leaves those out.
What the user types in the daimyo's tile goes in like any Message box letter. The server watches
the seats store and pushes the seat's card (its `thread`) when the file moves. This isn't a second notice
system. Every notice still goes through `enqueueMessage`, and a seat is on the roster
(`listSessions`) with its Teams and leads, so a Team's notices reach a daimyo lead the way they
reach any lead.

## Retention and actions

A letter remains while a recognized dialog is open, or while a draft holds it before the
two-minute deadline. A missing target is shredded. A reused name receives the letter. A transport
failure is shredded after the attempt. There are no failure states, negative acknowledgements,
birth bindings, attempt counters, manual retry, or manual force. Dismiss removes a waiting
letter. Wipeboard posts and durable work receipts remain separate from interruption copies.

## API

- `{t:'messages', list}` on `/events`: the waiting queue, sent to a fresh connection and
  whenever a file in the queue folder changes and the queue moved
- `POST /api/messages` with `{ "target": "agent", "text": "message" }`: enqueue
- `DELETE /api/messages` with `{ "ids": ["..."] }`

`POST /api/sessions/:name/send` also enqueues through this path.
