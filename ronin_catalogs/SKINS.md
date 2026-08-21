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

## ronin_modern
- **label:** Ronin Modern
- **blurb:** The shared Ronin Cowork look from the public landing page and cowork setup — blue-black, persimmon, compact and crisp.
- **--radius-hair:** 1px
- **--radius-xs:** 4px
- **--radius-sm:** 6px
- **--radius-md:** 8px
- **--radius-lg:** 10px
- **--radius-xl:** 12px
- **--space-1:** 2px
- **--space-2:** 4px
- **--space-3:** 6px
- **--space-4:** 8px
- **--space-5:** 10px
- **--space-6:** 12px
- **--space-7:** 14px
- **--space-8:** 16px
- **--space-9:** 20px
- **--space-10:** 24px
- **--space-11:** 28px
- **--space-12:** 34px
- **--text-1:** 9px
- **--text-2:** 11px
- **--text-3:** 12px
- **--text-4:** 13px
- **--text-5:** 14px
- **--text-6:** 15px
- **--text-7:** 16px
- **--text-8:** 18px
- **--text-9:** 20px
- **--text-10:** 26px
- **--text-micro:** 10px
- **--font-ui:** -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif
- **--font-mono:** ui-monospace, SFMono-Regular, Menlo, monospace
- **--font-term:** Menlo, 'DejaVu Sans Mono', Consolas, monospace
- **--edge:** 1px
- **--edge-2:** 2px
- **--motion-quick:** 120ms
- **--motion-settle:** 220ms
- **--ease-out:** cubic-bezier(.2,.8,.2,1)
- **dark--bg:** #0b0e14
- **dark--bg-2:** #0f131c
- **dark--panel:** #131826
- **dark--raise:** #1a2233
- **dark--raise-2:** #263047
- **dark--well:** #0d1220
- **dark--line:** #1f2738
- **dark--line-2:** #2a3247
- **dark--line-3:** #3a4560
- **dark--fg-strong:** #d7e3f7
- **dark--fg:** #c5c8c6
- **dark--muted:** #6b7488
- **dark--muted-2:** #8fa3c8
- **dark--muted-3:** #6f80a0
- **dark--dim:** #454d61
- **dark--accent:** #e0af68
- **dark--accent-2:** #81a2be
- **dark--ok:** #b5bd68
- **dark--warn:** #f0c674
- **dark--bad:** #cc6666
- **dark--action:** #2f6fd0
- **dark--kaki:** #c46243
- **dark--aiiro:** #274a78
- **dark--on-accent:** #000
- **dark--term-bg:** #0b0e14
- **dark--term-fg:** #c5c8c6
- **light--bg:** #f4f2ec
- **light--bg-2:** #eae7df
- **light--panel:** #ffffff
- **light--raise:** #f1efe8
- **light--raise-2:** #e6e2d8
- **light--well:** #f7f5ef
- **light--line:** #d9d4c8
- **light--line-2:** #c8c2b2
- **light--line-3:** #a9a191
- **light--fg-strong:** #14161c
- **light--fg:** #2c2e36
- **light--muted:** #6d7284
- **light--muted-2:** #5a617a
- **light--muted-3:** #6d7284
- **light--dim:** #b0aca0
- **light--accent:** #a06b1a
- **light--accent-2:** #3f6a95
- **light--ok:** #5c7a1d
- **light--warn:** #9a7b00
- **light--bad:** #b04343
- **light--action:** #1f5fc9
- **light--kaki:** #c46243
- **light--aiiro:** #274a78
- **light--on-accent:** #fff
- **light--term-bg:** #faf8f2
- **light--term-fg:** #2e302c

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
