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
   T3   │  INDEXED       │  the catalogs — what you CAN do. Selected capabilities
        │                │  expose their actual tools.
        ├────────────────┤
   T4   │  REFERENCE     │  the library — supporting pages named by current
        │                │  capability teaching.
        ├────────────────┤
   T5   │  SOUGHT        │  the Behaviors — fetched by a situation; the situation
        │                │  selects the reader.
        └────────────────┘
   side │  MEASURED      │  facts about THIS machine — in no tier, ever.
        │                │  ronin-host inspect, ronin-host account, ronin-store --all.
```

## T0 — the brief

The one composed first message (`src/spawn.ts`): Team context when the session is born
onto one (the roster's objective, its wipeboard), the opening, the session it was pointed
at (catch-up route included), the one-off
inject, the ack rule. Inlined
because inlining is the only guarantee of being read; never longer than a screen;
everything durable is a pointer to T1. Manual mode bypasses all of it — the owner's
text, byte for byte.

## T1 — always-taught

The sources included in every assisted Agent's compiled birth README. The brief names
only that per-session README (`docs/architecture/session-boot.md`):

| File | Static / generated | What it is |
|---|---|---|
| `ronin_catalogs/lexicons/professional_en.md` | static | the vocabulary — the same words meaning the same things |
| `CAPABILITIES.md` | generated at each birth | the tool overview rendered from the capability documents this birth selected (`ronin_catalogs/capabilities/`): per bundle, the priority tools that exist on this box, `--help`, and the full document's path |

Generated content exists because a checked-in list describes stock, not this machine, the
moment the owner customizes anything. Admission test for T1: would every assisted Agent
plausibly use it? Optional abilities belong to a feature, never this tier.

## T2 — scoped-taught

Identical delivery — sections in the compiled birth README — but only for Agents in scope.
**There is no pull and no trigger the session acts on: the trigger is the launch.**
Launch facts select the levels:

| Level | Selected by | Who stocks it |
|---|---|---|
| `<service>_connected/` | a chosen feature's declaration; the legacy name does not assert runtime health | a service seeds its own signed reading |
| `root/<project_root>/` | the root picked at launch | the owner only — stock cannot know a machine's directories |
| `routine/<name>/FILE.md` | each system installation at birth (its on-page or off-page) and each chosen feature | stock and owner readings, selected explicitly by the catalog |

Selection governs teaching only; Agent launch never reconfigures an MCP server. These levels add up
rather than override: root, installations and behaviours are fixed
at birth and compiled into one README. Work-specific reading is selected separately
as `behaviours`; the behaviours that are on join that same birth reading once and are not a
mutable shelf axis. A T2 file that would help every session is mis-shelved and belongs up
a tier.

## T3 — indexed. T4 — delivered. T5 — sought.

The **catalogs** are complete and never pasted: selected capability documents teach the
tools an Agent receives. The **library** holds supporting reference pages consumed by
those tools and capabilities; a page only ever reached by browsing is an Behavior on the wrong
shelf. The **Behaviors** cost nothing until a situation arises; the map makes the shape of
the question obvious ("how does this house do X?"), and the situation selects the
reader. And facts about the machine live nowhere: they are **measured** by the tools,
every time.

## One pyramid, instantiated per session

A session receives the pyramid instantiated for its installation, Campaign, Team, launch
choices, and conditional facts. T1 never differs; T2 carries enabled installation
contributions, selected behaviours, and conditional reading; T3–T5 are one
house-wide body of knowledge.

## The routing table

| When wondering… | Go to | Not |
|---|---|---|
| what a word means here | the house-words section of the birth README | guessing |
| whether a capability exists | the catalogs, via the map | improvising with tmux |
| how to use a capability tool | its selected document, then `<tool> --help` | guessing |
| anything about another session | `work-record read --session <session>` for authored work; `edges read` when recorded output is available; `edges send` for a message | pane capture only when there is no tape or live prompt state is unknowable, and report the fallback; raw `send-keys` |
| how the house does a domain | the Behavior shelf, by book | inventing a process |
| what is true on this machine | run the named tool | any document |
| where anything else is | the shelves section of the birth README | — |
