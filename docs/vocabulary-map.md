# Vocabulary map — the five places a word lives, and what keeps them honest

There are five artefacts here with overlapping names, and it is genuinely easy to think
two of them are the same thing. They are not, and the difference is not stylistic: each
answers a question the others cannot.

This page exists because that had to be worked out by reading source, twice.

The map comes first, because you usually arrive wanting one artefact rather than a verdict.
What keeps the map true is at the bottom: two gates, `check-lexicon` and `check-kotoba`,
which between them are why a word cannot quietly mean two things here for long.

## The one-line answer

| I want to… | Go to | What it is |
|---|---|---|
| know what a house noun **means** | `KOTOBA.md` | the concept dictionary — every noun, its scope, its file-of-record |
| know what we **call** a house noun to a person | `KOTOBA_GLOSSARY.md` | the token → user word, with usage guidance. Handed to every Agent at birth |
| add or change a **string on screen** | `ronin_catalogs/lexicons/professional_en.md` | the floor lexicon: every key a surface reads |
| say the same string in another **voice** | the other lexicons in that directory | skins — `home_en`, `league_en`, `terminal_en`, `vibe_code_en` |
| know the **rule** for user-visible text | `docs/kokugo.md` | KOKUGO: every string a person reads is `t('room.key', 'literal')` |
| **read** every key with every skin's word beside it | `npm run kokugo:table` | a generated report. Not committed |

## Why the glossary and the table are not the same thing

This is the confusion worth naming, because both are tables of words and one is much
bigger than the other.

**The table** is mechanical: every key, every skin, generated from the lexicons. It is a
report *for us* — coverage at a glance. Nothing reads it at runtime.

**The glossary** is editorial, and it is a live artefact. It sits in
`ronin_session_boot/all/`, so it is handed to every session at birth, and it is rendered
through `renderGlossary()` with the active desk profile's words baked in — a `vibe_code_en`
Agent and a `professional_en` Agent read the same page with different words in it.

A glossary row has three parts:

```
| `coworkspace` | **the coworkspace**<!--g:glossary.coworkspace--> | Say *the coworkspace*
  for the lot, *a tile* for one cell, *the commons* for a tile with no session in it. |
```

1. the internal token
2. the user word, **as a substitution marker** — not a stored value
3. **usage guidance**, written by a person

Column 2 is why there is no double maintenance: the word is not kept here, it is filled in
from the lexicon. The lexicon is the single source, and the glossary and the table both
consume it.

Column 3 is why the glossary cannot be generated out of the table. *"Bare commons no longer
means this."* *"The retired tile-level shared surface."* Those are rulings about how to use
a word and what it stopped meaning. A key-to-string table has nowhere to put them, and they
are the part an Agent actually needs.

## What keeps them honest

`check-lexicon` is the gate, and its findings are worth knowing because they are the
reason this stays true without anyone policing it:

- a key the client reads via `t()` that the floor lacks — **fail**
- a lexicon carrying a bare key the floor does not have — **fail**, since every word must
  fall through to something
- the `glossary.*` room and `KOTOBA_GLOSSARY.md` disagreeing — **fail**. A marked cell whose
  word is not the floor's word, a floor glossary key no cell carries, or a row with a bold
  word and no marker. This is what makes the Agent's word the owner's word
- a module calling `t()` without importing it — **fail**
- floor keys no view reads yet — a **note**, because the surfaces that will read them are
  not built

`check-kotoba` is the other direction: KOTOBA must be true about the code, not merely
about itself. A term used in code and absent from KOTOBA is either added deliberately or
stopped being used.

## Why the table is not committed

It was, until 2026-09-01. Committing it bought a permanent merge-conflict surface — two
sessions touching one wording key collided on 1,700 lines of machine output — and the
staleness check that policed it asserted nothing about the lexicon, only that a generated
file matched its own generator. Every finding above is untouched by its removal.

If you want to read it: `npm run kokugo:table`. It is gitignored.
