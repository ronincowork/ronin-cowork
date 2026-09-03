# ABILITY PYRAMID — how a session is taught, and when it looks things up

One law organizes every piece of session-facing knowledge in Ronin: **it has a tier, the
tier decides how it is delivered, and each tier teaches the existence of the tier below
it — never its contents.** A session is taught the top unconditionally and is only ever
pointed downward. This is what makes sessions behave predictably — every one taught the
same way, from the same tiers — and it is the customization map: every tier is
store-shadowed file-for-file, so changing how the house does a thing is one move — drop
a file at the tier that teaches it.

```
        ┌────────────────┐
   T0   │  THE BRIEF     │  inlined — posture, ack, reference. Cannot be skipped.
        ├────────────────┤
   T1   │  ALWAYS-TAUGHT │  exactly four files — two static, two generated at birth.
        ├────────────────┤
   T2   │  SCOPED-TAUGHT │  same delivery, narrower audience — selected by the
        │                │  launch's own facts, never by the session.
        ├────────────────┤
   T3   │  INDEXED       │  the catalogs — what you CAN do. Pulled by name;
        │                │  tejun compiles live.
        ├────────────────┤
   T4   │  DELIVERED     │  the library — arrives inside a compile, mid-task,
        │  MID-TASK      │  unasked.
        ├────────────────┤
   T5   │  SOUGHT        │  the SOPs — fetched by a situation; the situation
        │                │  selects the reader.
        └────────────────┘
   side │  MEASURED      │  facts about THIS machine — in no tier, ever.
        │                │  tejun-survey, tejun-account, ronin-store --all.
```

## T0 — the brief

The one composed first message (`src/spawn.ts`): the session_role's posture, the team
context when the session is born onto one (the roster's objective, its wipeboard), the
opening template, the session it was pointed at (catch-up route included), the one-off
inject, the ack rule. Inlined
because inlining is the only guarantee of being read; never longer than a screen;
everything durable is a pointer to T1. Manual mode bypasses all of it — the owner's
text, byte for byte.

## T1 — always-taught

The sources included in every assisted Agent's compiled birth README. The brief names
only that per-session README (`docs/session-boot.md`):

| File | Static / generated | What it is |
|---|---|---|
| `KOTOBA_GLOSSARY.md` | static | the vocabulary — the same words meaning the same things |
| `SESSION_MACROS.md` | generated at each birth | the live `+macro:` roster from the resolved catalog, and the compile-first routing rule |

Generated content exists because a checked-in list describes stock, not this machine, the
moment the owner customizes anything. Admission test for T1: would every assisted Agent
plausibly use it? Optional abilities belong to their Routine, never this tier.

## T2 — scoped-taught

Identical delivery — sections in the compiled birth README — but only for Agents in scope.
**There is no pull and no trigger the session acts on: the trigger is the launch.**
Launch facts select the levels:

| Level | Selected by | Who stocks it |
|---|---|---|
| `<service>_connected/` | an enabled Routine declaration plus the live connection choice | a connected service seeds its own signed reading |
| `root/<project_root>/` | the root picked at launch | the owner only — stock cannot know a machine's directories |
| `routine/<routine>/FILE.md` | each effective Routine manifest at birth | stock and owner Routine readings, selected explicitly by the catalog |

The toggle governs both halves of a connection: launched
off, a session gets neither a service's tools nor a word about them. These levels add up
rather than override: root, connection and effective Routines are fixed
at birth and compiled into one README. Work-specific reading is selected separately
as `behaviours`; those `ways:<book>` files join that same birth reading once and are not a
mutable shelf axis. A T2 file that would help every session is mis-shelved and belongs up
a tier.

## T3 — indexed. T4 — delivered. T5 — sought.

The **catalogs** are complete and never pasted: a session reaches them because the map
named the shelf, or a `+macro:` landed and the routing rule says compile
(`tejun <name>`). The **library** needs no discovery at all — an action cites the page
and the compile inlines it; a page only ever reached by browsing is an SOP on the wrong
shelf. The **SOPs** cost nothing until a situation arises; the map makes the shape of
the question obvious ("how does this house do X?"), and the situation selects the
reader. And facts about the machine live nowhere: they are **measured** by the tools,
every time.

## One pyramid, instantiated per session

A session receives the pyramid instantiated for `project_root` × `session_role` × its
birth team × the MCP choice. The session_role bends it hardest: T0 differs by it (its
posture, and dial, ack and the rest resolve through the cascade — system < team_roster <
session_role < this launch), T1 never differs (that is its definition), T2 carries the
role's own always-taught material, T3–T5 are one house-wide body of
knowledge.

## The routing table

| When wondering… | Go to | Not |
|---|---|---|
| what a word means here | the house-words section of the birth README | guessing |
| what a `+name:` means | `tejun <name>` — compile, execute, report | a remembered workflow |
| whether a capability exists | the catalogs, via the map | improvising with tmux |
| how to do a compiled step | it arrived in the compile | searching |
| anything about another session | dial first; `tejun-rireki <session> since` first, with the durable record authoritative; then `tejun-send` | pane capture only when there is no tape or live prompt state is unknowable, and report the fallback; raw `send-keys` |
| how the house does a domain | the SOP shelf, by book | inventing a process |
| what is true on this machine | run the named tool | any document |
| where anything else is | the shelves section of the birth README | — |
