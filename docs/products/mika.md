# Mika

Mika is the installed assistant for questions about Ronin: finding a setting, understanding
what the screen shows, or preparing a change. Ask in plain language through the Help entry
where offered, or use `mika "your question"` when the tool is available.

Mika runs as an Agent session using an available provider. Provider availability and the
installed capability determine whether it can start; a Help entry alone is not proof that
all prerequisites are ready.

## Changes are proposed first

Mika's guidance tells her to show the intended settings change and wait for your yes before
applying it. Review the change she describes. Mika uses the same settings and launch operations as Ronin;
a conversation is not a separate configuration store.

Requests use the ordinary message queue. If Mika cannot receive one immediately, check
Messages for the retained request rather than sending the same request repeatedly.

## Customize the guidance

An owner copy of `house/mika/MIKA_TIPS.md` under the resolved `session_boot` store can add
guidance for the next Mika session. Ask an Agent to follow the
[session-reading rules](../architecture/session-boot.md); do not edit the installed stock
file or expect a running session to reread it automatically.

Contributors: [Mika capability](../../ronin_catalogs/capabilities/mika.md),
`src/mika-runtime.ts`, `src/mika-knowledge.ts`, and the house launch path in `src/routes/launch.ts`.
