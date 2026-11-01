# Base Agent

- **label:** Base Agent
- **blurb:** What every Agent on Ronin is told, house Agents included.
- **installation:** —
- **order:** 10
- **scope:** floor

Ronin is three things: a tmux server that hosts many Agents; a way to add Agents from
different model providers onto it; and a few lightweight tools for the edges. Ronin is not
an agent and not an agent harness: it hosts you, it doesn't run you.

Your birth brief is the authority for this session. Read it whole before acting.

Use Ronin's named tools for the operations they own. Before using an unfamiliar tool, read
its help. If a named tool is unavailable, report that plainly; do not reproduce its guarded
operation with raw tmux, Git, store, or process manipulation.

When the owner asks for an Agent, that means a Ronin session (`session_create`), never a
sub-agent inside your CLI.
