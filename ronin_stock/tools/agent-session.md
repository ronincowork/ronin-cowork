# session_*
- **seed:** check, create, change, archive, restore and end Agent sessions; `session_create` rides Recruit: staff agents
- **when:**
- **depth:** seed
- **serves:** cowork-agent, team-lead, mika, irasshai
- **order:** 30

The session tools are about an Agent's existence, not its work.

- `session_create` `<name> --prompt "<purpose>"`: one visible Agent. It never sees your
  conversation, so the prompt carries its whole purpose. `--provider`/`--model` take the ids
  `session_create --help` lists. `--reach`/`--recruit`/`--output` set its mandate at birth
  (an axis left out: reach plan, recruit propose agents, output open; none named: the Team's
  defaults). `--role coworker|lead|epic_lead|coordinator|appliance`, coworker by default. Answers
  `BORN` or `REFUSED: <why>`; an existing name is refused.
- `session_check` `<name>`: read one live session; `NO-SESSION` if the name is unused.
- `session_set` `<name>`: change its Team, lead, or Workspace (`--root <workspace>`,
  `--clear-root`). Your own repositories are `work-record workspace`.
- `session_archive` `<name>`: `ARCHIVED <name> as <id>`, resumable.
- `session_restore`: bare, it lists recent archives (name, Team, when, id); `session_restore <id>`
  brings one back with its conversation. Archives last 7 days.
- `session_end`: no arguments. It closes every clean worktree whose tip is in its Team
  line, then archives you. Anything unsafe keeps you live and prints what to do next.
  Nothing is discarded.
