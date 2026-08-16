# 05 · CHRISTMAS MORNING 2 — Rogue on the VM to a live Ronin URL

> SOP for `rogue_2`: Claude or Codex running on the new VM. Finish when both Ronin
> layers are installed, the coworkspace opens over the tailnet URL, and the first
> `ronin_agent` has received the handoff.

## Objective

```text
join VM to the owner's tailnet
  -> install ronin-cowork
  -> install ronin-services
  -> start Ronin
  -> return the URL
  -> launch and hand off to the first ronin_agent
```

## 1. Read the VM and preserve evidence

Record `whoami`, `hostname`, `uname -a`, available Claude/Codex, tmux sessions and the
working directory in the receipt copied from `07_HANDOFF.md` (see `06_ROGUE_AGENT.md`
§5). This is a fresh VM, but observe rather than assume it is empty.

## 2. Join the VM to Tailscale

Use Tailscale's maintained first-party installation instructions for this OS. The_owner
authorizes the VM into the same tailnet as their personal computer.

Prove:

- Tailscale is running on the VM;
- the VM has a tailnet address and name;
- the personal computer can reach that name/address;
- the provider console and public SSH still work as recovery until the full path is
  accepted.

Do not expose Ronin's port publicly.

## 3. Install ronin-cowork

Use the released install flow, not a checkout as the permanent operator. A small bootstrap
checkout supplies the updater:

```bash
git clone https://github.com/ronincowork/ronin-cowork.git
cd ronin-cowork
bin/ronin-update --home <install-home>
(cd <install-home>/current && ./setup.sh)
```

The_owner approves the install-home location; do not guess or hard-code their home tree.
If the bootstrap checkout already exists, do not overwrite it or discard changes. Resolve
missing tmux or stable Node prerequisites when the installer names them. Keep every
warning and next-step line for the handoff.

This step becomes publicly executable when the cowork release machinery is on `master`
and a compatible release tag exists.

## 4. Install ronin-services

From the installed cowork release:

```bash
<install-home>/current/bin/ronin-update --services
```

The updater downloads the services artifact, verifies `SHA256SUMS`, refuses a connector
contract mismatch, stores the release under the install home, places each service into the
serving tree, restarts only the cowork operator and gates the live page. The same flow is
available through the coworkspace's ⚙ System button once the page is open.

The installer is built and proven on cowork `dev`. Three release preconditions remain
before this command works on a stranger's VM:

1. merge the updater/services-button work from cowork `dev` to `master`;
2. tag compatible cowork and services releases (there is currently no release artifact
   for the updater to fetch);
3. create the public assets-only services release feed and point the updater at it. Until
   then the feed is the private `ronin-services` repo and requires authenticated `gh`
   access.

Do not replace this flow with a services-repo clone or a hand-copy.

## 5. Start Ronin on the tailnet

Run the cowork setup's printed Tailscale Serve command to establish tailnet-only HTTPS.
Then run:

```bash
bin/ronin-byoin
tailscale serve status
```

Resolve blocking install/operator findings. Preserve every honest SKIP. Read the final
HTTPS URL from live Tailscale status; never construct or guess it.

Ask the owner to open that URL from the personal computer. The URL is not proved until the
coworkspace renders there.

## 6. Hand off to Ronin

Create the first receiving session, start the available Claude or Codex as a
`ronin_agent`, and deliver:

- the filled receipt (`.atarashi-handoff.md`, copied from `07_HANDOFF.md`);
- `ronin/00_RONIN_AGENT.md`;
- the proved coworkspace URL;
- every unresolved BYOIN finding or SKIP.

The receiving-session mechanism must reuse Ronin's tested prompt-readiness handshake; it
is still a build item in this packet.

Stop at the `ronin_agent`'s acknowledgement. Do not continue the same setup concurrently
from the Rogue seat.

## Exit

- personal computer and VM are on the same tailnet;
- ronin-cowork is installed and its operator is serving;
- compatible ronin-services is installed;
- the owner opened the reported tailnet HTTPS URL;
- the first `ronin_agent` accepted the receipt and remaining work.
