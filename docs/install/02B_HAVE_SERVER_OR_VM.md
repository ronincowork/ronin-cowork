# 02B · HAVE A SERVER OR VM — run Ronin there

> Kickoff for an existing remote or always-on box. Exit when Claude or Codex is running
> on that box under the account that will own Ronin.

## Start

The_owner identifies the existing box and how they already administer it. That may be
SSH, Tailscale, another VPN, a provider console, physical access or a local terminal.

The access method is a fact about this box, not a separate Ronin scenario.

## Workflow

1. Connect using the existing administrative route.
2. Confirm the intended box and account with `whoami`, `hostname` and `uname -a`.
3. Record a recovery route: provider console, physical access or another known entrance.
4. Observe existing work with `tmux list-sessions 2>&1 || true`; change nothing yet.
5. Run `command -v claude || command -v codex`.
6. Open an existing CLI, or install and authenticate one on this box.
7. Give that process `06_ROGUE_AGENT.md`.

If the existing route is SSH without Tailscale, that is sufficient to begin. The later
`ronin_agent` can install Tailscale or retain another suitable private route. Do not expose
Ronin's port publicly.

## Exit

- the owner can reconnect to the existing box;
- its recovery route is recorded;
- existing files and tmux sessions are untouched;
- Claude or Codex is running on the box;
- that process accepts `06_ROGUE_AGENT.md`.
