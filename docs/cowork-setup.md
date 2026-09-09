# cowork_setup

`cowork_setup` is RoninCoWork's first conversation with a new owner. Its only deliberate
local route is `/cowork-setup`. It has no query-string aliases or legacy renderer.

The page first shapes the coworkspace, then starts the first project. It is one readable,
collapsible form rather than a wizard. The sticky **When you save** panel is a live account
of the current answers, measured facts, and consequences. Nothing in that panel may be a
hidden setting.

## Live sources and writes

| Surface | Source | Save consequence |
|---|---|---|
| Campaign name and description | home Campaign | the home Campaign's title and description |
| Coworkspace name | machine document plus hostname fallback | the machine document's name |
| Owner name | machine document plus account-name fallback | the machine document's owner name |
| Kind and Routine Bundle | registry defaults | the home Campaign's agent behaviours and routines; the bundle also selects the machine's new-project desk mode |
| Agents | measured agent catalog | the machine document's wanted agents, followed by installation work for absent selections |
| New-session model | runnable launch-spec catalog | the configured default model record |
| Desk profile | desk-profile catalog | the home Campaign's desk profile |
| Mika model | runnable launch-spec catalog | the machine document's Mika job model |
| Maximum agent sessions | saved value or RAM estimate | the machine document's session ceiling; `0` means no limit |
| Ronin Services | activation record | one disclosed activation request when newly selected |
| gbrain | machine document | the machine document's explicit enabled state |
| First workspace folder | owner answers plus read-only folder inspection | one project-root record with its remit |
| Git repository | measured from the working folder | review fact only; never stored as an answer |

The RAM estimate reserves 25% of memory, or 2 GB when that is larger, then divides the
remainder by roughly 700 MB per agent session and rounds down. It is an estimate, never the
meaning of **No limit**.

Folder inspection is local and read-only. `GET /api/project-roots/inspect?dir=…` reports
whether the directory exists, its top-level Git remote and branch, and recognized project
instructions. The optional **Your first workspace folder** card uses the same host-side chooser
as the Campaign Workbench. It can select an existing directory or create one named child after
showing the exact destination. `Start Git version history` initializes only a local repository.

## Interaction contract

- Installed agents are measured facts and require no action.
- Addable agents are choices whose installation begins after Save.
- Agents without a safe installer have no working selection control and say why.
- Services and gbrain remain optional; base Cowork is complete without them.
- Selecting Services discloses the activation request and requires an email. Save requests
  activation but does not block entry to Cowork while email confirmation is pending.
- The first Workspace Folder is optional. The review names the selected Agent starting folder or
  says that the owner chose to add one later from the Campaign Workbench.
- Save validates the visible form, writes through the existing SETTEI/project/activation
  APIs, dispatches selected installs, launches the setup seat when runnable, and opens Cowork.

## Visual contract

The page uses the same semantic tokens as the landing page and workspace: blue-black
surfaces, kakiiro identity and primary actions, olive only for measured live state, system
type for reading, and mono only for compact labels and facts. Desktop keeps the review panel
sticky; narrow screens stack it beneath the form. The authored Ronin mark and wordmark remain
the shared identity.

## Proof

The implementation is `public/js/cowork-setup.js`, served at `/cowork-setup` by
`src/index.ts` and entered through `public/js/main.js`.
`tests/cowork-setup.test.ts` protects its content, live data dependencies, Save wiring, and
canonical route. Repository verification also renders desktop Chromium and phone WebKit,
checks UI fingerprints, parses every client module, and runs the TypeScript and house gates.
