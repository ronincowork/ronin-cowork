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

Where they came from, and how to take them again when the mark moves:

```sh
LAB=../ronin-lab                      # wherever the lab is checked out
cp $LAB/landing/concepts/nin-mark.svg  public/brand/
cp $LAB/design/assets/nin-mark-32.png  public/brand/
cp $LAB/design/assets/nin-mark-256.png public/brand/
cp $LAB/design/assets/nin-mark-512.png public/brand/
```

**The mark changes in the lab first.** Its SVG is the master and the PNGs are exports
rendered from it; neither is edited here. Editing a file in this directory produces a
second, quietly divergent mark — the exact failure the lab's own design notes warn about.

The colours are shared and are NOT copied. `--kaki: #c46243` is the mark's persimmon and is
already a token `public/style.css` defines, governed by `docs/ui.md`. The lab extends that
vocabulary rather than keeping a parallel palette, and so does this.

Served by `src/index.ts` from **ahead of the auth gate**, so the login page can wear it.
