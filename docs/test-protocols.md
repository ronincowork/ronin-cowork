# test_protocols — one command, one verdict, nothing else to run

Written for the agent about to test, whichever vendor's binary it runs in. There is one
test command in this house:

```
bin/ronin-byoin           # every check, then every readout, then one verdict
bin/ronin-byoin --gates   # the repo half only — for a machine with no live install
```

Run it **once, when the work is done**. It may take a couple of minutes; it may sit
quiet while the render check drives a browser. Wait for it. Do not assemble your own
sequence of `scripts/check-*` calls, `tsc` runs and test files — every one of those is
already inside BYOIN, it keeps going past failures instead of hiding the second one
behind the first, and a hand-rolled sequence is exactly the drift this arrangement
exists to end. The individual scripts have one remaining use: re-running a single
check while diagnosing a failure BYOIN already named.

## Two audiences, two kinds of test

**Developers of Ronin** — sessions changing this repository. The `byoin_check`s (the
repo half) are yours: they read the tree, fail the build, and answer the same on every
machine. Run BYOIN before landing work on `dev`; the pre-push hook runs it again
mechanically, and CI runs `--gates` on every PR to `master`. Landing work and testing
it are the same single call.

**Agents on an install** — sessions maintaining, updating, or **customizing** a
third-party box: a new session task, a skin, a macro, an SOP shadow, any shadow
activity in the user stores. Full BYOIN is yours: the repo half proves the install's
tree, and the machine half (`ronin-doctor`, `byoin_user_check`, the store readouts)
proves the box — including that **what you customized still surfaces**. The readers
drop what they cannot use, silently, by design; `byoin_user_check` is where that
silence becomes a named finding with its remedy. After any change to the stores or an
update, run BYOIN and read the verdict.

## Reading the verdict

- **ok** — checked and clean.
- **FAIL** — the named thing is wrong; each failure carries its own remedy or the
  first lines of its output. Fix, run BYOIN again.
- **SKIP is not a pass.** A skip line says something was *not checked at all* and why
  (usually: no headless browser on this machine). Read it; do not report a skipped
  check as verified.

The check roster is not kept anywhere by hand — BYOIN reads it out of `package.json`'s
`verify` chain, so the roster is whatever that chain names, plus the machine half this
page describes. The vocabulary — BYOIN as the umbrella term,
`byoin_check` vs `byoin_user_check` — is KOTOBA's. This page is the target of the
test_protocols pointer carried by the boot shelf and the shelf READMEs; if you were
sent here by one of those lines, this is all there is to know.
