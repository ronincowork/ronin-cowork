# Verification: focused work, one combined verdict

`npm run verify` is the whole gate: `tsc --noEmit`, then the behaviour suite in `tests/`,
about half a minute. Individual Agents build, typecheck and hand in; the Team lead or
release maintainer runs the gate once on the combined candidate and owns its verdict.

## What the suite checks

Only what a user would hit when it breaks, one file each:

| File | What breaks for a user |
|---|---|
| `tests/agents.test.ts` | launching an Agent (Claude, Codex, a terminal), archive and restore |
| `tests/tools.test.ts` | an Agent's tools reaching Ronin: `item`, `work-record`, `edges`, `ronin-url` |
| `tests/stores.test.ts` | Teams, Workspaces, plans, items and secrets reading back, also after a restart |
| `tests/promotion.test.ts` | desk open, hand-in, promotion into `dev`; a failed health check reverted; Chat's file and commit links |
| `tests/setup.test.ts` | a fresh box: health, the page, Setup's providers and sign-in, the onboarding epic, Help (Mika) |
| `tests/sign-in.test.ts` | the password gate on the page and the API, login and logout |
| `tests/epics.test.ts` | the Epics page and one Epic's page: epic-stage, what needs you, order, New Epic, the four columns, Mark Epic Done (needs Playwright, as `rig` does) |
| `tests/terminal.test.ts` | typing in a tile, the Message box, a foreign socket refused |

Every file boots a real Ronin (`src/index.ts`) through `tests/helpers/ronin.ts`:
- a private tmux server (`tests/helpers/testserver.ts`), free port and scratch roots;
- stub `claude` and `codex` that record how they were started;
- stub `systemctl`, `systemd-run` and `loginctl`, because Ronin stops an Agent pane's scope
  and a test server's panes share the scope of whoever started the run;
- `NODE_ENV=production`, the only mode in which the entry point binds its operator socket.

Tests drive routes, tools and the tmux server and check the result. They never read source
or document text. A test that is ever flaky is deleted, not retried.

## Running it

- `npm run verify`: the gate. `scripts/check-tests.mjs` clears `TMUX`, `RONIN_SOCKET` and
  the other live addresses, runs the files four at a time, and fails if the live tmux
  server changed.
- One file: `env -u TMUX -u TMUX_PANE -u RONIN_SOCKET node --import tsx --test
  tests/agents.test.ts`.
- From an Agent's own pane, run it under `systemd-run --user --scope -q npm run verify` as
  a second wall around the Agent's scope.

CI (`.github/workflows/verify.yml`) runs `npm run verify` on every pull request.

## Outside the gate

- `npm run smoke:ui` is the rendered-page check. `ronin-gate`, `ronin-update` and
  `ronin-deploy` run it; it needs Playwright and a browser.
- `npm run byoin` checks a real box's user stores. `ronin-doctor` runs it; run it after
  changing an installed box or its stores.

Report the commands and results in a hand-in, with known failures and what was not run.
Do not describe a failed or partial run as green.
