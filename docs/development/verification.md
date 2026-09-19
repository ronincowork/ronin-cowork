# Verification: focused work, one combined verdict

Individual contributors and Agents normally run only the checks relevant to their change.
They do not need to run `npm run verify` before committing or handing in. The full suite
can take many minutes; repeating it on each private worktree spends that time without proving
the combined Team change.

## During implementation and hand-in

- Use the smallest meaningful syntax, type, behavior, or rendered check for the affected
  surface. The [contributor map](../contributor-map.md) names the owning tests.
- For selected behavior tests, use the normal fixture teardown, for example:
  `node --import tsx --import ./tests/fixture-teardown.mjs --test tests/banner.test.ts`.
  Tests that need tmux obtain their servers through `tests/helpers/testserver.ts`.
- Use `npx tsc --noEmit` when a TypeScript verdict is relevant. Use explicit browser
  diagnostics when the change needs rendered or interaction evidence.
- Documentation-only changes usually need review and link checks, not the full suite.
- Report the commands and results in the hand-in, along with known failures and what
  remains untested. “Full verification deferred to the lead's final gate” is a normal
  hand-in status, not a missing contributor task.
- After changing an installed box or its user stores, run `npm run byoin` against those
  surfaces. It answers a different question from repository verification.

## At the integration and release gate

The Team lead or release maintainer owns the full `npm run verify` verdict for the
combined candidate. The normal point is the final gate before publishing global `dev`
to remote `dev` and opening or updating the `dev → master` release PR. A lead may choose
to run it at Team promotion into global `dev` when shared changes, conflict resolution,
or integration risk make an earlier combined verdict useful.

An individual Agent almost never needs a full run. An explicit owner or lead request
can assign one to that Agent for a specific candidate or integration investigation.
This is working guidance, not a command restriction or a new approval mechanism.

Record the tested commit and results so the Team can use that evidence without each
member repeating the suite. A changed candidate may need a new verdict; the lead decides
when the changes or outstanding failures justify it. Do not describe a failed or partial
run as green. Promotion's restart and health checks do not replace this repository verdict.

GitHub also runs verification on pull-request heads. CI evidence should be reported as
CI evidence; contributors do not need to duplicate that full run on their private worktrees.

## What the commands do

`npm run verify` runs TypeScript checking and the full behavior suite.
`npm run check:tests` and `node scripts/check-tests.mjs` run the full behavior suite too;
they are not focused alternatives. Playwright commands are explicit diagnostics.
The scripts remain callable, and this guidance adds no prompts, role checks, or locks.
