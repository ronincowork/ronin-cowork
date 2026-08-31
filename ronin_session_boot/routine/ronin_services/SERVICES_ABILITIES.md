# RONIN SERVICES ABILITIES — service-backed session reading

Ronin Services is one additional Routine. It contains the durable session record, Koshi,
Voice and Hotwords; none is a separate Routine or switch in this rollout. Installation
or service-roster presence never selects it implicitly.

Ronin Services supplies these four service-backed capabilities together. Compatible
teaching remains in `all/REQUIRED_ABILITIES.md` during the transition to fully
Routine-addressed startup reading.

## The durable session record

When reading another session, begin with `tejun-rireki <session> since` for everything
since the owner's last message. `tejun-rireki <session> text` reads the recent durable
tape. The record remains authoritative when no tile is open and when Ronin is not running.

Use Base's `tejun-peek <session>` only when the durable record says there is no tape or
when the live prompt state is otherwise unknowable. If you use that fallback, say
explicitly that pane capture was needed because the durable record could not answer.

If `tejun-rireki` is absent, report that the Ronin Services behavior was not delivered.
Do not claim that a live pane capture is durable and do not improvise by reading service
stores directly.

## Assisted administration

Koshi is Ronin's assisted administrative behavior: its own agents perform the house's
internal jobs. It arrives as part of this Routine, not as a Koshi switch. Do not treat the
presence of a Koshi process or service registration as evidence that this Routine was
selected.

## Voice and Hotwords

Voice turns the owner's speech into text. Hotwords are the owner's dictation glossary —
words the microphone keeps mishearing, sent along with the voice. Hotwords have no
independent use when Voice is unavailable, so both arrive in this one Routine and neither
is a separate switch.

The microphone requires the secure Ronin address and the owner's browser permission.
Dictation failure is reported as a failure; it is never silently replaced with guessed
text. Hotwords are owner customization: an agent may explain what they do, but does not
invent or rewrite the owner's list.

## Selection is not installation

An installed Services package and its registered service roster answer whether these
capabilities are available. They never answer whether the Campaign/Team selected the
Routine. Only the effective Routine selection causes this reading and its behaviors to be
delivered at Agent birth.
