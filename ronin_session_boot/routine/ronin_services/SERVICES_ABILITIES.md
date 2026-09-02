# RONIN SERVICES ABILITIES — the durable record, Koshi, Voice

**Reading another session** starts with the durable record, not the pane:
`tejun-rireki <session> since` gives everything since the owner's last message;
`tejun-rireki <session> text` the recent tape. It answers with no tile open and with Ronin
stopped. Fall back to `tejun-peek` only when the record says there is no tape, and say that
you did. If `tejun-rireki` is absent, report that Services was not delivered; never call a
pane capture durable, and never read service stores directly.

**Koshi** is Ronin's assisted administrative behavior: Ronin's own agents doing the house's
internal jobs. You do not run it; the owner meets it as the Koshi tab.

**Voice** turns the owner's speech into text; **Hotwords** are the owner's dictation
glossary, the words the microphone keeps mishearing. A failed dictation is reported as a
failure, never replaced with guessed text. You may explain Hotwords; you do not edit the
owner's list.
