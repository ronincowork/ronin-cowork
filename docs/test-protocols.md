# test_protocols — one command, one verdict, nothing else to run

Written for the agent about to test, whichever vendor's binary it runs in. There is one
test command in this house:

```
bin/ronin-byoin           # every repo check, every readout, then one verdict
bin/ronin-byoin --gates   # fast repo checks; no browser UI or live-machine readouts
bin/ronin-byoin --ui      # every repo check, including browser UI; no readouts
```

Run the mode appropriate to the work **once, when the work is done**. `--gates` is the
ordinary developer/pre-push/PR mode. Run `--ui` when a change can affect rendered UI,
browser journeys, layout, or visual composition. Full BYOIN is for an installed box
and includes both repo tiers before its machine readouts. UI modes may take a couple
of minutes and sit quiet while a browser is driven. Wait for them. Do not assemble your own
sequence of `scripts/check-*` calls, `tsc` runs and test files — every one of those is
already inside BYOIN, it keeps going past failures instead of hiding the second one
behind the first, and a hand-rolled sequence is exactly the drift this arrangement
exists to end. The individual scripts have one remaining use: re-running a single
check while diagnosing a failure BYOIN already named.

## Who this page is for

**Agents on an install** — this page's whole audience. Sessions that develop Ronin itself
work from their own testing page, which is not shipped and is not this one; nothing here
describes that workflow, so if you are maintaining a box, everything below applies to you.

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
  (for example, fast mode omits browser UI, or no headless browser is available). Read it; do not report a skipped
  check as verified.

The check roster is not kept anywhere by hand — BYOIN reads it out of `package.json`'s
`verify` chain, so the roster is whatever that chain names, plus the machine half this
page describes. The vocabulary — BYOIN as the umbrella term,
`byoin_check` vs `byoin_user_check` — is KOTOBA's. This page is the target of the
test_protocols pointer carried by the boot shelf and the shelf READMEs; if you were
sent here by one of those lines, this is all there is to know.
