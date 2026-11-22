# ronin-cowork — agent contract

Start with [AGENTS.md](AGENTS.md) for the contributor route. Individual Agents use focused
checks and normally leave `npm run verify` to the Team lead/release maintainer at the
final combined gate. A lead may request an earlier integration run; see
[verification guidance](docs/development/verification.md). Playwright suites are explicit
diagnostics. Desk work follows the desk contract handed to you at birth
(`ronin_stock/behaviours/working-at-a-desk.md`): **commit** preserves,
**hand-in** publishes to the team line, and `git push` belongs only to release work.
After changing an installed box or its user stores, run `npm run byoin` to check that
current user customization surfaces.
