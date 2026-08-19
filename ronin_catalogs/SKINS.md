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
> is `- **--token:** value`, naming a token from `@layer foundations`.
>
> **A token you name is chosen for BOTH shells.** Light and dark are themes; a skin is a
> skin. Name `--radius-md` and the app is that shape in either shell — which is what you
> want, and is why the skins below stay off colour. Name `--bg` and you have decided the
> background for light mode too, which is legal and occasionally the point, but it is the
> flip you are spending. The `stock` skin names nothing, so it is exactly the shipped look.

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

## mono
- **label:** All mono
- **blurb:** The shell speaks in the terminal's own face. Everything reads as one machine.
- **--font-ui:** Menlo, 'DejaVu Sans Mono', Consolas, monospace

---

Notes, not entries.

**Why there is no `hidden: yes` on `stock`.** It is the no-op skin — the one that names no
tokens — and removing it would leave no way back to the shipped look from the picker.
Shadow it if you want a different default; do not delete it.

**Adding one.** Copy a block, rename the heading, and name any token from `@layer
foundations`: `--radius-*`, `--space-*`, `--text-*`, `--font-ui/mono/term`, `--edge*`,
`--motion-*`, and the colour roles. `docs/ui.md` lists them all with what each
governs. A token you spell wrong is simply ignored — a skin cannot break the app, only fail
to change it.
