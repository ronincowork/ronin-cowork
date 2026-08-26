# lexicons — the words a surface uses, one file per lexicon

> **DATA.** Nothing here executes. A **lexicon** is keys to strings: what a surface says
> where it would otherwise say the stock English. Mechanically it is a language — a
> wording (*Home* says *occasion* for a campaign) and a translation (*Français*) are
> the same kind of file, and that is deliberate (KOTOBA `lexicon`, 2026-08-27).
>
> A **desk_profile** names one (`- **lexicon:** home`) the way it names a skin. A
> lexicon never rides a launch, a letter or a brief: **anything an agent reads stays in
> stock tokens**, and the house's internal names are not keys.

**One file per lexicon, named by its token.** `- **key:** value` lines; everything else is
prose. Two kinds of key in one table:

| Key | What it names | Example |
|---|---|---|
| a bare word | a surface string | `- **campaign:** Occasion` |
| `kind.<token>` · `role.<token>` · `team_role.<token>` · `behaviour.<token>` | a catalog entry's label, by its token | `- **role.DraftPlan:** Secretary` |

Three fields are not words: `label` (what a person picks), `blurb`, and **`base`** — the
lexicon a missing key falls through to.

**The chain, one rule:** the active lexicon → its `base:` → the definition's own `label:`
or the stock literal in the view. A missing key can never blank a surface; a missing
lexicon paints exactly as stock. So a lexicon says **only what it changes** — Home is a
dozen lines, not six hundred.

**`professional` is the floor**, and it is complete by definition: every key a view reads
through `t()` is in it, and `scripts/check-lexicon.mjs` fails the build when one is not.
The other shipped lexicons (`vibe_code`, `home`, `terminal`) may be short or empty.

**A language is one file.** French is a lexicon named `fr`; a French Home is one named
`home_fr` with `- **base:** fr`. Wording and translation are one axis — there is no
second setting.

**Yours and ours.** A file of the same name in your catalogs store replaces ours **whole**;
a new name adds a lexicon; `- **hidden:** yes` withdraws one of ours (`docs/shadowing.md`).

**A lexicon changes words, never structure.** A surface that must be *shaped* differently
per profile is a Workspace Kit question, not a lexicon entry.
