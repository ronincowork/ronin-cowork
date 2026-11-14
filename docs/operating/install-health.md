# install — is this install actually what it claims to be

> **Voice: agent.** How the agent verifies an install and says it back — not a walkthrough to relay.
> **No single tool answers this page.** The three checks below are read together.

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
GET /api/machine-settings     set · observed · status
```

`set` is what the owner answered. `observed` is what the box measured. **`status` is where
they meet, and the disagreements are the finding** — a project whose `dir` reads `missing`,
a default naming an agent that is not present, a job pointed at a provider whose key
variable is unset. Report them; do not quietly repair them.

```
GET /api/version    the release actually serving, and the services roster
```

```
GET /api/health     ok · auth · login · transcribe · presence
```

`presence` is `{ browsers, last_input_at, people }`. `browsers` is how many browsers hold the
live /events socket now; `last_input_at` is the ISO time of the last action a person took, meaning
the last non-GET `/api` request from a browser (Agents' tools on the operator socket do not count),
or `null` since the server started. On an office_park the kohai reads it every 30 s
([src/presence.ts](../../src/presence.ts)).

`people` says who is in a hosted office: one entry per email with a connected /events socket,
`{ email, role, last_input_at }`. The email is the guard's `X-Forwarded-Email` on the socket's
upgrade; the role is that email's in `members.json`, which the kohai writes into the `office_unit`
store beside `office_record.json` and Ronin re-reads when it changes. An email not in the file has
role `null`. Self-hosted, or with no header (an Agent or a shell inside the unit), `people` is `[]`
([src/office-people.ts](../../src/office-people.ts)). It all lives in memory only: no request body,
no keystrokes.

## Saying it back

Give the person three things and stop:

1. **what is true** — the verdict, the release, what the box has;
2. **what disagrees** — every place `set` and `observed` do not match;
3. **what is unresolved** — what nobody has answered yet, including anything waiting on
   them. This is the half people forget, and it is the half they need.

Never present a SKIP as a pass, and never present intent as measurement.
