# Message queue

The message queue is the live flow of inbound messages waiting to enter sessions. It is
not a transcript and not a wipeboard: delivered messages disappear immediately, and a
wipeboard post never enters it. When a wipeboard post asks Ronin to interrupt a session,
that separate notice is an inbound message and may wait here.

Its visible home is **Team Commons → Agent Message Queue**, beside Docs, Wipeboard, and
Team Configuration. It is a channel inside the existing Team Commons surface, not a
separate Cowork card or machine-level tab.
When retained messages exist, that channel button uses the theme's warning colour and
bolds the full label; the attention state clears with the empty queue. The tab never adds
a count—the waiting cards are already visible when opened.
An ordinary open of Team Commons lands directly on Agent Message Queue while that
attention state is active. Explicit links to another channel still win, and a newly
arriving message never pulls the owner away from a tab they already chose.
Outside the queue tab, each newly stuck or failed message produces one bounded central
kiiro flash: **Check Team Commons → Agent Message Queue**. Polling does not repeat the
flash for the same retained message.
Each retained card shows **From**, **To**, message type, status and attempts. Waiting age
runs from creation; failed age runs from the failure event. Under an hour the compact
clock includes seconds and visibly advances while the channel is open. A busy eligibility
check that never typed is shown as **Waiting** with zero attempts rather than implying
that delivery itself repeatedly failed.
The channel opens with a short owner-facing note explaining that Agent-to-Agent messages
occasionally need a nudge and that Try Again is gentler than Force.

Every sender uses the same delivery engine. Automatic checks and **Try Again** use safe
delivery: the target must exist and its dial must permit writing; then the message is
typed and submitted **whether or not the Agent is mid-thought** (owner, 2026-09-02) — the
CLIs queue input typed while they work. Exactly two things hold a message: somebody's
unsubmitted draft at the prompt, because typing over what a person is typing is the one
real send violation, and an open dialog, because its Enter would choose on the owner's
behalf. Both retain the card with that reason and are retried when the prompt clears.
A message is recognised by its own text, not only by the prompt row. A long message
wraps into a draft taller than the prompt window; safe delivery still sees it sitting at
the prompt, presses Enter, and confirms. A copy an earlier attempt left stranded at the
prompt is submitted on the next attempt, never typed again and never refused as somebody
else's draft. Only text the pane never showed is retained without an Enter.
If the prompt changes during submission, delivery is ambiguous rather than merely
blocked: the message may have entered while another actor changed the prompt. Ronin marks
it failed and stops automatic retries so it cannot silently send a duplicate.

**Force** is the owner's bounded override. One press types the message once, then spends
at most ten seconds pressing Enter and checking whether it submitted. It may collide with
whatever the Agent is doing. It never runs forever and never types a second copy. Success
removes the card; failure leaves it for another decision.

Every action answers immediately on its button (`Trying…`, `Forcing…`, or `Dismissing…`)
and announces its outcome. A card that clears says **Delivered and cleared** before its
absence becomes the only evidence; a retained message says why it is still waiting.

The queue is working state in the `message_queue` data store. Each item records:
`id`, `from`, `target`, `text`, `source`, `state`, `reason`, `attempts`, `created_at`, and
`updated_at`. Its REST surface is `GET/POST /api/messages`,
`POST /api/messages/:id/retry`, `POST /api/messages/:id/force`, and
`DELETE /api/messages/:id`.
