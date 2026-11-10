# Services activation construction

For contributors. [Ronin Services](../getting-started/services-activation.md) owns the
usage route. Cowork owns activation because a base installation must be able to obtain
Services before any optional part is loaded.

## Boundaries and ownership

| Owner | Responsibility |
|---|---|
| `src/activation/transport.ts` | Shared allowlisted HTTPS transport to Ronin HQ |
| `src/activation/egress.ts` | Request metadata and outcomes, without tokens, addresses, or bodies |
| `src/activation/state.ts` | Durable activation stage and public entitlement identity |
| `src/activation/secrets.ts` | Protected entitlement credential, when a machine holds one |
| `src/routes/services-activation-api.ts` | Registration, install start and install watch |
| `public/js/services-setup-state.js` | Derive the Setup actions from measured registration, installation, and activation facts |
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
Self-hosted has no record and holds nothing HQ-related. `readOfficeRecord()` is the only reader;
a present file that does not read is `unreadable`, a provisioning fault, never self-hosted.

What asks it: the Services account part (no record, no HQ call; `GET /api/account` answers
`not_hosted`), the Tomodachi sender in the account part (`account/tomodachi-send.ts`: sends from
an office_unit only, to HQ's `POST /v1/account/tool-counts`, setting aside packets from before
`provisioned_at`), the Hermes house-gateway seed (the record's `gateway_office`, else the
developer's local door), the Setup posture (an office_unit hides Register and Install; a missing
install there is said as a fault) and the
machine reading (`observed.office`), which is how Agents see it. Settings shows the two
sections, Office and Account, which must agree on the `office_id`; a disagreement is said.

## Registration and runtime state

`/api/setup/registration` owns the registration surface. There is no email confirmation:
submitting the form completes registration and starts the Services install. Registration
needs no entitlement, and none is minted. `/api/services/activation` exposes the install
state and connection record. The browser never receives a credential. Public entitlement IDs
identify an entitlement; they cannot authorize a request.

`GET /api/installed` separates parts on disk, loaded/parked/failed parts, selected Services
capabilities, and restart-needed state. `servicesSetupModel` renders Register, Install,
Switch on/off, and the conditional Restart action from those facts. A successful registration
is not proof of installation, and a saved switch is not proof of a loaded part.

The durable stages are not requested, installing, installed, and error. A stored record
from the retired email loop reads as not requested, so Install is offered again; its
entitlement identifier and token file are left as they are.

## Installation and recovery

The existing updater checks release integrity and the Cowork/Services connector version.
A registration Submit and `POST /api/services/install` both start that updater; neither
needs an entitlement. A machine that holds an entitlement fetches through the HQ release
grant. Without one the updater stops and says so: register with Ronin HQ and paste the Services
key. There is no anonymous feed (the release repo is private); a tarball already on disk installs
with `bin/ronin-update --services --file`.

Starting is not installing. One start runs at a time, so concurrent presses launch one
updater. The answer says only whether the updater was launched. The run
writes its output and exit code beside the activation record, and the install watch turns a
failed run into an error carrying the updater's reason. Installation completion needs
runtime evidence (the loaded roster), not a downloaded artifact or a token. An install
failure keeps any entitlement for retry. Restarting the operator does not restart
the separate tmux server. Credentials live in the resolved `services_secrets` user store
(a hosted office's entitlement beside its office record, in `office_unit`) and remain server-side.

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

`tests/office-record.test.ts` checks the three readings of the office record;
`tests/services-activation.test.ts` checks the local state with isolated dependencies;
`tests/self-hosted-install.test.ts` drives Submit → install start and failure reporting with
a fake launcher.
`tests/integration/two-leg.test.ts` is the explicit cross-system diagnostic; it is not an
ordinary unit-test gate. Use the Services verification wrapper for part registration and
runtime placement. A passing test proves its fixture, not a deployment to the live operator.
