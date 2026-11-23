# SKINS — the look, as entries you can replace

> A skin is a set of **design tokens**, and nothing else. It cannot add a rule, move a
> control or restyle one surface differently from another — it can only answer the
> questions `public/style.css` already asks under `@layer base`. That is the whole
> safety story: there is no selector here to get wrong.
>
> **This is a shadowable catalog** (`docs/architecture/shadowing.md`). The entries below ship and are
> replaced wholesale by an upgrade. Your own copy lives in `~/ronin/custom/SKINS.md`, outside
> every repo — an upgrade cannot touch it and an uninstall leaves it. A `## name` of yours
> REPLACES the shipped one of that name whole; a new name is added after them;
> `- **hidden:** yes` removes one. Change nothing and you track the shipped skins forever;
> change one and that one is yours.
>
> **Format.** `- **label:**` and `- **blurb:**` are what a person reads. Every other line
> names a token from `@layer base`, in one of three spellings:
>
> | spelling | applies |
> |---|---|
> | `- **--radius-large:** 0` | **both shells** — shape, space, type and motion want this |
> | `- **dark--surface:** #05070a` | the dark shell only |
> | `- **light--surface:** #fffdf8` | the light shell only |
>
> **A token we rename keeps working here.** A skin naming an old name (`--muted-3`, `--setup-mark`,
> `--gc-cta-bg`, `--gc-cta-ink`, `--gc-cta-bg-hover`, `--kanban-*`, `--kiiro`, `--kaki-hint`, `--scope-*`,
> `--team-workbench-head-*`, `--cowork-head-*`, `--muted-2`, `--dim`, and the old rulers `--text-1`…`--text-10`,
> `--text-micro`, `--space-1`…`--space-12`, `--radius-xs/sm/md/lg/xl`, `--weight-medium`, `--leading-loose`, `--panel` → `--surface`, `--well` → `--inset`) paints
> the token that replaced it; spell the new name and it wins. A `--cowork-head-*` name paints that part of all three
> header scopes; an old ruler rung paints the roles it mostly served (`public/js/skins.js` lists them). The roles
> themselves, and which one is for what, are in `docs/architecture/ui.md`.
>
> **Light and dark are an axis INSIDE a skin, not a thing a skin fights.** A shape skin
> names the bare form and is done — a corner is the same corner in either shell. A COLOUR
> skin gives both faces, so the flip keeps working: it is still the theme's job to say which
> shell you are in, and the skin's job to say what that shell looks like. (Before
> quietly spent the flip. If you name a colour bare, that is still what happens — legal, and
> occasionally the point.)
>
> **`stock` NAMES NOTHING BECAUSE IT IS ALREADY SPELLED — in `public/style.css`.** The two
> `:root` blocks under `@layer base` ARE Stock's two faces: `:root` is its dark face,
> `:root[data-theme='light']` its light face, mapping one-for-one onto the three spellings
> above. There is one mechanism here, not two. Stock lives in CSS rather than in this file
> for two reasons, and both are load-bearing:
>
> 1. **It is the FLOOR, and a floor that has to be fetched is not one.** On a first-ever
>    visit, with cleared storage, or with the tailnet flaky, the page paints correctly today
>    with no JS having run at all. Move the shipped palette here and there is nothing to
>    fall back to — not a flash of dark, a flash of *nothing*, with every `var(--surface)`
>    resolving to empty. Same law as stock ⊕ user in `docs/architecture/shadowing.md`: the stock layer
>    exists to be there before anything else is.
> 2. **Keeping a floor AND a copy here would be the same palette spelled twice** — the exact
>    drift the token rule exists to end.
>
> Which is the honest limit of this whole feature: **a skin's colours are checked by
> nothing.** The shipped ones are hand-picked to stay clear of the floor; yours are yours.

## stock
- **label:** Stock
- **blurb:** Ronin as shipped — the dense operational look the palette was tuned for.

## paper
- **label:** Paper
- **blurb:** The household. A serif, warm paper under the light, coffee under the dark — the words read like a book, not a console.
- **--font-ui:** "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif
- **--radius-small:** 2px
- **--radius-large:** 4px
- **light--surface:** #fffcf6
- **light--inset:** #fbf7ef
- **light--line:** #e5dccb
- **light--line-2:** #ddd2bd
- **light--line-3:** #c3b499
- **light--fg-strong:** #2d2721
- **light--fg:** #4a4038
- **light--muted:** #7d7264
- **light--kaki:** #b5622f
- **light--kaki-lift:** #965127
- **light--kaki-tint:** #d6a98d
- **light--aiiro:** #5c7d6a
- **dark--surface:** #1a1611
- **dark--inset:** #100d0a
- **dark--line:** #2a241c
- **dark--line-2:** #372f24
- **dark--line-3:** #4d4334
- **dark--fg-strong:** #efe6d6
- **dark--fg:** #d6cbb8
- **dark--muted:** #8c7f6c
- **dark--kaki:** #d3804f
- **dark--kaki-lift:** #dc9972
- **dark--aiiro:** #8fb39d

## square
- **label:** Square
- **blurb:** The lobby. Near-black, bright cyan and magenta, every corner cut square — the gamer one, goofy on purpose.
- **--radius-small:** 0
- **--radius-large:** 0
- **dark--surface:** #111827
- **dark--inset:** #050810
- **dark--line:** #1a2438
- **dark--line-2:** #23324d
- **dark--line-3:** #35476b
- **dark--fg-strong:** #eaf4ff
- **dark--fg:** #c4d4e8
- **dark--muted:** #6b7f9e
- **dark--kaki:** #3ee6ff
- **dark--kaki-lift:** #65ebff
- **dark--aiiro:** #ff3ea5
- **light--surface:** #ffffff
- **light--inset:** #f7f9ff
- **light--line:** #cfdaf2
- **light--line-2:** #b7c6ea
- **light--line-3:** #8fa4d6
- **light--fg-strong:** #0b1430
- **light--fg:** #2a3757
- **light--muted:** #5e6f96
- **light--kaki:** #0891b2
- **light--kaki-lift:** #077894
- **light--kaki-tint:** #77c3d5
- **light--aiiro:** #db2777

## mono
- **label:** All mono
- **blurb:** The shell speaks in the terminal's own face, corners squared. Everything reads as one machine.
- **--font-ui:** Menlo, 'DejaVu Sans Mono', Consolas, monospace
- **--radius-large:** 0
