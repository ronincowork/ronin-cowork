# HOST ABILITIES — measure the box

This reading belongs to the **Ronin Host** Routine. It teaches machine, account and store
inspection backed by measured tools.

Facts about a machine are measured, never remembered: written paths, capacity, identities
and installation state go stale.

- `tejun-survey` reports what the box is and what space it has.
- `tejun-account` reports the account this install runs as and its limits.
- `tejun-secrets` follows the guarded secret-survey procedure; never print secret values.
- `bin/ronin-store --all` reports how every Ronin store resolves. Never spell a store path
  from memory.
- `ronin-testserver open <name>` gives a tmux server that is not the live one; use the `tmux`
  path it prints for every command, `ronin-testserver close <name>` when done. Nothing else:
  a server you did not get that way is one you may not touch.

Run the relevant tool before advising or changing machine-level state. If a Machine tool
is absent from `PATH`, report that the behaviour was not delivered; do not improvise its
guarded operation. The full procedures live in the Machine SOPs and the corresponding
rows of `ronin_catalogs/TOOLS.md` and `ronin_catalogs/ACTIONS.md`.
