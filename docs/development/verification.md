# Verification: the typecheck, two guards, then the real surface

`npm run verify` is the gate: `tsc --noEmit`, then two guards in `tests/`. The owner cut the
suite by about 90% (23 Nov 2026): tests that pin a surface stop it changing, and while Ronin
is being built, change is the work. Agents build, typecheck and hand in; the lead promotes;
the owner reviews the real surface on global dev, and his feedback is the check. A full test
protocol for the running environment comes when Ronin is in production.

## The two guards

Each guards a failure nobody sees by looking at the page:

| File | What breaks, unseen |
|---|---|
| `tests/sign-in.test.ts` | the password gate: page and API closed until login, open after it, closed after logout |
| `tests/stores.test.ts` | Teams, Workspaces, plans, items and secrets read back after a restart; a secret is 0600 and never printed; Agents outlive the restart |

Both boot a real Ronin through `tests/helpers/ronin.ts` (a private tmux server, scratch
roots, stub CLIs and systemd tools). Add no surface or layout tests; a guard that is ever
flaky is deleted, not retried.

## Running it

- `npm run verify`: `scripts/check-tests.mjs` clears `TMUX`, `RONIN_SOCKET` and the other
  live addresses, runs the files, and fails if the live tmux server changed.
- From an Agent's own pane, run it under `systemd-run --user --scope -q npm run verify`.

CI (`.github/workflows/verify.yml`) runs `npm run verify` on every pull request.

## Outside the gate

- `npm run smoke:ui` is the rendered-page check. `ronin-gate`, `ronin-update` and
  `ronin-deploy` run it; it needs Playwright and a browser.
- `npm run byoin` checks a real box's user stores. `ronin-doctor` runs it.

Report what you ran in a hand-in. Do not describe a failed or partial run as green.
