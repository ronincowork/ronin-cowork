# Lexicons — the words a surface uses

A **lexicon** is keys to strings: what a surface says where it would otherwise say the
stock English. Mechanically it is a language — a wording (*Stewart* says *occasion* for a
campaign) and a translation (*Français*) are the same kind of file, and that is the point
(KOTOBA `lexicon`, ruled with R38 on 2026-08-27). A **desk profile** names one the way it
names a skin (`docs/desk-profiles.md`).

## The catalog

`ronin_catalogs/lexicons/<name>.md`, one file per lexicon, shadowable whole-file by name
(`docs/shadowing.md`): yours in the catalogs store replaces ours of the same name; a new
name is a new lexicon; `- **hidden:** yes` withdraws one of ours. The directory's
`README.md` carries the format. Four ship: `professional` (the floor), `stewart` (a dozen
words, to prove the chain), `league` and `terminal` (near-empty, on purpose — the words
grow as the surfaces settle, one file at a time, with no code).

Two kinds of key in one table: a bare word is a surface string (`campaign`, `go`); a
prefixed key names a catalog entry's label by its token (`kind.household`,
`role.DraftPlan`, `team_role.<t>`, `behaviour.<t>`). A key may carry dots — the catalog
grammar widened for it (`src/catalog.ts`, `isKeyLine`).

## The chain, one rule

```
active lexicon  →  its base:  →  the definition's own label: / the literal in the view
```

`src/lexicons.ts` resolves a lexicon **flat** on the server (`GET /api/lexicons/:name`):
the file's words over its base's, to the floor, with a cycle guard. The client
(`public/js/lexicon.js`) holds one flat object and answers `t(key, literal)` — the word,
or the literal the view wrote. So a missing key can never blank a label, and a missing
lexicon paints exactly as stock. Wording and translation are one axis: a French Stewart
is one more lexicon, `stewart_fr`, with `- **base:** fr` — never a second setting.

## The floor, and the check

`professional` is complete by definition. `scripts/check-lexicon.mjs` (in the verify
chain) **fails** when a key the client reads through `t()` is missing from it, or when
another shipped lexicon spells a bare key the floor lacks (nothing to fall through to);
it **reports** floor keys no view reads yet. A view adds its keys to `professional` in
the same commit.

## No sweep

Views born from 2026-08-27 read their strings through `t()`; a view older than that keeps
its literals until it is touched for another reason. The check does not fail on those.

## What is never translated

Anything an **agent** reads — the letter, the brief, the boot shelf, `write_tegami` —
stays in stock tokens: a session on a Stewart desk is still `DraftPlan` with
`reach: plan`. The house's internal names (KOTOBA's list) are not keys. And a lexicon
changes words, never structure: a surface that must be *shaped* differently per profile
is a Workspace Kit question.
