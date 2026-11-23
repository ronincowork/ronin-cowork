# skins — changing how Ronin looks

> **Voice: relay.** Written for the agent to walk a person through, not to follow itself.

## Two controls

They are independent:

| control | what it decides | where it is kept |
|---|---|---|
| the **light/dark** toggle (◐/☀ in the Home and Setup headers) | which shell you are in | per device. The default follows the machine's own setting, live — flip your Mac and Ronin flips. Pressing it pins; pressing back to match resumes following |
| the **Desk profile** field on Ronin Settings' Desk surface | the skin the profile wears: corners, spacing, type, fonts, motion — and colour if a skin says so | the Campaign |

Nothing else has to be set for either. If nobody ever touches them, the shell follows
the machine and the skin is Stock, which is the shipped look.

## Writing your own skin

**Your file is `~/ronin/custom/SKINS.md`** (`ronin-store custom` → `SKINS.md`).
It does not exist until you make it. **An update never touches it.** The shipped file is
`ronin_stock/SKINS.md` — read it for examples, do not edit it: a `git pull` replaces it.

```markdown
## mine
- **label:** Mine
- **blurb:** One line saying what it does — this is what the picker shows.
- **--radius-large:** 0
```

Three spellings, and the prefix is which shell:

| spelling | applies |
|---|---|
| `- **--radius-large:** 0` | **both shells** — shape, space, type and motion want this |
| `- **dark--surface:** …` | the dark shell only |
| `- **light--surface:** …` | the light shell only |

The token names are listed in `docs/architecture/ui.md` with what each one governs.

It appears the next time you open the Appearance room. No restart.

## The three rules worth knowing

**A `## name` of yours REPLACES the shipped one of that name, whole.** Same as any catalog
(`docs/architecture/shadowing.md`). The picker marks it *yours (replaces ours)*, because only a shipped
entry you replaced can silently stop tracking an upgrade. A new name is added after the
shipped ones and marks *yours*. `- **hidden:** yes` removes one.

**A skin can only set tokens.** No selectors, no rules — it answers questions the
stylesheet already asks. The worst a bad skin does is look bad, and a token spelled wrong
does nothing at all.

**Nothing checks a skin's colours.** The contrast gate measures the shipped palette, which
is in the stylesheet, and has never heard of this file. Shape and spacing are safe to play
with; if you move colour, check you can still read it — in **both** shells.

## The one that catches people

**The agent's own output is not Ronin's to colour** unless the agent asks for a slot rather
than naming a colour. Claude Code does that under its `-ansi` themes, which is why flipping
Ronin recolours agent output live. Its theme lives in `~/.claude/settings.json` and Ronin
never writes it. On this palette, pin **`dark-ansi`** — it clears 16:1 in both shells, where
`light-ansi` drops to 1.17:1 on the dark shell and the body text disappears. `docs/architecture/ui.md`
carries the measured table.

## Writing your own words — a lexicon, and the desk profile that wears it

The skin decides how Ronin *looks*; a **lexicon** decides what it *says* (`docs/architecture/lexicons.md`,
`docs/products/kokugo.md`). Both hang off a **desk profile** (`ronin_stock/desk_profiles/`), which is
what a person actually picks in the Desk profile field on Ronin Settings' Desk surface. The one rule
of `~/ronin/custom/`: a file of ours of the same name is replaced whole; a new name is new.

1. **The words.** `~/ronin/custom/lexicons/<name>_<lang>.md` (the language is in the
   name). Format: `ronin_stock/lexicons/lexicons_readme.md`. Say only what changes — everything
   else falls through to `professional_en`, the floor. Every key that can be changed, with
   every shipped lexicon's word beside it, is `npm run kokugo:table` (a report generated on
   demand and never committed).

   ```markdown
   # mine_en
   - **label:** Mine
   - **blurb:** My words.
   - **base:** professional_en
   - **roster.no_team:** freelancers
   ```

2. **The profile.** `~/ronin/custom/desk_profiles/<name>.md` naming it
   (`- **lexicon:** mine_en`, plus the skin and the rest; format in
   `ronin_stock/desk_profiles/desk_profiles_readme.md`) — or copy one of ours (`home.md`) and change its `lexicon:` line.
3. **Pick it** in ⚙ → Appearance → desk profile, and reload. Surfaces take the words on
   their next paint.
4. **Check it**: a key the floor lacks changes nothing, silently, so compare your file
   with the floor: `npm run kokugo:table` writes every key across the lexicons side by side
   to `docs/kokugo-table.md`. The Customize view lists both shelves (Presentation → Desk
   profiles · Lexicons).

**An update never touches your files.** Never edit `ronin_stock/` — a `git pull` replaces it.

