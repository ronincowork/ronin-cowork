# Message queue

## TL;DR

Ronin accepts mail only for a session that exists now and binds it to that exact session
birth, not to a reusable name. It tries immediately. Thinking or running a tool does
**not** hold a message: Agent CLIs queue input while they work, so Ronin types and submits
it. Automatic delivery waits only when it would cross a visible boundary—another draft is
at the prompt, a dialog is open, or the target dial is not 🤖. Waiting mail is tried again
every two seconds and when the owner presses **Try Again**.

Once Ronin has typed a message, an uncertain result stops automatic retries rather than
risking a duplicate. **Force** is the owner's explicit override for a retained card: it
skips the dial and prompt-safety checks, types one copy, and spends at most ten seconds
trying Enter. Force is never automatic and can collide with a draft, answer a dialog, or
duplicate a message whose earlier delivery was ambiguous. A missing or reborn target can
never be forced; its card offers **Dismiss** only. Every retained item expires after 48
hours because this queue is transport, not history.

### When mail is held

- **Before typing:** the target dial is not 🤖, a dialog/menu is open, or somebody else's
  unsubmitted draft is at the prompt. These stay **Waiting**, do not increment Attempts,
  and remain eligible for automatic retry.
- **After typing:** the text never appeared in the pane, a dialog opened during submission,
  the prompt changed before delivery could be confirmed, the text remained after the
  bounded Enter retries, or delivery threw an error. These become **Failed** and automatic
  retries stop, because another copy could be worse than a visible decision for the owner.
- **Target gone:** the original session ended or the name now belongs to another birth.
  This becomes **Target missing**; only Dismiss is available.

### Attempts and Force

An automatic attempt runs once when mail is accepted, then every two seconds while its
state remains retryable. **Try Again** invokes that same safe attempt immediately. The
Attempts number increases only when safe delivery types a new copy, or when the owner
presses Force. Finding this message already stranded at the prompt submits that existing
copy without incrementing the number. Safe submission presses Enter once and may retry
Enter three times; it never types a second copy. Force types one copy and repeatedly tries
Enter for at most ten seconds. Use Force only when the owner has inspected the retained
card and deliberately accepts its collision or duplicate risk.

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
clock includes seconds and visibly advances while the channel is open. A dialog or foreign
draft that correctly prevented typing is shown as **Waiting** with zero attempts rather
than implying that delivery itself repeatedly failed.
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
A message to a name that is not on the roster is **refused**, with directions to choose a
live session from the roster or use the team's wipeboard. Accepted mail binds to the
target's durable session key, not its reusable name. If that session ends, its retained
card changes to **Target missing** and offers Dismiss only; a later session born with the
same name can never receive it. All retained mail expires after 48 hours. The queue is a
transport, not a record; RIREKI and TEGAMI remain the records.
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
`id`, `from`, `target`, `target_key`, `text`, `source`, `state`, `reason`, `attempts`,
`created_at`, `updated_at`, and `expires_at`. Its REST surface is `GET/POST /api/messages`,
`POST /api/messages/:id/retry`, `POST /api/messages/:id/force`, and
`DELETE /api/messages/:id`.
