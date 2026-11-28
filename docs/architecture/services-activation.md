# Services activation construction

For contributors. [Ronin Services](../getting-started/services-activation.md) owns the
usage route. Cowork owns the office record and the HQ transport.

## Boundaries and ownership

| Owner | Responsibility |
|---|---|
| `src/activation/transport.ts` | Shared allowlisted HTTPS transport to Ronin HQ |
| `src/activation/egress.ts` | Request metadata and outcomes, without tokens, addresses, or bodies |
| `src/activation/secrets.ts` | The hosted office's entitlement and house tokens, written by the provisioner; Cowork reads them, and Services' account part sends the entitlement to Ronin HQ |
| `src/routes/services-activation-api.ts` | Feedback to Ronin HQ |
| `src/update-run.ts` | Shared updater launcher, through `systemd-run` or the spawn broker |

The remote wire contract belongs to Ronin HQ (Shiwake). Services part discovery and
registration belong to the [Services connector contract](https://github.com/ronincowork/ronin-services/blob/dev/connector-contract.md).
Do not create a second activation aggregate in Services or in machine-settings projections.

## Self-hosted and hosted

Hosted is a fact, not an inference. An office_unit carries an office record
(`office_record.json` in the `office_unit` store: `office_id`, `office_park`, `gateway_office`,
`provisioned_at`), written once by the provisioner together with the office's two credentials
beside it in the same store (`entitlement_token` for Ronin HQ, `house_token` for the model
gateway; directory 0700, files 0600). The house token is on disk once: the Hermes connection to
the record's `gateway_office` reads it there and writes it into each birth's own Hermes home.

**Each house call says whose Agent made it** (KAN-621). On that connection the birth's Hermes
config also carries one header, `X-Ronin-Person: <email, lower-case>`: the person the Agent works
for, its birth receipt's `user_email` (the signed-in launcher, or for an Agent made by an Agent,
that Agent's person). gateway_office reads it so HQ can book the spend to the person. It is a
self-declared label, not proof: it sits in a file the Agent can edit, like the house token beside
it. No person (Mika's own launch, Ronin's Agents, Irasshai always) means no header: the call is the
office's and is never refused for it. A personal key's calls never carry it.
Self-hosted has no record and holds nothing HQ-related. `readOfficeRecord()` is the only reader;
a present file that does not read is `unreadable`, a provisioning fault, never self-hosted.

What asks it: the Services account part (no record, no HQ call; `GET /api/account` answers
`not_hosted`; its `account` fact reads `lounge.json` beside the record, which the park writes from
HQ's row, and is rewritten when the park writes it: samurai_lab `ronin_cloud/SHIWAKE_DESIGN.md` §8), the Tomodachi sender in the account part (`account/tomodachi-send.ts`: sends from
an office_unit only, to HQ's `POST /v1/account/tool-counts`, setting aside packets from before
`provisioned_at`), the Hermes house-gateway seed (the record's `gateway_office`, else the
developer's local door), and the
machine reading (`observed.office`), which is how Agents see it. Self-hosted Settings shows the
Cloud Account card's two sections, Office and Account, which must agree on the `office_id`; a
disagreement is said.

**A hosted office shows no account settings** (owner, 13 Nov 2026; KAN-475). The server reads
the record once at start and the page says so in `<html data-hosted="on">` (`public/js/hosted.js`;
`unreadable` counts as hosted). The account, billing, office lease and office are kept in the
Business Lounge at Ronin HQ, so Cowork carries a link and no account code: Home's side stones gain
**Business Lounge** (opens `https://hq.roninhosted.com/` in a new tab, for everyone in the office;
each person lands in their own lounge), and after it a **Sign out** stone, opening in the same tab
(KAN-983, KAN-984): a plain GET to the office's own `/sign-out` (KAN-984), which the kohai serves behind the guard: it asks HQ to end
the person's WorkOS sessions, ends the office's cookie and lands on HQ's 'You are signed out' page (the contract is
the hosted side's, w1154; Cowork writes no sign-out code). **Signed out elsewhere** (KAN-988): when the
session ends, the sign-in guard answers a fetch with an HTML 401 or 403 (Cowork's own are JSON), and the
page reloads once (`public/js/request.js`) so the guard's navigation takes the person to sign-in; a closed
live connection makes one plain read first (`public/js/store.js`), so a refused reconnect does the same.
What is hidden when hosted: Home's Check for updates;
in Settings, the Cloud Account and Password cards; in the Machine card, Configuration, Release & update and Log out. Settings stays for
the Desk's own settings (Desk, Team and Agent defaults, Workspaces, Integrations, Jira, Feedback,
and the Machine card's themes, archives, messages, help desk, keypad, health and hotwords).
Without the record nothing changes.

## Runtime state

**Services ships with Cowork** (owner, 2026-11-26, KAN-914; [installations.md](installations.md)):
hosted offices have both now, and self-hosted becomes the same bundle later. There is no Services
install flow: no Services key from Ronin HQ, no download, no install stage, no Services card or
header badge, and no on/off.

`GET /api/installed` says what is on this machine: the Cowork release, and the Services parts on
disk, loaded, and parked (by their own `PARKED.md`) or failed. Every part present runs.
Credentials live in the resolved `services_secrets` user store (a hosted office's house token
beside its office record, in `office_unit`) and remain server-side.

## Outbound measurements

Services produces aggregate packets and sends them itself: the account part's sender
(ronin-services `account/tomodachi-send.ts`) posts through Cowork's HQ transport with the
entitlement, keeps receipts and retries, and sends only from an office_unit (the office record).
Cowork carries no sender and no daily drop any more (KAN-300). A packet remains pending until acknowledged; closed refusals are
retained separately rather than retried forever. The connection record covers this HQ
transport, not provider CLI traffic or all machine networking.

The current counting contract is documented in [Services Stats](https://github.com/ronincowork/ronin-services/blob/dev/docs/stats.md).
Collection cadence, active days, and submission cadence are distinct; a weekly schedule
must not be presented as proof of seven days of activity.

## Verification

Use the Services verification wrapper (`bin/verify`) for part registration and runtime
placement. A passing test proves its fixture, not a deployment to the live operator.
