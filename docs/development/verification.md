# Verification: the typecheck, then the real surface

`npm run verify` is the gate: `tsc --noEmit`. There is no test suite (owner, 23 Nov 2026:
tests that pin a surface stop it changing, and while Ronin is being built, change is the
work). Agents build, typecheck and hand in; the lead promotes; the owner reviews the real
surface on global dev, and his feedback is the check.

CI (`.github/workflows/verify.yml`) runs `npm run verify` on every pull request.

## Outside the gate

- `npm run smoke:ui` is the rendered-page check. `ronin-gate`, `ronin-update` and
  `ronin-deploy` run it; it needs Playwright and a browser.
- `npm run byoin` checks a real box's user stores. `ronin-doctor` runs it; run it after
  changing an installed box or its stores.

Report what you ran in a hand-in. Do not describe a failed or partial run as green.
