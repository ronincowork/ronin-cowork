# lexicons — the words a surface uses, one file per lexicon

> **DATA.** Nothing here executes. A **lexicon** is keys to strings: what a surface says
> where it would otherwise say the stock English. Mechanically it is a language — a
> wording (*Home* says *occasion* for a campaign) and a translation (*Français*) are
>
> A **desk_profile** names one (`- **lexicon:** home_en`) the way it names a skin. A
> lexicon never rides a launch, a letter or a brief: **anything an agent reads stays in
> stock tokens**, and the house's internal names are not keys.

**One file per lexicon, named by its token.** `- **key:** value` lines; everything else is
prose. Two kinds of key in one table:

| Key | What it names | Example |
|---|---|---|
| a bare word | a surface string | `- **campaign:** Occasion` |
| `kind.<token>` · `role.<token>` · `behaviour.<token>` | a catalog entry's label, by its token | `- **role.DraftPlan:** Secretary` |

Three fields are not words: `label` (what a person picks), `blurb`, and **`base`** — the
lexicon a missing key falls through to.

**The chain, one rule:** the active lexicon → its `base:` → the definition's own `label:`
or the stock literal in the view. A missing key can never blank a surface; a missing
lexicon paints exactly as stock. So a lexicon says **only what it changes** — Home is a
dozen lines, not six hundred.

**`professional_en` is the floor**, and it is complete by definition: every key a view reads
through `t()` is in it, and `scripts/check-lexicon.mjs` fails the build when one is not.
The other shipped lexicons (`vibe_code_en`, `home_en`, `terminal_en`, `league_en`) may be short or empty.

**The language is in the name.** Every lexicon ends in its language — `home_en`,
`professional_en` — so a French Home is `home_fr` with `- **base:** professional_fr`, and
`professional_fr` carries `- **base:** professional_en` so anything untranslated still
reads in English. Wording and translation are one axis — there is no second setting.

**Yours and ours.** A file of the same name in your catalogs store replaces ours **whole**;
a new name adds a lexicon; `- **hidden:** yes` withdraws one of ours (`docs/shadowing.md`).

**A lexicon changes words, never structure.** A surface that must be *shaped* differently
per profile is a Workspace Kit question, not a lexicon entry.
