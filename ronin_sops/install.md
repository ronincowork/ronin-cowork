# install — is this install actually what it claims to be

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `install.md`) replaces
> this file whole — a default, not law.
> **Voice: agent.** How the agent verifies an install and says it back — not a walkthrough to relay.
> **Tool: `tejun-install` — NOT BUILT YET.** When it exists it answers this whole SOP in
> one call: the install's status document and everything left unresolved. Until then the
> three checks below are run by hand and reasoned across. The gap is recorded in
> `OPEN_THREADS` 1.12.

This covers **checking that an install is what it says it is** — after a setup page has
saved answers, after an update, or whenever someone is about to act on the assumption that
the box is configured. It arrives as *"is this thing set up?"*, and the honest answer is
never a memory of what was entered.

## What a saved answer is, and is not

A saved answer is a statement of **intent**. It says what the owner wanted; it does not say
what the box has. Those separate constantly:

- a directory that was typed but does not exist, or a repository that was named and never
  cloned;
- an agent recorded as the default that is not installed — or is installed and has never
  been signed into;
- a services half waiting on an email confirmation that never arrived;
- a release that was updated under a running operator, so what is serving is not what is
  on disk.

The rule: **treat a record of what was done as evidence, not truth. Re-run any check
before relying on it.** That applies hardest when the evidence is a form, because a form
cannot be asked a follow-up question and a person can.

## The three answers, cheapest first

```bash
npm run byoin                   # check current user-store customization
```

A **SKIP is neither failure nor proof** — read the line and say what was not checked. A
missing headless browser is the ordinary state of a fresh box, not a fault; never install
contributor-only host tools to make a first install look green.

```
GET /api/settei     set · observed · status
```

`set` is what the owner answered. `observed` is what the box measured. **`status` is where
they meet, and the disagreements are the finding** — a project whose `dir` reads `missing`,
a default naming an agent that is not present, a job pointed at a provider whose key
variable is unset. Report them; do not quietly repair them.

```
GET /api/version    the release actually serving, and the services roster
```

## Saying it back

Give the person three things and stop:

1. **what is true** — the verdict, the release, what the box has;
2. **what disagrees** — every place `set` and `observed` do not match;
3. **what is unresolved** — what nobody has answered yet, including anything waiting on
   them. This is the half people forget, and it is the half they need.

Never present a SKIP as a pass, and never present intent as measurement.
