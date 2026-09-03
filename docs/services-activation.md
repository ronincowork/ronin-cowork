# Ronin Services — requesting it, and what this install then holds

How a free Cowork install asks for Ronin Services, confirms an address, and ends up holding
one entitlement. The server half is SHIWAKE, at Ronin HQ; this page is the install's half.

**The contract this speaks is the released v1 set in the ronin-shiwake repository**, under its
contracts directory. Nothing here reads SHIWAKE's source or its work in progress — only the
released contract. (The path is deliberately not written as a live path: it is another repo,
and check-docs is right that this tree cannot vouch for it.)

## Where it lives

| | |
|---|---|
| `src/activation/transport.ts` | the allowlisted HTTPS client — AGERU's door |
| `src/activation/egress.ts` | the owner-visible record of what left |
| `src/activation/secrets.ts` | the two credentials, at `0600` |
| `src/activation/state.ts` | the durable stage |
| `src/activation/flow.ts` | request, poll, resend, cancel, change address |
| `src/routes/services-activation-api.ts` | the local-only browser API |

**This is core, not a service, and the KYOKAI gate enforced it.** When this was written the
paid layer still lived in this tree and the gate refused a first draft that put activation
under it. The split has since completed — the paid code lives in `ronin-services` and no
services directory remains here — but the rule that produced the placement still holds:
activation is the door a *free* install uses to ask for the paid one, so it cannot live behind
that door. Free Cowork must be able to request Services without Services being present.

## The house still has two egress doors

`src/machine-settings.ts` states the law: the house has exactly two doors — AGERU, and the model
provider. **Activation does not add a third.**

Activation and Tomodachi are two different *contracts* and two different *consent events*, but
they share one client: one allowlist, one TLS and timeout policy, one redaction rule, one
request-id convention, one egress record. That is why `transport.ts` exists rather than each
caller reaching for `fetch` — a second call site is a second door nobody voted for.

The client refuses plaintext, refuses any host but the allowlisted one, and refuses to follow
a redirect off it.

> the email. That ruling's stated reason was avoiding a new outbound destination — and this
> design honours it by reusing AGERU's door. Pasting could not survive a closed tab and put a
> credential through the clipboard; polling survives a phone click, a closed tab, and a
> restart.

## The local state machine

```text
not_requested → requesting → awaiting_email → verified → installing → installed

awaiting_email → expired | cancelled | address_changed
any active stage → error   (a retry resumes the SAME stage)
```

**Every transition is written to disk before the browser is told it succeeded.** Report-then-
persist would mean a crash in that gap leaves a person looking at "check your email" while
the install has no memory of having asked — so they ask again, and a second email goes out for
an activation that already exists.

The non-secret half lives in Ronin configuration where the owner can read it. It holds the
**masked** address, never the full one.

### One entitlement record

The activation aggregate is the only non-secret record of Services entitlement. It owns the
masked address, accepted terms version, activation stage, `entitlement_id`, and confirmation
time. The secret store owns the bearer token. SETTEI derives its Services and subscription
lines from that aggregate and cannot write entitlement facts.

The keys `machine_settings.json.services.{entitlement,email,verified,terms}` are inert. No
entitlement, status, installer, or telemetry path trusts them. An entitlement enters Cowork
only through the Shiwake confirmation and authenticated poll described here.

The poll persists the bearer token first, then the matching public identity, then deletes the
spent claim secret. That order is recoverable at either crash boundary: until the public record
lands, the claim remains available to poll again. A verified response must contain both an
`entitlement_id` and an entitlement token; Cowork rejects an incomplete pair and keeps the claim
for a later recovery poll.

## The two secrets, and where they live

Both in the `services_secrets` store, mode `0600`, written via a temp file and a rename so a
crash cannot leave a half-written credential that authenticates as nothing.

| secret | when | why it matters |
|---|---|---|
| claim secret | from request until confirmed | proves *this* install is the one that asked |
| entitlement token | from confirmation onward | authorizes release grants and Tomodachi |

