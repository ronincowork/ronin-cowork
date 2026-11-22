# office
- **seed:** the office's facts in one, built now: what this office has set up, what it hasn't and what is available
- **when:**
- **depth:** seed
- **serves:**
- **order:** 71

## Usage

The office is a suite of facts, one file each in `~/ronin/library/facts/`, rewritten whenever what
they read changes: `about_user` (the people and the notes on them), `machine`, `account` (hosted),
`workspaces`, `integrations_authentications` (model providers, GitHub, integrations, Hermes
accounts), `teams_agents`, `epics` (onboarding's progress is its epic) and `defaults`. Your brief
names each with its line and path; read the file when you need it. `office read` prints them all,
built now, as one; `~/ronin/library/MACHINE_STATUS.md` is the same, kept current. `office --help`.
