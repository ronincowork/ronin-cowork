# Agent session
- **label:** Agent session
- **blurb:** How do I inspect or change an Agent's existence, and end my own safely?
- **class:** cowork
- **requires:** —
- **order:** 30

Reach for the session tools when the question is about an Agent's existence rather than
its work: inspect a name, launch a visible Ronin Agent, change Team or lead designation,
archive and restore, or end yourself safely.

**AN OWNER ASKING FOR AN AGENT ALWAYS MEANS: CREATE ANOTHER VISIBLE RONIN SESSION WITH
`session_create`. IT NEVER MEANS SPAWN A CLI-INTERNAL SUB-AGENT.** “Agent,” “new agent,”
“fork,” and “fork it” do not request or authorize spawning. Internal spawning is your
own implementation choice only when independently allowed; the owner's wording does not
provoke it. Supply the visible session's particular topic in its prompt.

**Create new session (Agent)** means create that visible session with `session_create`.
**Close session** means end this Agent safely with `session_end` after its custody
preflight succeeds.

**Live tools:** every command in the table below ships in `ronin_bin/`.

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `session_check` | read: one live session by exact name; `NO-SESSION` for an unused name | priority | `session_check --help` |
| `session_create` | create: one visible Agent from an explicit prompt and resolved Campaign/Team launch context | priority | `session_create --help` |
| `session_set` | write: an existing session's Team membership, lead designation, or project root | | `session_set --help` |
| `session_archive` | write: make one session resumable and leave desk custody unchanged | | `session_archive --help` |
| `session_restore` | create: restore one archived session | | `session_restore --help` |
| `session_end` | end: preflight custody and end this Agent only when safe | | `session_end --help` |

`session_create` is universal and is every Cowork Agent's one visible-session creation
surface. It does not inherit the caller's conversation or context: the caller supplies an
explicit prompt, while the ordinary resolver selects Campaign and Team launch context.
There is no dial option; creation does not change the caller, and the newborn reads its
own resolved birth packet and prompt.

Every documented `session_create` form is universal. Capability selection changes only
which workflow knowledge is taught.

## Lifecycle boundaries

- **Create** is the common visible-delegation path. Its `--prompt` gives the newborn's
  exact purpose; the canonical launch resolver supplies only Campaign/Team context and
  reports `BORN` or `REFUSED`.
- **End** runs the custody preflight and ends this Agent only after every assigned worktree is
  safe; nothing is discarded. **Archive** is distinct: it keeps the session resumable and
  leaves desk custody unchanged; **restore** brings one back.