**They are on the USER root, not the data root, and that is a decision.** An uninstall
*leaves* the user root and *deletes* the data root. An entitlement is the person's —
they asked for it and it is theirs — and destroying it because they uninstalled the free half
would cost them an email round trip to recover something they already own. The store table's
own test decides it: *"if deleting it would lose the user's own work or their choices, it is
user."*

Adding this store was a governed change: `scripts/check-stores.mjs` resolves every store
through both the TypeScript and the `bin/ronin-store` bindings and fails on any disagreement.

**Neither secret ever reaches the browser.** The claim secret is deleted the moment it is
spent.

## Where the person actually sees it

**cowork_setup** (`public/js/cowork-setup.js`) — ticking Services and giving an address now POSTs
`/api/services/activation`, which asks Ronin HQ to send the confirmation email.

**HQ being unreachable does not block setup.** Only a refusal we caused — a malformed
address — stops the page. Anything else finishes setup and leaves a pending request with a
Retry in ⚙ Configuration, which is the recovery rule made real rather than described.

**Cowork workspace** (`public/js/services-activation.js`) — a Services status control sits
beside the Ronin identity in the header and renders the durable stage, not what the page
remembers doing. Clicking the status control opens the available actions: Check status,
Resend confirmation, Change email, Cancel Ronin Services, or a recovery Install when needed.
A reload, a second tab, or an operator restart reads the same durable state.

**Polling is owner-triggered and visible.** Opening the status control does not contact
Shiwake. Pressing the kakiiro **Check status** button performs one poll and says it is checking
while that request is in flight. Page load and visibility changes may refresh local state, but
they do not poll Shiwake. There is no timed backoff loop and no background polling daemon.

## The browser API — local only, no secret crosses it

```text
GET    /api/services/activation           state + entitled + the egress record
POST   /api/services/activation           the consent action
POST   /api/services/activation/poll      one owner-triggered Shiwake check
POST   /api/services/activation/resend
DELETE /api/services/activation           pending request only
POST   /api/services/activation/address   change address
POST   /api/services/install              recovery; normally automatic
```

The browser talks only to the operator it is already looking at. It never calls SHIWAKE. That
shape matters because the operator holds the claim secret, and a browser that could see it
could hand another tab the ability to claim this install's entitlement.

`entitlement_id` **is** shown — it identifies and cannot authorize, and SHIWAKE refuses it as
a bearer token.

## Polling

The operator polls because it owns the secret, but only after the owner presses **Check
status** in the workspace popover. One press makes one request. Opening the popover, opening
the page, restoring a tab, or restarting the operator reads local durable state without
contacting Shiwake. **Do not add automatic polling or a background polling daemon.**

Every successful poll of a verified activation mints a **new** entitlement token and retires
the previous one. Store it immediately; the old one stops working at once.

## Consent, and what the card must say

Before sending, the Services card states, in plain words:

1. the address goes to Ronin to verify and manage Services access;
2. the exact Services terms version being accepted;
3. Services sends the described non-code weekly operating statistics;
4. **free Cowork sends none of this merely because it is installed**;
5. a pending verification can be cancelled, and Services can later be uninstalled.

The action says **"Send confirmation email"**, not "Save". Activation is an immediate,
disclosed account action and **does not enter a weekly review outbox** — a person who pressed
a button and got silence for a week would reasonably conclude it was broken.

## The user-facing states

| state | what the person sees |
|---|---|
| **Check your email** | the masked address, with Resend and Change address |
| **Email confirmed** | Cowork has claimed the entitlement |
| **Installing Services** | the updater's actual stage, not a guess |
| **Services are ready** | proven by the service roster, not merely by holding a token |
| **This link expired** | resend, without damaging an installed entitlement |
| **Waiting to send** | HQ was unreachable; Retry is offered and setup was not blocked |

## How this is proven

`tests/services-activation.test.ts` holds the unit half and honours the repo's gate: no
socket, no store, no live machine.

`tests/integration/two-leg.test.ts` is the real walk, and is deliberately **not** under
`tests/*.test.ts` so the unit gate ignores it:

```sh
npx tsx --test tests/integration/two-leg.test.ts
```

