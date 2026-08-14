# ronin_bin — the agent-facing tools

The executables the catalogs tell an agent to type, by bare name — `tejun`,
`tejun-step`, `tejun-send`, `tejun-peek`, `tejun-group`, `tejun-wipeboard`,
`tejun-harakiri`, `tejun-recall`, `tejun-remember`, `tejun-rireki`. `setup.sh` puts
this directory on PATH, after `bin/shim` (the guards) and ahead of `bin/`.

**What belongs here and what does not.** A tool — a script a cataloged action names
(`ronin_catalogs/TOOLS.md`) — lives here. The house's own scripts (`ronin-*`,
`setup.sh`, the shim, the byoin_checks) stay where they are: they have callers, not
actions, and an agent never types them. One shelf per audience:
**ronin_catalogs** (what you can do) · **ronin_library** (the reading) ·
**ronin_sops** (how this house works) · **ronin_bin** (what you run).
