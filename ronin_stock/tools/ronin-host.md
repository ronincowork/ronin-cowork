# ronin-host
- **seed:** measure the machine: what it is, its space, its account, which secrets exist
- **when:**
- **depth:** seed
- **serves:**
- **order:** 70

Reach for `ronin-host` for measured machine facts, account state, secret presence, restart,
or maintenance. Machine configuration belongs to Machine settings; neither authority grants the other.

**Live tool:** `ronin-host --help` renders its fixed inspect, account, secrets, and restart subcommands.

Measurements are observations, not settings fields. Never write them or print credential values.

# HOST ABILITIES — measure the box

Machine, account and store inspection, backed by measured tools.

Facts about a machine are measured, never remembered: written paths, capacity, identities
and installation state go stale.

- `ronin-host inspect` reports what the box is and what space it has.
- `ronin-host account` reports the account this install runs as and its limits.
- `ronin-host secrets` follows the guarded secret-survey procedure; never print secret values.
- `bin/ronin-store --all` reports how every Ronin store resolves. Never spell a store path
  from memory.
- `ronin-testserver open <name>` gives a tmux server that is not the live one; use the `tmux`
  path it prints for every command, `ronin-testserver close <name>` when done. Nothing else:
  a server you did not get that way is one you may not touch.

Run the relevant tool before advising or changing machine-level state. If a machine tool
is absent from `PATH`, report that; do not improvise its guarded operation.

## Usage

`ronin-host --help` renders the available fixed subcommands. `inspect [path]` measures host and storage; `account` reports secret-free ownership and entitlement; `secrets [path]` reports key names and exposure, never values; `restart` restarts Ronin and nothing else without touching sessions. There is no generic writer or arbitrary service target.
