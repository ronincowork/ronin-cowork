# The house mark, in Cowork

Identity artwork only. **Nothing here is a source of truth** — every file is a copy of an
asset the ronin-lab repository owns. It is duplicated rather than referenced because a
running install has no lab beside it: this directory is what the server can actually serve
at `/brand/`.

| File | What it is for |
|---|---|
| `nin-mark.svg` | the favicon browsers prefer — sharp at every size |
| `nin-mark-32.png` | favicon fallback where SVG is refused |
| `nin-mark-256.png` | `apple-touch-icon` — the home-screen icon |
| `nin-mark-512.png` | held for a manifest; no consumer yet |
| `services-mark.svg` | the Ronin Services mark — an R and S built from the house hexagon, leaning with its edge; blue R, kaki S and frame; worn by the Setup Services surface |

Where they came from, and how to take them again when the mark moves:

```sh
LAB=../ronin-lab                      # wherever the lab is checked out
cp $LAB/landing/concepts/nin-mark.svg  public/brand/
cp $LAB/design/assets/nin-mark-32.png  public/brand/
cp $LAB/design/assets/nin-mark-256.png public/brand/
cp $LAB/design/assets/nin-mark-512.png public/brand/
```

**`services-mark.svg` is the one exception to the copy rule.** It is authored here, in code,
from the house hexagon and `--kaki`; it has no PNG exports and no lab master yet. If the lab
adopts it, this file becomes the copy and the lab the master, as with the hito mark. Its R
is the shell's reference blue: `--accent-2` when the markup is inlined in the page, and that
token's light and dark values by colour scheme when the file is loaded as an image.

**The mark changes in the lab first.** Its SVG is the master and the PNGs are exports
rendered from it; neither is edited here. Editing a file in this directory produces a
second, quietly divergent mark — the exact failure the lab's own design notes warn about.

The colours are shared and are NOT copied. `--kaki: #c46243` is the mark's persimmon and is
already a token `public/style.css` defines, governed by `docs/ui.md`. The lab extends that
vocabulary rather than keeping a parallel palette, and so does this.

Served by `src/index.ts` from **ahead of the auth gate**, so the login page can wear it.
