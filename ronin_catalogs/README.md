# Adding macros & actions (TEJUN)

**test_protocols:** ordinary dev work does not run BYOIN; the integrator runs it once at the `dev → master` boundary — `docs/test-protocols.md` is the contract.

Entry point for the whole system: `../reading-list/TEJUN.md`. This file: the choreography for
extending the two catalogs that live here.

> **Everything in this directory is SYSTEM SCOPE — an upgrade replaces it wholesale**
> (`../DAIKUSAN.md`). Nothing here may list the_owner's own things.
>
> That is why `PROJECT_ROOTS.md` here holds **only the stock provider·model launch
> table**. The directories a box actually works in are user scope and live outside every
> repo, in the catalogs store — `bin/ronin-store catalogs` prints where, and it is resolved
> per machine, never spelled by hand (`docs/stores.md`). Created by Ronin on first use, and
> untouched by any upgrade. Never add a `## <handle>` root block to the shipped file.

## Adding an ACTION (do this first — actions are the vocabulary)

1. Check ACTIONS.md — does an existing action (or composition) already cover it?
2. Tag it `action_kind: mechanical` (run it, no deliberation — usually has a tool) or
   `action_kind: judgement` (needs reasoning; no tool can do it). The step tracker shows the tag
   so an agent knows whether to think or just pull the lever.
3. Add a section to ACTIONS.md: name, one-line purpose, exact steps/commands, the
   failure modes you learned (this is where hard-won rules live — ghost-text, dial
   checks, separate-Enter).
4. Actions never reference macros. Compound actions may reference other actions.
5. If the action gets performed often, give it a tool (`../ronin_bin/README.md`) and add a
   `> Tool:` pointer at the top of its section.
6. Record the first real run in `../co-working/user_repo/wip/RECIPES.md` — evidence, not hypothesis.

## Adding a MACRO (only after its actions exist)

1. A macro is an ordered table of CATALOGED actions — action 1, action 2, action 3.
   **No side jobs, no inline cleverness, no step that isn't in ACTIONS.md.** If a
   step doesn't exist as an action, STOP and add the action first (above).
2. Add a section to MACROS.md: name (short, sayable — the_owner will type
   `<name>: <args>`), one-line description (the panel shows it), params, the action
   table, and what to report when done — results must be SHOWN, not just performed.
3. Litmus: if your "macro" is one action the_owner would never say aloud, it's an
   action, not a macro.
4. The TEJUN panel and /api/macros parse MACROS.md live — adding the section IS
   shipping the macro. Test the pasteable form once for real before calling it done.

## Adding a DESK PROFILE or a LEXICON (data, one file each)

`desk_profiles/<name>.md` is the owner's standing defaults for the surfaces they work at
(R38): templates copied into Campaign-owned settings: `skin` (a `SKINS.md` entry),
`theme`, `lexicon` (a `lexicons/` entry), `campaign_kind`,
`rireki_view`, `team_arrangement`. `lexicons/<name>.md` is the words a surface uses —
keys to strings with a `base:` to fall through to. Both shadow whole-file by name
(`docs/shadowing.md`); each directory's README carries the format. The rule for words:
`professional_en` is the floor and complete, a lexicon says only what it changes, and
`scripts/check-lexicon.mjs` keeps the floor honest. `docs/desk-profiles.md`, `docs/lexicons.md`.
