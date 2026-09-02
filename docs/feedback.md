# Feedback

Feedback is an ordinary work surface. The Feedback button in the coworkspace header puts it
in the selected workspace, replacing that workspace's current content. It is not a dialog or
an overlay.

The form has one free-text message and optional choices describing the person, what they use
Ronin for, and the kind of feedback. A reply email address is optional. Pressing **Send** approves
that one packet and sends it to Ronin HQ. A successful send briefly says thank you, then puts
the first ordinary selector surface in the workspace.

The packet contains only the fields shown on the form. It never contains an install id,
entitlement id, session transcript, prompt, file, path, Agent name, Team name, or project
name. In particular, a reply email address is never stored with the identity of the Ronin install.

Ronin keeps the exact packet locally whether the send succeeds or fails. A failure leaves the
form in place with everything the person entered and sends nothing again automatically; the
same **Send** retries the same packet id. Every network attempt appears in the egress record.
