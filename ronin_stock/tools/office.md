# office
- **seed:** the office's facts in one, as they are now: what this office has set up, what it hasn't and what is available
- **when:**
- **depth:** seed
- **serves:**
- **order:** 71

## Usage

The office is a suite of office-facts, one file each in `~/ronin/office/facts/`, rewritten about a second
after what they read changes: `about_user` (the people and the notes on them), `machine`, `account` (hosted: the whole Lounge record),
`workspaces`, `integrations_authentications` (model providers, GitHub, integrations, Hermes
accounts), `teams_agents`, `epics` (onboarding's progress is its epic) and `defaults`. Your brief
names each with its line and path; read the file when you need it. `office read` prints them all
as one, GitHub's sign-in asked first; `~/ronin/office/MACHINE_STATUS.md` is the same, kept current. `office --help`.
