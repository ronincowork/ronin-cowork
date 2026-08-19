# SKINS — the look, as entries you can replace

> A skin is a set of **design tokens**, and nothing else. It cannot add a rule, move a
> control or restyle one surface differently from another — it can only answer the
> questions `public/style.css` already asks under `@layer foundations`. That is the whole
> safety story: there is no selector here to get wrong.
>
> **This is a shadowable catalog** (`docs/shadowing.md`). The entries below ship and are
> replaced wholesale by an upgrade. Your own copy lives in the catalogs store, outside
> every repo — an upgrade cannot touch it and an uninstall leaves it. A `## name` of yours
> REPLACES the shipped one of that name whole; a new name is added after them;
> `- **hidden:** yes` removes one. Change nothing and you track the shipped skins forever;
> change one and that one is yours.
>
> **Format.** `- **label:**` and `- **blurb:**` are what a person reads. Every other line
> names a token from `@layer foundations`, in one of three spellings:
>
> | spelling | applies |
> |---|---|
> | `- **--radius-md:** 0` | **both shells** — shape, space, type and motion want this |
> | `- **dark--bg:** #05070a` | the dark shell only |
> | `- **light--bg:** #fffdf8` | the light shell only |
>
> **Light and dark are an axis INSIDE a skin, not a thing a skin fights.** A shape skin
> names the bare form and is done — a corner is the same corner in either shell. A COLOUR
> skin gives both faces, so the flip keeps working: it is still the theme's job to say which
> shell you are in, and the skin's job to say what that shell looks like. (Before
> 2026-08-19 there was only the bare form, so a colour skin overrode light mode too and
> quietly spent the flip. If you name a colour bare, that is still what happens — legal, and
> occasionally the point.)
>
> **`stock` NAMES NOTHING BECAUSE IT IS ALREADY SPELLED — in `public/style.css`.** The two
> `:root` blocks under `@layer foundations` ARE Stock's two faces: `:root` is its dark face,
> `:root[data-theme='light']` its light face, mapping one-for-one onto the three spellings
> above. There is one mechanism here, not two. Stock lives in CSS rather than in this file
> for two reasons, and both are load-bearing:
>
> 1. **It is the FLOOR, and a floor that has to be fetched is not one.** On a first-ever
>    visit, with cleared storage, or with the tailnet flaky, the page paints correctly today
>    with no JS having run at all. Move the shipped palette here and there is nothing to
>    fall back to — not a flash of dark, a flash of *nothing*, with every `var(--bg)`
>    resolving to empty. Same law as stock ⊕ user in `docs/shadowing.md`: the stock layer
>    exists to be there before anything else is.
> 2. **Keeping a floor AND a copy here would be the same palette spelled twice** — the exact
>    drift the token rule exists to end — and `scripts/check-css.mjs` would measure the
>    wrong one. Its contrast floor reads token values out of the STYLESHEET, by selector,
>    from `@layer foundations` only; it has never heard of this file. So the CSS copy would
>    stay green while the copy that actually renders went unmeasured.
>
> Which is the honest limit of this whole feature: **a skin's colours are checked by
> nothing.** The shipped ones are hand-picked to stay clear of the floor; yours are yours.
> (Ruled with @terminal_black, 2026-08-19, who owns the theme.)

## stock
- **label:** Stock
- **blurb:** Ronin as shipped — the dense operational look the palette was tuned for.

## square
- **label:** Square
- **blurb:** Every corner squared. The pro-tool look, no rounding anywhere.
- **--radius-hair:** 0
- **--radius-xs:** 0
- **--radius-sm:** 0
- **--radius-md:** 0
- **--radius-lg:** 0
- **--radius-xl:** 0

## soft
- **label:** Soft
- **blurb:** Rounder than stock, everywhere. Reads friendlier; costs nothing else.
- **--radius-xs:** 6px
- **--radius-sm:** 10px
- **--radius-md:** 14px
- **--radius-lg:** 18px
- **--radius-xl:** 22px

## tight
- **label:** Tight
- **blurb:** The space ladder pulled in a step. More on screen, less air around it.
- **--space-1:** 1px
- **--space-2:** 3px
- **--space-3:** 4px
- **--space-4:** 6px
- **--space-5:** 8px
- **--space-6:** 10px
- **--space-7:** 12px
- **--space-8:** 14px

## roomy
- **label:** Roomy
- **blurb:** The space ladder let out a step, and type up one. Easier on a big screen.
- **--space-3:** 8px
- **--space-4:** 10px
- **--space-5:** 12px
- **--space-6:** 16px
- **--space-7:** 18px
- **--space-8:** 20px
- **--text-2:** 12px
- **--text-3:** 13px
- **--text-4:** 14px

## paper
- **label:** Paper
- **blurb:** A warmer ground in both shells — cream under the light, coffee under the dark.
- **dark--bg:** #0d0b09
- **dark--bg-2:** #14110d
- **dark--panel:** #1a1611
- **dark--well:** #100d0a
- **light--bg:** #f6f1e6
- **light--bg-2:** #ece5d6
- **light--panel:** #fffdf8
- **light--well:** #faf6ec

## mono
- **label:** All mono
- **blurb:** The shell speaks in the terminal's own face. Everything reads as one machine.
- **--font-ui:** Menlo, 'DejaVu Sans Mono', Consolas, monospace

---

Notes, not entries.

**Why there is no `hidden: yes` on `stock`.** It is the no-op skin — the one that names no
tokens — and removing it would leave no way back to the shipped look from the picker.
Shadow it if you want a different default; do not delete it.

**Why `paper` names surfaces and not text.** A skin can say anything, and the contrast
floor in `scripts/check-css.mjs` only measures the SHIPPED tokens — it cannot follow a skin
that has not been written yet. So the shipped colour skin moves grounds and leaves the ink
alone, which is the change that cannot make anything unreadable. A skin of your own can do
as it likes; just know that nothing is checking it for you.

**Adding one.** Copy a block, rename the heading, and name any token from `@layer
foundations`: `--radius-*`, `--space-*`, `--text-*`, `--font-ui/mono/term`, `--edge*`,
`--motion-*`, and the colour roles. `docs/ui.md` lists them all with what each
governs. A token you spell wrong is simply ignored — a skin cannot break the app, only fail
to change it.
