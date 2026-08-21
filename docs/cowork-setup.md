# cowork_setup

`cowork_setup` is RoninCoWork's first conversation with a new owner. Its canonical local
route is `/cowork_setup`; `?setup` and `?cowork_setup` are accepted only to redirect old links.

The page first shapes the coworkspace, then starts the first project. It is one readable,
collapsible form rather than a wizard. The sticky **When you save** panel is a live account
of the current answers, measured facts, and consequences. Nothing in that panel may be a
hidden setting.

## Live sources and writes

| Surface | Source | Save consequence |
|---|---|---|
| Coworkspace and owner names | SETTEI plus machine defaults | machine and owner settings |
| Agents | measured agent catalog | absent selected agents become wanted, needed, and installation work |
| Session and Mika models | runnable launch-spec catalog | agent defaults |
| Maximum agent sessions | saved value or RAM estimate | session ceiling; `0` means no limit |
| Ronin Services | activation record | disclosed Shiwake activation request when newly selected |
| gbrain | SETTEI | explicit enabled state |
| First project | owner answers plus read-only folder inspection | project root and remit |
| Git repository | measured from the working folder | review fact only; never stored as an answer |

The RAM estimate reserves 25% of memory, or 2 GB when that is larger, then divides the
remainder by roughly 700 MB per agent session and rounds down. It is an estimate, never the
meaning of **No limit**.

Folder inspection is local and read-only. `GET /api/project-roots/inspect?dir=…` reports
whether the directory exists and its top-level Git remote and branch. It creates nothing,
makes no network request, and does not replace the project-root write on Save.

## Interaction contract

- Installed agents are measured facts and require no action.
- Addable agents are choices whose installation begins after Save.
- Agents without a safe installer have no working selection control and say why.
- Services and gbrain remain optional; base Cowork is complete without them.
- Selecting Services discloses the activation request and requires an email. Save requests
  activation but does not block entry to Cowork while email confirmation is pending.
- The first project name and existing working folder are required. Purpose is optional.
- Save validates the visible form, writes through the existing SETTEI/project/activation
  APIs, dispatches selected installs, launches the setup seat when runnable, and opens Cowork.

## Visual contract

The page uses the same semantic tokens as the landing page and workspace: blue-black
surfaces, kakiiro identity and primary actions, olive only for measured live state, system
type for reading, and mono only for compact labels and facts. Desktop keeps the review panel
sticky; narrow screens stack it beneath the form. The authored Ronin mark and wordmark remain
the shared identity.

## Proof

The implementation is `public/js/cowork-setup.js`, served at `/cowork_setup` by
`src/index.ts` and entered through `public/js/main.js`.
`tests/cowork-setup.test.ts` protects its content, live data dependencies, Save wiring, and
canonical route. Repository verification also renders desktop Chromium and phone WebKit,
checks UI fingerprints, parses every client module, and runs the TypeScript and house gates.
