# Message queue

`tejun-send` calls the operator's HTTP message surface and prints its delivery reply.

## TL;DR

Ronin accepts a message only for a live session and binds it to that session's birth
identity. It tries delivery immediately and continues while the message is safely
retryable. An Agent thinking or running a tool still receives the message.

Automatic delivery waits when the target's Control setting does not allow Agent writes,
when a dialog is open, or when somebody else's draft is present. It stops after an
uncertain submission to avoid sending a duplicate. **Force** is an
owner-only override that accepts the collision risk. **Auto-force**, on by default, does
the same to any retained message older than two minutes, once; the owner can switch it
off or change the delay. Delivered messages disappear;
retained direct tells expire after 30 minutes and wipeboard interruption notices after
10 minutes. Other retained transport expires after 60 minutes.

## Acceptance and identity

- A target must be a valid name on the live roster.
- A nonexistent target is refused. The refusal points to the roster and the team's
  wipeboard.
- An accepted message stores the target session's durable key. The name alone is never
  its identity.
- If the target ends, or the name belongs to a different session birth, the message
  becomes **Target missing**. It cannot be delivered or forced; the owner may dismiss it.
- Direct Agent tells expire after 30 minutes. Wipeboard interruption notices expire
  after 10 minutes; the wipeboard post itself remains durable. Owner, House, and cron
  transport expires after 60 minutes, including system notices whose durable receipt or
  wipeboard entry remains authoritative.
- A manually dismissed or expired direct tell sends one House negative acknowledgment
  to its original base Agent, when that session still exists. House messages and viewer
  (`grid_`) identities never generate another acknowledgment, preventing loops.

The queue is transport, not a record. Delivered and expired items leave no archive here.
RIREKI and TEGAMI hold the records.

Messages are identified by their generated queue ID, not their content. Ronin does not
collapse repeated text: two intentional tells with the same words remain two messages.

## Automatic delivery

Acceptance starts one safe attempt. Retryable messages are checked every two seconds.
**Try Again** starts the same safe attempt immediately.

A safe attempt checks the target identity and Control setting, then reads the target tile:

- **You only** and **Read** hold the message; **Read and write** allows delivery.
- An open dialog or menu holds the message.
- Somebody else's unsubmitted draft holds the message.
- Thinking, tool use, or an unrecognized prompt does not hold the message. Ronin types
  the message and submits it because the Agent CLI queues input while it works.
- If the same message is already at the prompt, Ronin submits that copy without typing a
  second one.

After typing, Ronin confirms that the message leaves the prompt. It presses Enter once
and may retry Enter three times. It never types a second copy during that attempt.

## Retained states

- **Waiting** — delivery has not typed: the target's Control setting does not allow Agent
  writes, a dialog is open, or a foreign draft is present. Automatic retries continue.
  These checks do not increase Attempts.
- **Failed** — delivery typed or may have typed, but success is uncertain: the text never
  appeared, a dialog opened during submission, the prompt changed, the text remained
  after the Enter retries, or an error followed typing. Automatic retries stop.
- **Target missing** — the original target session is gone or its name was reused.
  Dismiss is the only action.

Attempts increases when safe delivery types a new copy and whenever the owner presses
Force. Submitting an already-present copy does not increase it.

## Force

Force rechecks the target identity, bypasses the Control setting and prompt-safety
checks, types one copy, and tries Enter for at most ten seconds.

Force may collide with a draft, act on a dialog, or duplicate a message whose earlier
submission was uncertain. Success clears the card; failure leaves it visible.

Force is the owner's act, in one of three forms:

- **Force** on a card forces that message.
- **Force Selected** forces the chosen cards, one live pane at a time, by the exact IDs
  displayed; a message that arrived after the selection is never forced by accident. A
  target-missing card cannot be forced and is left out of the count.
