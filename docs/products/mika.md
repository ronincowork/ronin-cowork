# Mika

Mika is the installed assistant for questions about Ronin: finding a setting, understanding
what the screen shows, or preparing a change. Ask in plain language through the Help entry
where offered, or use `mika "your question"` when the tool is available. The **Help** door on
Ronin Home opens her beside the guides, on her Chat reading rather than her terminal; that
needs Ronin Services' transcripts, and without them her tile opens on the terminal.

Mika runs as an Agent session on the Steerco team, kept at the foot of the roster, using an
available provider. Provider availability and the
installed capability determine whether it can start; a Help entry alone is not proof that
all prerequisites are ready.

## Changes are proposed first

Mika's guidance tells her to show the intended settings change and wait for your yes before
applying it. Review the change she describes. Mika uses the same settings and launch operations as Ronin;
a conversation is not a separate configuration store.

Requests use the ordinary message queue. If Mika cannot receive one immediately, check
Messages for the retained request rather than sending the same request repeatedly.

## Customize the guidance

Mika's brief is `ronin_stock/behaviours/mika.md`, stacked on the base brief every
Agent gets. Your copy, `~/ronin/custom/behaviours/mika.md`, replaces it
for the next Mika session. Her source index groups its sources by `src/mika-pyramid.toml`.
Ask an Agent to follow the
[the brief](../architecture/brief.md); do not edit the installed stock
file or expect a running session to reread it automatically.

Contributors: [Mika's behaviour](../../ronin_stock/behaviours/mika.md),
`src/mika-runtime.ts`, `src/mika-knowledge.ts`, and the knowledge index step in `src/routes/launch.ts`.
