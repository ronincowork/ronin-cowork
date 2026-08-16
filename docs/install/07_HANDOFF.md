# 07 · ATARASHI HANDOFF — Rogue to Ronin

> Copy and fill this receipt. Facts only. The receiving agent re-measures anything that
> matters before changing it.

## Entrance

- **box:** laptop / server / VM / undetermined
- **access used:** local terminal / SSH / provider console / other
- **VM public address, if used:**
- **SSH key installed at provisioning:** yes / no / unknown (never include the private key)
- **account (`whoami`):**
- **starting directory (`pwd`):**
- **OS (`uname -a`):**
- **recovery terminal:** provider console, SSH command, or other way the owner can return

## Bootstrap agent

- **CLI:** Claude / Codex
- **executable path:**
- **authentication:** proved by accepting a prompt / not proved

## Bootstrap checkout (supplies the updater; never the operator)

- **directory:**
- **remote:**
- **commit:**
- **pre-existing checkout:** yes / no
- **pre-existing changes (`git status --short`):**

## The install

- **install home:**
- **cowork release (`cat <install-home>/current/VERSION`):**
- **services release (`cat <install-home>/services/VERSION`):** installed / not installed
- **contract check result:**

## Existing tmux work before setup

Paste the exact `tmux list-sessions` result, including “no server running”:

```text

```

## Completed acts

List commands or changes known to have occurred. Include the exit result of `./setup.sh`.

-

## Observed facts

List the command beside each answer. Do not write “installed” without the observation.

-

## Warnings and failures

Copy them exactly enough that the receiving agent can find the cause.

-

## Unverified

Anything not proved belongs here. At minimum consider:

- service and ronin_operator health;
- tmux server ownership and restart survival;
- browser reach and canonical URL;
- Tailscale or other network route;
- BYOIN findings;
- Claude/Codex launch-table cells;
- inclusion_list and project_roots;
- optional ronin_services.

## Receiving seat

- **session name:** `atarashi`
- **CLI launched:**
- **working directory:**
- **Ronin agent SOP path:**
- **takeover acknowledged:** yes / no