- **Auto-force** is a standing choice, **on by default at two minutes**: polite for that
  long, then force. The machine setting `messages.auto_force_after_s` (⚙ Machine Settings →
  messages, or the **Auto-force after 2 min** switch on the Messages tab, which flips
  between 120 and 0) makes the two-second sweep force any Waiting or Failed message older
  than that delay, exactly as if the owner had pressed Force on its card. 0 means never;
  an absent value means the default. A message is auto-forced **once**: `auto_forced_at` records it, a
  failed force stays on the card with its reason and the time, and only a manual press
  tries again. Target-missing messages are never auto-forced.

## Why did Ronin force my message, and why was one dropped?

The short answers, for an owner or for Mika answering one:

- **"A message went in while I was typing / while a dialog was open."** Auto-force is on
  (the default) and the message had waited two minutes. Ronin was polite for that long:
  safe delivery holds while the target's Control setting is not read-and-write, while a
  dialog or menu is open, and while somebody's unsent draft sits at the prompt. After the
  delay it forces once, exactly as if you had pressed Force on the card. Switch it off with
  the **Auto-force after 2 min** button on Team Commons → Messages, or set the delay in
  ⚙ Machine Settings → messages (seconds; 0 = never).
- **"A message says Failed and never arrived."** Delivery typed it but could not confirm the
  send, or the one auto-force did not get through. The card stays with its reason and the
  time it was auto-forced. Press **Force** to try again by hand, or **Dismiss** it.
- **"A message disappeared without being delivered."** It expired: direct tells after 30
  minutes, wipeboard interruption notices after 10, other transport after 60. A dismissed or
  expired direct tell sends one House note back to the Agent that sent it. The wipeboard
  post itself is never dropped; only its interruption copy is.
- **"Target missing."** The session it was for has ended, or its name now belongs to a new
  session. Nothing can deliver it; dismiss it and send again to the live session.
- **"Messages keep forcing and I do not want that."** Turn the switch off. Force then
  happens only when you press it, per card or with **Force Selected**.

## Team Commons

The queue is **Team Commons → Messages**, beside Docs, Wipeboard, and Team
Configuration.

- A retained message gives the channel warning emphasis.
- Opening Team Commons selects the queue when it needs attention, unless an explicit
  channel link was requested.
- The only notification is for a message whose two-minute auto-force finished and did not
  land, so the card is there to see: **A message was forced after 2 min and still did not land**, once
  per message. A new arrival, a Waiting card, or a missing target never flashes; the
  channel's warning emphasis carries those.
- Each card shows From, To, message type, state, age, attempts, text, reason, and the
  actions valid for that state.
- The queue view is machine-wide. The toolbar is two groups. Left: **Select All**
  (reads **Clear Selection** once every displayed card is chosen), **Force Selected**, and
  the **Auto-force after 2 min** on/off switch. Right: **Dismiss Selected** and **Dismiss All**.
  A chosen card is outlined. Bulk force and bulk dismissal send the exact IDs in the
  displayed snapshot, so a newly arrived unread message is neither forced nor swept by
  accident.
- Actions report their result immediately. Successful delivery says **Delivered and
  cleared** before the card disappears.

## Stored shape and API

Each queue item contains `id`, `from`, `target`, `target_key`, `text`, `source`, `state`,
`reason`, `attempts`, `created_at`, `updated_at`, and `expires_at`; `auto_forced_at` is
present once the sweep has auto-forced it, and `auto_force_failed_at` once that force
finished without delivering.

The REST surface is:

- `GET /api/messages`
- `POST /api/messages`
- `POST /api/messages/:id/retry`
- `POST /api/messages/:id/force`
- `POST /api/messages/force` with `{ "ids": ["..."] }` for exact-ID bulk force; answers one outcome per ID
- `DELETE /api/messages/:id`
- `DELETE /api/messages` with `{ "ids": ["..."] }` for exact-ID bulk dismissal

Dismissal wins over an attempt already in progress: a late failed-attempt write cannot
recreate the dismissed item.
