# Message queue

The message queue is the live flow of inbound messages waiting to enter sessions. It is
not a transcript and not a wipeboard: delivered messages disappear immediately, and a
wipeboard post never enters it. When a wipeboard post asks Ronin to interrupt a session,
that separate notice is an inbound message and may wait here.

Its visible home is **Team Commons → Agent message queue**, beside Docs, Wipeboard, and
Team Configuration. It is a channel inside the existing Team Commons surface, not a
separate Cowork card or machine-level tab.

Every sender uses the same delivery engine. Automatic checks and **Try Again** use safe
delivery: the target must exist, its dial must permit writing, and its Agent must show a
recognized empty prompt. Busy work, dialogs, drafts and unknown prompts retain the card
with the measured reason.

**Force** is the owner's bounded override. One press types the message once, then spends
at most ten seconds pressing Enter and checking whether it submitted. It may collide with
whatever the Agent is doing. It never runs forever and never types a second copy. Success
removes the card; failure leaves it for another decision.

Every action answers immediately on its button (`Trying…`, `Forcing…`, or `Dismissing…`)
and announces its outcome. A card that clears says **Delivered and cleared** before its
absence becomes the only evidence; a retained message says why it is still waiting.

The queue is working state in the `message_queue` data store. Each item records:
`id`, `target`, `text`, `source`, `state`, `reason`, `attempts`, `created_at`, and
`updated_at`. Its REST surface is `GET/POST /api/messages`,
`POST /api/messages/:id/retry`, `POST /api/messages/:id/force`, and
`DELETE /api/messages/:id`.
