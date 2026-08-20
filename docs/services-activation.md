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

**This is core, not a service, and KYOKAI enforces it.** `src/services/` is the paid layer
that leaves with its side at the split. Activation is the door a *free* install uses to ask
for the paid one, so it cannot live behind that door — free Cowork must be able to request
Services without Services being present.

## The house still has two egress doors

`src/settei.ts` states the law: the house has exactly two doors — AGERU, and the model
provider. **Activation does not add a third.**

Activation and Tomodachi are two different *contracts* and two different *consent events*, but
they share one client: one allowlist, one TLS and timeout policy, one redaction rule, one
request-id convention, one egress record. That is why `transport.ts` exists rather than each
caller reaching for `fetch` — a second call site is a second door nobody voted for.

The client refuses plaintext, refuses any host but the allowlisted one, and refuses to follow
a redirect off it.

> This supersedes the 2026-08-17 ruling that the entitlement id would be pasted by hand from
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

## The browser API — local only, no secret crosses it

```text
GET    /api/services/activation           state + entitled + the egress record
POST   /api/services/activation           the consent action
POST   /api/services/activation/poll      resume
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

The operator polls because it owns the secret. **Poll briefly while setup or Configuration is
visibly waiting, then back off.** On operator start or page open, make one natural resume
check. **Do not add an immortal polling daemon.**

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

After a successful claim, installation goes through the updater that **already exists** —
`POST /api/update/run { package: "services" }`, which runs fetch → verify → contract check →
store → place → restart.

**The entitlement authorizes the fetch; it does not certify the artifact.** The updater still
verifies the checksum and the Cowork/Services contract. An updater that stopped checking
because the download was authorized would have removed the check that catches a corrupted
transfer or a mismatched pairing.

Keep the local-file installation path for development and offline recovery.

## The egress record

Append-only JSON lines: the fact of each call, its host, path, status, outcome and duration.
**No token, no address, no body.** An owner asking "what has this thing sent?" gets a complete
answer; anyone reading the same file gets nothing to present.

**Failures are recorded too.** A record that only logs successes hides exactly the calls
someone would want to ask about.
