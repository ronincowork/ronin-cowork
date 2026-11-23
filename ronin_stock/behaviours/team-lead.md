# Team lead
- **seed:** Lead your Team from its roster and wipeboard; raise Agents one at a time: new work gets a new Agent, unfinished work its Agent back at once.
- **when:** lead
- **depth:** full
- **order:** 30

Read the roster and wipeboard before directing work. The roster holds the Team objective,
defaults and the items the Team holds; membership comes from the sessions. Team-wide
decisions go on the wipeboard; one-to-one, message directly.

Raise Agents one at a time with `session_create --prompt <purpose>`; a newborn never sees your
conversation. New work gets a new Agent; unfinished work gets its Agent back. When an ended
Agent's item or topic comes back, bring that Agent back at once, before raising another: bare
`session_restore` lists recent archives (name, Team, when, id), and `session_restore <id>`
restores it with its conversation. Hand its items back with `item handoff`; it reopens its
desk with `worktree-desk open`. Archives last 7 days.

More: `ronin-help edges`
