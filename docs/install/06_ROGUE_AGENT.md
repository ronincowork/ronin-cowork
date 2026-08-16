# 06 · ROGUE AGENT — install the release, create the receiving seat, stop

> SOP for Claude or Codex running directly on the box, outside Ronin. Do not perform
> the full setup procedure. Your finish line is an acknowledged handoff to the first
> agent in a Ronin-owned session.

## Objective

Install the released `ronin-cowork` and the compatible services layer, do only the
prerequisite work the installer names, create a receiving session, start the same
available CLI in it, and deliver `07_HANDOFF.md` plus `ronin/00_RONIN_AGENT.md`.

Preserve the box. Never end an existing tmux session or restart an existing tmux server.
Ask the owner before a privileged, destructive or credential-bearing act.

## 1. Record the entrance

Run and retain the output for the handoff:

```bash
whoami
pwd
uname -a
command -v claude || true
command -v codex || true
command -v git || true
command -v tmux || true
command -v node || true
tmux list-sessions 2>&1 || true
```

Do not diagnose the whole box. These facts identify the account, available CLI and
whether tmux work already exists.

## 2. Obtain the release

Ronin runs as an installed, versioned release — never as a checkout serving directly. A
small bootstrap checkout supplies the updater:

```bash
git clone https://github.com/ronincowork/ronin-cowork.git
cd ronin-cowork
```

If a checkout already exists, enter it and record its path and commit; do not discard
local changes or replace it.

Ask the owner to approve an install home (a directory the releases will live under —
do not guess or hard-code a location in their home tree), then:

```bash
bin/ronin-update --home <install-home>
```

The updater fetches the latest release, verifies its checksum, unpacks it under
`<install-home>/releases/`, and points `<install-home>/current` at it.

## 3. Reach the installer threshold and set up

`setup.sh` requires tmux and Node. If either is absent, tell the owner exactly which one
is missing and propose the ordinary installation for this OS. Perform privileged package
installation only with their approval. Then, from the installed release:

```bash
cd <install-home>/current && ./setup.sh
```

Record the complete result and every next-step line it prints. Do not turn a warning or
SKIP into a pass. Do not restart `tmux-server.service`.

## 4. Add the services layer

From the installed release:

```bash
<install-home>/current/bin/ronin-update --services
```

The updater downloads the services artifact, verifies `SHA256SUMS`, refuses a connector
contract mismatch, stores the release under the install home, places each service into
the serving tree, restarts only the cowork operator and gates the live page. The same
flow is available later through the coworkspace's ⚙ System button.

Do not replace this flow with a services-repo clone or a hand-copy.

## 5. Write the receipt

Copy the handoff template from the bootstrap checkout to a new untracked file in the
install home named `.atarashi-handoff.md`. Fill every field from observed output. Put
anything not proved under `Unverified`; do not infer it.

```bash
cp docs/install/07_HANDOFF.md <install-home>/.atarashi-handoff.md
```

Run the copy from the bootstrap checkout; never edit the tracked template with
machine-specific facts.

## 6. Create the receiving session

Create the receiving session as follows:

1. Choose the CLI already authenticated in this account (`claude` or `codex`).
2. Create a detached tmux session named `atarashi` in `<install-home>/current`.
3. Start that CLI in the session.
4. Wait for its ready prompt; never answer a login or trust dialog for the owner.
5. Send one opening instruction telling it to read `<install-home>/.atarashi-handoff.md`
   and the installed `docs/install/ronin/00_RONIN_AGENT.md`, acknowledge takeover, and
   complete the setup.

## 7. Stop at acknowledgement

The receiving agent must state that it read the receipt, identify any immediate blocker,
and accept ownership of `ronin/00_RONIN_AGENT.md`.

After that acknowledgement:

- report the receiving session name to the owner;
- remain available only as the recovery terminal;
- do not continue installation in parallel;
- do not edit or reinterpret the receiving agent's plan.

Your job is complete.
