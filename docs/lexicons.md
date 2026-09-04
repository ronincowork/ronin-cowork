# Lexicons — the words a surface uses

A **lexicon** is keys to strings: what a surface says where it would otherwise say the
stock English. Mechanically it is a language — a wording (*Home* says *occasion* for a
campaign) and a translation (*Français*) are the same kind of file, and that is the point
names a skin (`docs/desk-profiles.md`).

`Cowork` is the owner-facing lexicon word for the canonical `team` / `team_roster`
layer. It introduces no `cowork` record: APIs, durable files and agent-facing machinery
continue to say Team. `Team Commons` is the deliberate exception and is always explicit.

## The catalog

`ronin_catalogs/lexicons/<name>.md`, one file per lexicon, shadowable whole-file by name
(`docs/shadowing.md`): yours in the catalogs store replaces ours of the same name; a new
name is a new lexicon; `- **hidden:** yes` withdraws one of ours. The directory's
`README.md` carries the format. Five ship: `professional_en` (the floor), `home_en` (a dozen
words, to prove the chain), `league_en` (the gamer's words, goofy on purpose), `vibe_code_en`
and `terminal_en` (near-empty on purpose — the words grow as the surfaces settle, one file
at a time, with no code).

prefixed key names a catalog entry's label by its token (`kind.household`,
`role.DraftPlan`, `behaviour.<t>`); a `glossary.*` key is a word an agent
says to a person for a house term; the boot shelf renders `KOTOBA_GLOSSARY.md` from those
keys at session birth — the lexicon itself is never birth reading. A key may carry
dots; `isKeyLine` in `src/resources.ts` accepts them.

## The chain, one rule

```
active lexicon  →  its base:  →  the definition's own label: / the literal in the view
```

`src/lexicon-catalog.ts` resolves a lexicon **flat** on the server (`GET /api/lexicons/:name`):
the file's words over its base's, to the floor, with a cycle guard. The client
(`public/js/lexicon.js`) holds one flat object and answers `t(key, literal)` — the word,
or the literal the view wrote. So a missing key can never blank a label, and a missing
lexicon paints exactly as stock. Wording and translation are one axis, and the language is in the name: a French Home
is one more lexicon, `home_fr`, with `- **base:** professional_fr` (itself based on
`professional_en`) — never a second setting.

## The floor, and the check

`professional_en` is complete by definition. `scripts/check-lexicon.mjs` (in the verify
chain) **fails** when a key the client reads through `t()` is missing from it, or when
another shipped lexicon spells a bare key the floor lacks (nothing to fall through to);
it **reports** floor keys no view reads yet. A view adds its keys to `professional_en` in
the same commit.


The KOKUGO sweep put every user-facing string in `public/js` and `public/index.html`
through `t('room.key', 'literal')`, one module per commit, no behaviour change: with no
lexicon up a surface paints byte-identical, and a lexicon can reword any of it. How a new
view does the same — keys, placeholders, what is never translated, the `index.html` pass,
the gate — is `docs/kokugo.md`, the instruction every view-builder reads. Every key with
every lexicon's word beside it is what `npm run kokugo:table` prints — a report, generated
on demand and never committed, which is why no path here names it. The lexicons are the
source; the report is a way of reading them.

## What is never translated

Anything an **agent** reads — the letter, the brief, the boot shelf, `write_tegami` —
stays in stock tokens: a session on a Home desk is still `DraftPlan` with
`reach: plan`. The house's internal names (KOTOBA's list) are not keys. And a lexicon
changes words, never structure: a surface that must be *shaped* differently per profile
is a Workspace Kit question.