It spawns SHIWAKE as a subprocess and drives **these actual modules** against it — `flow.ts`
requests and polls, `secrets.ts` stores the credentials, `tomodachi.ts` sends, and
`libexec/ronin-hq.sh` (the shell `ronin-update --services` really runs) fetches the authorized
release and its checksum verifies. Nothing in it reimplements the client.

## Failure recovery

| what happened | what happens |
|---|---|
| SHIWAKE unreachable | **free setup still finishes**; a pending request is recorded with Retry |
| no email arrived | honour `resend_available_at`; offer resend and address change |
| link opened elsewhere, tab closed | polling completes the same activation |
| operator restarted | the durable stage resumes; the same entitlement is claimed |
| install failed | keep the entitlement, retry the install — **no second email** |
| Services already installed | attach the entitlement, verify roster and version first |
| entitlement disabled | stop authenticated work, explain it, **delete nothing** |
| terms changed | ask for explicit re-consent; never disguise it as a mail error |
| clock wrong | server timestamps govern expiry |

## The updater handoff

**Installation starts by itself** the moment a poll reaches `verified`. Waiting for somebody
to press a button left confirmed people looking at a finished flow that had not finished.

**And `installed` is proven by the roster, not by having launched something.** The updater is
started, then Services are watched for; if they do not appear within ten minutes the stage
becomes an error that says the entitlement is safe and a retry needs no new email.

It goes through the updater that **already exists**. `src/update-run.ts` is the single
launcher; the ⚙ gear's `POST /api/update/run` and this flow both call it, because two
launchers drift and the one that drifts is the one nobody presses until it matters.

`POST /api/services/install` is the recovery verb. It **runs** the updater.

### The authorized fetch

`libexec/ronin-hq.sh`, sourced by `bin/ronin-update --services`, is the real path:

```text
GET  /v1/services/releases/current?contract_version=N   →  release_id + version + sha256
POST /v1/services/releases/grant   { release_id }       →  a short-lived grant
GET  /v1/services/releases/:id/artifact?grant=…         →  the bytes
```

The contract number is read from this install **before** asking, because "current" means
current *for the contract we answer*.

**Verification is unchanged.** The manifest's `sha256` is written into a `SHA256SUMS` beside
the tarball, so the updater's existing checksum step runs exactly as it always has, and the
contract check after it is untouched. The checksum now comes from an *authenticated* answer
rather than from a file that travelled beside the download.

The public feed remains the fallback: the owner ruled that download ungated, and a box with
no entitlement must still be able to install.

**The entitlement authorizes the fetch; it does not certify the artifact.** The updater still
verifies the checksum and the Cowork/Services contract. An updater that stopped checking
because the download was authorized would have removed the check that catches a corrupted
transfer or a mismatched pairing.

Keep the local-file installation path for development and offline recovery.

## Tomodachi — the weekly send

`src/activation/tomodachi.ts`. The producer **drops** a finished packet into the telemetry
outbox and AGERU picks it up. A directory rather than a function call, and now a repository
boundary as well: the producer lives in `ronin-services` and cannot be imported from here at
all. Services must also not carry its own egress door — the house has two, and AGERU is the
one that leaves.

The sweep is **hourly, not weekly** — the producer decides when a packet exists, and an
hourly sweep of an outbox that is usually empty is what lets a missed week catch up after a
machine was off. A weekly timer on a laptop that was closed that day simply never fires.

**A packet leaves the outbox only when a receipt is in hand.** A timeout says nothing about
whether HQ stored it, so the only safe move is to resend the identical bytes — which is safe
because the packet id is derived from (install, week), so HQ returns the receipt it already
issued instead of storing a duplicate.

A closed, non-retryable refusal moves the file aside rather than retrying it forever.

## The egress record

Append-only JSON lines: the fact of each call, its host, path, status, outcome and duration.
**No token, no address, no body.** An owner asking "what has this thing sent?" gets a complete
answer; anyone reading the same file gets nothing to present.

**Failures are recorded too.** A record that only logs successes hides exactly the calls
someone would want to ask about.
