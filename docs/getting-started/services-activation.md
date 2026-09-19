# Ronin Services

Ronin Services adds optional capabilities to Cowork. You can use base Ronin without it.
A capability listed in the source is not necessarily installed or running on your machine.

## Install and switch on

Open **Ronin Services** in [Ronin Setup](setup-workbench.md). The page shows separate facts:

| Control | Meaning |
|---|---|
| Register | Establish the identity used for Services entitlement; read the disclosure before sending |
| Install | Download and install the Services package when the hosted install is available to this identity |
| Turn on / Turn off | Choose whether Services is enabled; this does not remove the installed files |
| Restart, when shown | Apply a change that requires the Ronin operator to restart |

Follow the next action shown. If confirmation is pending, open the email on any device and
return to **Check status**. Use Register to resend or correct the address. If installation
fails after confirmation, retry installation; you do not need to request another identity.

Registration comes first: Ronin Services cannot be installed without it. Installing and
switching on are the steps after. Once a feature is installed and switched on it works —
nothing asks for the registration credential a second time. Task manager, Usage stats and
Machine status are on unless you switch them off; the rest start off. Choosing
**No communication** changes communication preferences, not entitlement.

The operator restart is separate from your Agent terminal sessions. After a restart, check
the displayed Services state instead of assuming the switch alone proves a feature loaded.
Readable recording and local weights are currently parked; do not rely on the package
alone to provide readable transcripts or an active local model service.

## What is sent

Registration sends the information disclosed by the form to Ronin HQ. Credentials used
for Services stay on the machine's server side; they are not returned to the browser.

Registered Stats collects aggregate Ronin tool-use counts. It does not submit your code,
prompts, filenames, messages, or conversation text. See the [Stats guide](https://github.com/ronincowork/ronin-services/blob/dev/docs/stats.md)
for what is counted, when it is collected, and its limits.

## Check connections and recover

The Services connection record shows Ronin HQ requests, including failed attempts, with
host, path, status, and timing. It omits request bodies, addresses, and tokens. This is
not a record of your provider CLI's traffic or every network connection on the machine.

| Situation | Next step |
|---|---|
| Confirmation has not arrived | Check the address; resend when the page allows it |
| Confirmation expired | Request a fresh link |
| HQ could not be reached | Use the displayed retry or Check status action; local Ronin remains usable |
| Install failed | Retry installation using the existing confirmed identity |
| Switch changed but feature is absent | Complete the indicated restart and check measured status |

Contributors: [activation construction](../architecture/services-activation.md) and the
[Services connector contract](https://github.com/ronincowork/ronin-services/blob/dev/connector-contract.md).
