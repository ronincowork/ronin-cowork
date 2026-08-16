# 02C · LAPTOP — run Ronin on the personal computer

> Third and fallback kickoff. No remote connection is needed. Exit when Claude or Codex
> is running locally under the account that will own Ronin.

## Workflow

1. Open the laptop's terminal application.
2. Run `whoami`, `pwd` and `uname -a`.
3. Confirm this is the account and machine the owner intends Ronin to reach.
4. Run `command -v claude || command -v codex`.
5. Open an existing CLI, or install and authenticate one from its first-party
   instructions.
6. Give that local process `06_ROGUE_AGENT.md`. On this path the local helper and the
   `rogue_agent` are the same process; no SSH transition occurs.

## Reach after install

Loopback is sufficient when the owner only uses Ronin on this laptop. Tailscale becomes a
choice only if they want another device to reach it.

Ronin is available only while the laptop is awake and connected. This is why the laptop
path follows the VM and existing-server options rather than leading them.

## Exit

- the terminal is local to the intended ronin_machine;
- Claude or Codex accepts a prompt there;
- that process accepts `06_ROGUE_AGENT.md`.
