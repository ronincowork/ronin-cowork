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

The one composed first message (`src/spawn.ts`): the family_role's posture and then the
session_task's — additive, who first and then what — the opening template, the session
it was pointed at (catch-up route included), the one-off inject, the ack rule. Inlined
because inlining is the only guarantee of being read; never longer than a screen;
everything durable is a pointer to T1. Manual mode bypasses all of it — the owner's
text, byte for byte.

## T1 — always-taught

The `Read first:` list in every assisted brief — a directory listing of the boot shelf's
`all/` level taken at the instant of launch, plus the generated readings
(`docs/session-boot.md`). Exactly four files:

| File | Static / generated | What it is |
|---|---|---|
| `KOTOBA_GLOSSARY.md` | static | the vocabulary — the same words meaning the same things |
| `REQUIRED_ABILITIES.md` | static | the abilities every session uses: session macros, other sessions (dial, RIREKI read, guarded send), the `forkit`/new-session versus internal-spawn routing rule, measuring this machine |
| `SHELVES.md` | generated rosters (ruled 2026-08-20; the current file is the static seed) | the map — which shelf answers which question, and what is on each. Prose is authored; the per-shelf rosters fill at birth from the resolved shelves, store included |
| `SESSION_MACROS.md` | generated at each birth | the live `+macro:` roster from the resolved catalog, and the compile-first routing rule |

Generated files exist because a checked-in list describes stock, not this machine, the
moment the owner customizes anything. Admission test for T1: would every assisted
session — every root, every role, every task — plausibly use it? The owner extends T1 by dropping a
file in their store's `all/`; a stock-named file is replaced whole.

## T2 — scoped-taught

Identical delivery — files in the birth reading list — but only for sessions in scope.
**There is no pull and no trigger the session acts on: the trigger is the launch.**
Four facts fixed at spawn select the levels:

| Level | Selected by | Who stocks it |
|---|---|---|
| `<service>_connected/` — any level matching the pattern | the launch's MCP toggle | cowork ships none — a connected **service makes and seeds its own** (gbrain's setup makes `gbrain_connected/` and seeds six readings), so the level is signed by its service |
| `root/<project_root>/` | the root picked at launch | the owner only — stock cannot know a machine's directories |
| `role/<family_role>/` | the family_role picked at launch — fixed for the session's life | stock ships none today; the owner fills it |
| `task/<session_task>/` | the session_task the session is doing **now** | stock may ship (task names are shipped); the owner adds |

The toggle governs both halves of a connection (owner's ruling, 2026-08-17): launched
off, a session gets neither a service's tools nor a word about them. The role and task
levels are where "abilities we know THIS hat, or THIS kind of work, always uses" live —
the shelf names the ability and its guard tool; the procedure stays in the catalog,
uncopied. **The two add up rather than override**: a blank axis omits only its own level.
And they differ in one way that matters — role is fixed at birth, so `role/<family_role>/`
is read once and never re-sent, while a committed `session_task` change injects the new
`task/<session_task>/` list into the running session (`src/task-watch.ts`). The house
ships no role level at all today; `ensureShelf` creates it so it is findable, and what
goes on it is the owner's. A T2 file that would help every session
is mis-shelved and belongs up a tier.

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

A session receives the pyramid instantiated for `project_root` × `family_role` ×
`session_task` × the MCP choice. The two session axes bend it hardest: T0 differs by both
(the postures add, and dial, ack and the rest resolve through the cascade — system <
family_role < session_task < this launch), T1 never differs (that is its definition), T2
carries each axis' own always-taught material, T3–T5 are one house-wide body of
knowledge.

## The routing table

| When wondering… | Go to | Not |
|---|---|---|
| what a word means here | `KOTOBA_GLOSSARY.md` (already read) | guessing |
| what a `+name:` means | `tejun <name>` — compile, execute, report | a remembered workflow |
| whether a capability exists | the catalogs, via the map | improvising with tmux |
| how to do a compiled step | it arrived in the compile | searching |
| anything about another session | dial first; `tejun-rireki <session> since` first, with the durable record authoritative; then `tejun-send` | pane capture only when there is no tape or live prompt state is unknowable, and report the fallback; raw `send-keys` |
| how the house does a domain | the SOP shelf, by book | inventing a process |
| what is true on this machine | run the named tool | any document |
| where anything else is | `SHELVES.md` (already read) | — |
