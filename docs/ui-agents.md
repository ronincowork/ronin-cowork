# ui-agents — what each agent CLI needs before it looks right in a tile

**One file, a section per agent, because they all face the same three questions.** Ronin
paints the pane; the agent paints inside it, and every CLI answers differently. This is the
record of what we have had to do per agent, so the next one — Gemini, Grok, Hermes — is a
section rather than a rediscovery.

`docs/ui.md` is the design system. This is the compatibility layer around it.

## The three questions to ask of any agent CLI

1. **Does it address ANSI slots, the 256-colour cube, or hardcoded RGB?**
   Slots (0–15) follow Ronin's palette by name. The cube (16–255) follows it since
   **Hardcoded RGB follows nothing** and cannot be reached; that agent keeps its own colours
   in whichever shell you are in.
2. **Does it paint filled backgrounds?** A fill is the same palette as text, so it inverts
   with everything else — but an agent that fills with a hardcoded RGB leaves a rectangle
   of its own colour inside the pane.
3. **Does it ASK the terminal what colour it is?** Look for `\e]10;?` and `\e]11;?` at the
   head of its tape. An agent that queries picks its theme **once, at startup**, and is
   wrong for the rest of the process the moment you flip. Nothing in the palette reaches
   it, because the decision has already been made — and such an agent usually answers in
   truecolor, which is unreachable anyway.
4. **Where does it keep its settings, and does that file travel?** None of them are in this
   repo. A fresh install has the vendor's defaults, not yours (OPEN_THREADS 1.13).

## Claude Code

**Follows the shell, but only under an `-ansi` theme.** Its themes come in two shapes:
`light`/`dark` hardcode RGB, and `light-ansi`/`dark-ansi` emit slot NAMES. Under the
latter it never sends a colour, so the terminal holds the slot and re-renders the moment
`applyTheme` pushes a new palette.

**Pin `dark-ansi`, in both shells.** Measured on this palette:

| theme | its `text` slot | on Ronin light | on Ronin dark |
|---|---|---|---|
| `light-ansi` | `ansi:black` | 15.57:1 | **1.17:1 — body text invisible** |
| `dark-ansi` | `ansi:whiteBright` | 17.29:1 | 16.06:1 |

`light-ansi` reads perfectly until the first flip to dark, then the body text is gone. This
works at all only because light's ANSI white and bright-white are **dark ink**, so "15 is the
strongest mark" holds in both shells — see the ANSI-white note in `docs/ui.md`. Change 7 or
15 in either shell and recompute this table.

- **Setting:** `~/.claude/settings.json` → `"theme": "dark-ansi"`
- **Not handled by Ronin.** It never reads or writes that key.

## Codex

**Addresses the 256-colour cube, not the sixteen slots.** A single session's tape:
`38;5;231` (pure white, ~4k occurrences), `38;5;246/244/247` (greys), `38;5;174/180/216`
(pastels), `38;5;220` (gold), and fills of `48;5;22 / 52 / 237 / 16`. Foreground codes
outnumber background ones about **fifty to one**.

**It has no theme setting at all** — `~/.codex/config.toml` carries approval policy, sandbox
mode, project trust and MCP servers, and nothing about colour. So there is no vendor-side
answer; the fix had to be ours.

**IT ALSO ASKS, AND THAT IS THE BIGGER ONE.** At startup Codex emits `\e]10;?` and
`\e]11;?` — a query for the terminal's own foreground and background — and picks a light or
dark theme from the answer. Once it has, it paints in **truecolor**. None of that is reachable
by any palette, so the choice is final for the life of the process.

**The remedy is a restart in the shell you want.** There is no live fix: Ronin answered the
question truthfully, and the agent only asked once. If Codex ever gains a theme setting,
pin it and the query stops mattering.

`termCube()`) — which covers a Codex session that started in the dark and uses the cube,
and does nothing for one that asked and went truecolor. The cube is
generated arithmetically and mirrored in **CIE L\*** on the light shell, which is what makes
its output readable on paper:

| Codex emits | before | after |
|---|---|---|
| `38;5;231` white text | 1.06:1 | **19.77:1** |
| `38;5;220` gold | 1.32:1 | **14.25:1** |
| `38;5;246` grey | 2.86:1 | **6.39:1** |
| `48;5;22` green fill | a dark rectangle | a light green fill |

The dark shell reads the cube as written, so it is byte-identical to before.

**Why this was a regression, not a limitation.** Until `cfb8230` the terminal stayed dark
under the light shell, so anything painting from the cube always had the ground it was
written for. Making the terminal follow the shell took that away from every program that
addresses the cube instead of the sixteen slots. Claude Code was unaffected; Codex was not.

## Adding the next one — Gemini, Grok, Hermes

1. **Find out what it emits.** Attach it, then read its tape out of the `session` store
   (`ronin-store session` resolves it — never hardcode the path — the store table is `src/stores.ts`):
   `cat -v "$(ronin-store session)"/<name>-*/tape/*/*.tape | grep -oP '\^\[\[[0-9;]*m' | sort | uniq -c | sort -rn | head`
   `38;5;` / `48;5;` is the cube — already handled. `38;2;` / `48;2;` is hardcoded RGB —
   not reachable, and the honest answer is a vendor setting or nothing. Bare `30–37` /
   `90–97` are the sixteen slots — already handled.
2. **Measure the common ones against `--term-bg` in both shells.** Anything under 3:1 is a
   defect, not a preference.
3. **Look for a theme setting** in its own config, and prefer one that emits slots. If it
   only offers hardcoded themes, pick whichever is legible in **both** Ronin shells — you
   cannot have one per shell, because Ronin does not write that file.
4. **Add a section here** with what it emits, what you set, and the measured numbers.
