# office
- **seed:** the machine status, the one complete truth: what this office has set up, what it hasn't and what is available
- **when:**
- **depth:** seed
- **serves:**
- **order:** 71

## Usage

`office read` prints the machine status: this office as it is now, assembled from Ronin's own
records each time. The machine (a hosted office or self-hosted, with what that means for sign-ins;
Ronin's version; disk); the people as the Business Lounge's About You has them (an empty About You
says it is not filled in yet) and the notes on them (`~/ronin/library/ABOUT_USER.md`); the gecko
and its status line, when one is on; every model provider Ronin knows, installed or not, signed in
or not, Activated or off; developer tools (the GitHub CLI, signed in and as whom: a GitHub clone
needs it); onboarding's steps and where each stands; each Workspace with its Summary (its doc,
`~/ronin/library/workspaces/<handle>.md`), repos, folders, integrations, plans and canvases, and
its Teams: the lead and each Agent with the items it holds; what is flagged and what is In Review,
with who holds it; Agents running outside a Team; every integration, connected or not; Ronin
Services' parts; the defaults new Agents get; and, in a hosted office, the account from the
Business Lounge. Read it before you talk about the office, its people or their projects, and
before a step that needs something set up first. `office read --workspace <name>` is the machine
and that one Workspace: a lead's bearings. `office write` saves the machine status to
`~/ronin/library/MACHINE_STATUS.md`, as Settings' Machine status does. `office --help`.
