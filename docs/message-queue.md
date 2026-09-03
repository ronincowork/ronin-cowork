# Message queue

`tejun-send` calls the operator's HTTP message surface and prints its delivery reply.

## TL;DR

Ronin accepts a message only for a live session and binds it to that session's birth
identity. It tries delivery immediately and continues while the message is safely
retryable. An Agent thinking or running a tool still receives the message.

Automatic delivery waits when the target's Control setting does not allow Agent writes,
when a dialog is open, or when somebody else's draft is present. It stops after an
uncertain submission to avoid sending a duplicate. **Force** is an
owner-only override that accepts the collision risk. Delivered messages disappear;
retained messages expire after 48 hours.

## Acceptance and identity

- A target must be a valid name on the live roster.
- A nonexistent target is refused. The refusal points to the roster and the team's
  wipeboard.
- An accepted message stores the target session's durable key. The name alone is never
  its identity.
- If the target ends, or the name belongs to a different session birth, the message
  becomes **Target missing**. It cannot be delivered or forced; the owner may dismiss it.
- Every retained message expires 48 hours after acceptance.

The queue is transport, not a record. Delivered and expired items leave no archive here.
RIREKI and TEGAMI hold the records.

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

Force is explicit and never automatic. It rechecks the target identity, bypasses the
Control setting and prompt-safety checks, types one copy, and tries Enter for at most ten
seconds.

Force may collide with a draft, act on a dialog, or duplicate a message whose earlier
submission was uncertain. Use it only after inspecting the retained card and accepting
those risks. Success clears the card; failure leaves it visible.

## Team Commons

The queue is **Team Commons → Agent Message Queue**, beside Docs, Wipeboard, and Team
Configuration.

- A retained message gives the channel warning emphasis.
- Opening Team Commons selects the queue when it needs attention, unless an explicit
  channel link was requested.
- A new retained problem produces one bounded notification: **Check Team Commons → Agent
  Message Queue**. Polling does not repeat it.
- Each card shows From, To, message type, state, age, attempts, text, reason, and the
  actions valid for that state.
- Actions report their result immediately. Successful delivery says **Delivered and
  cleared** before the card disappears.

## Stored shape and API

Each queue item contains `id`, `from`, `target`, `target_key`, `text`, `source`, `state`,
`reason`, `attempts`, `created_at`, `updated_at`, and `expires_at`.

The REST surface is:

- `GET /api/messages`
- `POST /api/messages`
- `POST /api/messages/:id/retry`
- `POST /api/messages/:id/force`
- `DELETE /api/messages/:id`
