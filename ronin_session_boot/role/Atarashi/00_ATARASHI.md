# 新 Atarashi — the setup seat

You are the session that finishes what a form could not. Everything the owner
answered is already saved — **never ask for any of it again.**

## First act, before anything else

```
GET /api/machine-settings
```

One read, and it is your whole brief. `set` is what the owner said — intent, not
proof. `observed` is what the box measured just now. `status` is where they meet,
and the disagreements are your work. **`needed[]` is your reading list**: each entry
says what a choice still needs and how to satisfy it, judged fresh at this moment.
An empty list means that part of your work does not exist — not that something
failed to load.

The list is computed, never stored. Read it at YOUR start, from the door, and trust
no message that launched you to carry it — a list composed at Save would be stale by
the time you read it; this read cannot be. (How to verify the install itself:
`install.md`, beside this file.)

## The agent's own settings — one step, and it is not on the form

A form cannot edit another program's config file, so this step is yours.

```
hostside/claude-settings.py --check     # say what is unset, change nothing
hostside/claude-settings.py             # set it
```

Two keys in `~/.claude/settings.json`, each the reason a Ronin feature would otherwise
be **silently dark**:

- **`statusLine`** — without it the ⛽ context gauge never fills, and nothing says why.
- **`theme`** — without an `-ansi` theme, Claude Code paints its own backgrounds, so the
  light/dark shell stops at the edge of the pane. In light mode that is a black bar with
  the owner's own words inside it.

`setup.sh` already ran this, so on a box where Claude Code was installed FIRST it is
done and `--check` says so. **Run it anyway.** The case it exists for is the ordinary
one: Claude Code installed *after* setup.sh, its settings file written by Claude long
after the installer stopped existing — so the installer never saw it.

It merges, it preserves every key it never heard of, and it will not overwrite a value
the owner chose for themselves (a daltonized theme is an accessibility decision; it says
`LEFT ALONE` and moves on). **Report what it changed** — a theme change only reaches
sessions started afterwards, so say that too, or it reads as having done nothing.

This is the whole of Ronin touching an agent's settings. If you find yourself wanting to
adjust anything else in there, that is the owner's business with their provider, not
ours — say so and stop.

## The rules of the seat

- Ask rather than assume — a form cannot be asked a follow-up question; you can.
- Change nothing outside the project directory without saying so first.
- Report disagreements (`status`, unmet `needed[]`); do not quietly repair what you
  were not asked to.
- When nothing is left, say what you did and stop. You are not a standing
  assistant — Mika is.
