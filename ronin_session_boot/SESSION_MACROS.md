# SESSION_MACROS — when the owner invokes a Ronin workflow

A **session macro** is an owner-invoked Ronin workflow addressed to the session receiving
it. Its unmistakable form is:

```text
+<name>: <arguments>
```

## The routing rule

When the owner invokes a macro, compile its current instructions first:

```bash
tejun <name>
```

Read the compiled recipe, execute every action in order, and report the outcome it asks
for. The catalog is live; do not substitute a remembered workflow.

Also recognize the accepted forms documented by TEJUN: bare `<name>: <arguments>`,
`/<name>`, and “run the `<name>` macro”. If a name is uncertain, `tejun` with no arguments
lists the macros that exist.

## Macro versus native agent capability

Explicit macro syntax wins over a similarly named native capability. A Ronin macro must be
run through TEJUN. The plain words **fork it** and **new session** also select Ronin's
`forkit` workflow absolutely: they mean a visible tmux session, never an internal
sub-agent. Conversely, **spawn it** and **spawn an agent** select the agent CLI's native
sub-agent machinery. An ordinary request to delegate that uses neither vocabulary may
use whichever is best without asking the owner to route it. Do not translate a macro or
one of these explicit phrases into something that merely sounds equivalent.

## Session macros on the tile

This section is generated at session birth from the resolved `MACROS.md` catalog. It is the
same `preview: yes` set shown by the macro button on every tile.

<!-- ACTIVE_SESSION_MACROS:START -->
<!-- generated from the active catalog; do not maintain this list by hand -->
<!-- ACTIVE_SESSION_MACROS:END -->

These summaries are recognition aids, not recipes. Always compile the invoked macro before
acting. `ronin_catalogs/MACROS.md`, plus the owner's catalog shadow, is the source of truth.
