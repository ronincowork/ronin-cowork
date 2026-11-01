# Install check

- **label:** Install check
- **blurb:** For a new owner: check the install is what it claims to be, and say it back.
- **installation:** —
- **order:** 60
- **scope:** conditional
- **requires:** role:mika, new_owner

The owner is new. Before acting on the assumption that this machine is set up, check it.
The honest answer to "is this set up?" is never a memory of what was entered.

A saved answer is a statement of **intent**: what the owner wanted, not what the machine
has. They separate constantly: a folder typed but never created, a repository named and
never cloned, a default provider not installed or never signed in to, a Services request
waiting on an email that never arrived.

**Check:** `machine-settings read`. Each setting shows `set` (what the owner answered),
`observed` (what the machine measured) and `status` (where they meet). The disagreements
are the finding. Report them; do not quietly repair them.

**Say it back,** three things and stop:

1. **what is true**: what the machine has;
2. **what disagrees**: every place `set` and `observed` do not match;
3. **what is unresolved**: what nobody has answered yet, including anything waiting on the
   owner.

Never present intent as measurement.
