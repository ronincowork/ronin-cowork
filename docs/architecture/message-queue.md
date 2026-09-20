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
then unconditionally sends Enter. A carriage return sent through
`paste-buffer` is still pasted data and is not a keypress. Raw `send-keys -l` does not
mark a paste, and a fixed pause cannot repair either boundary. There are no screen checks between them, no
fingerprints, no prompt-disappearance verification, and no repeated Enter loop.

The worker deletes the letter after an attempt whether tmux accepts it or not. Delivery
is best effort and never claims that the Agent processed the message.

## Preflight and the two-minute limit

The worker resolves the current session by name and checks its input before typing. A
recognized draft or dialog holds the message without inserting anything.
Thinking by itself does not hold delivery, and must not hide a draft or dialog.
Unknown screens do not hold delivery. The preflight is deliberately best effort.

Waiting messages retry every two seconds. At two minutes from acceptance, Ronin bypasses
Control and input checks and sends once. Continued typing and retries do not reset the
deadline. This deliberately accepts colliding with an unfinished draft or a dialog.
The deadline is fixed; the former `messages.auto_force_after_s` setting is no longer used.
A stopped server cannot meet the deadline; waiting letters are considered when it runs.
At the deadline the worker attempts delivery once and deletes the letter regardless of outcome.

Ronin's message box posts plain text to `POST /api/messages`, in either terminal view,
and enters the same queue as every other complete message. It does not depend on the
terminal WebSocket. One Enter or tap enqueues; a second press while the request is in
flight does nothing. Shift+Enter inserts a newline. A bare Enter in an empty box remains a direct key.
The box clears when the server accepts responsibility for the message, unless the owner
has edited it in the meantime. A refusal or network error keeps the text with a reason.

Every producer only writes a queue file. One server worker reads letters oldest first and
finishes one before considering the next, so paste and Enter transactions cannot interleave.
Direct human terminal input does not enter this queue.

## Retention and actions

A letter remains only while a recognized draft or dialog holds it before the two-minute
deadline. A missing target is shredded. A reused name receives the letter. A transport
failure is shredded after the attempt. There are no failure states, negative acknowledgements,
birth bindings, attempt counters, manual retry, or manual force. Dismiss removes a waiting
letter. Wipeboard posts and durable work receipts remain separate from interruption copies.

## API

- `GET /api/messages`
- `POST /api/messages` with `{ "target": "agent", "text": "message" }`: enqueue
- `DELETE /api/messages/:id`
- `DELETE /api/messages` with `{ "ids": ["..."] }`

`POST /api/sessions/:name/send` also enqueues through this path.
