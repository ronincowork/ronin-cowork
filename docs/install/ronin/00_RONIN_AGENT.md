# 00 · RONIN AGENT — complete ATARASHI

> Draft SOP for the first agent in the receiving Ronin session. The Rogue agent installed
> and launched Ronin; you own verification, completion and the handoff to the owner.

## Start

1. Read `.atarashi-handoff.md` (in the install home) completely.
2. Read the shipped `KOTOBA.md` and `docs/SHELVES.md` in the installed cowork tree
   (`<install-home>/current`).
3. Acknowledge takeover in one short message: name the box/account, what the Rogue proved,
   the first unverified fact you will check, and any owner action needed immediately.
4. Treat the receipt as evidence, not truth. Re-run any check before relying on it.

Do not ask the Rogue agent to keep installing in parallel. It is the recovery seat now.

## Objective

Return a working Ronin to the owner:

- the ronin_install is complete and matches the receipt;
- the ronin_operator is healthy;
- existing work was preserved;
- the owner can open the coworkspace from the intended device;
- a normal session_launch works;
- restarting the cowork application does not end sessions;
- the owner has the canonical URL and recovery path.

## 1. Inspect before changing

Measure the live box and compare it with the receipt:

```bash
cat <install-home>/current/VERSION
cat <install-home>/services/VERSION 2>/dev/null || echo "no services store"
command -v tmux node npm
node --version
tmux list-sessions 2>&1 || true
systemctl --user status tmux-server tmux-ronin 2>&1 || true
```

The install carries no git — its identity is the `VERSION` file, and the running
operator answers the same string on `/api/version`. The bootstrap checkout (if the
receipt names one) is where `git status --short` and `git rev-parse HEAD` apply.

Use the platform-appropriate service check on macOS. Find occupied ports and any existing
Ronin process before starting another one. Preserve unrelated local changes.

If live tmux sessions predate this install, read `docs/tmux-server-cgroup.md` before any
service repair. Never stop or restart the tmux-server unit while sessions exist.

## 2. Finish the ronin_install

Review the Rogue's `./setup.sh` result. If it failed, fix the named prerequisite or install
fault and rerun it. If it passed, verify rather than assuming its process is the one now
serving.

On Linux, arrange login lingering with the owner if they want Ronin to survive logout:

```bash
sudo loginctl enable-linger "$USER"
```

This is an owner-visible privileged act. Explain it before asking for approval.

## 3. Run BYOIN

```bash
bin/ronin-byoin
```

Resolve every blocking finding. A SKIP is neither failure nor proof; state what was not
checked. Do not install contributor-only host tools merely to make a first install look
green unless the relevant shipped procedure requires them.

## 4. Establish reach

Ask the owner where they intend to open the coworkspace: this laptop, another device on a
LAN, a tailnet device, or another private route.

Use the simplest suitable route. Tailscale is recommended for private remote reach and
HTTPS, but it is not mandatory. Never expose a live terminal publicly merely to finish
onboarding.

`setup.sh` prints the current HTTP URL and the suggested Tailscale Serve command. When
Tailscale is chosen, configure it with the owner and verify the final URL from their actual
client device. HTTPS is required for microphone access.

On a fresh VM that still has only public SSH, do not expose port 3006 publicly. Use the
bootstrap SSH connection as a temporary private tunnel:

```bash
ssh -L 3006:127.0.0.1:3006 <account>@<vm-address>
```

With Ronin bound to loopback, the owner opens `http://127.0.0.1:3006` on their own
computer and the SSH client carries it to the VM. This is enough to prove the coworkspace
before Tailscale exists. If Tailscale is then chosen, join the VM and client device to the
same tailnet, prove the tailnet URL, and only then retire public SSH as the ordinary route.

## 5. Prove the operator without risking sessions

Confirm the owner can open the coworkspace and see the receiving session in the
session_roster. Then create a disposable `OpenShell` session through `session_launch`.

Restart only the cowork application using the shipped deployment/restart path. Confirm
both the receiving session and `OpenShell` remain in the roster afterward. If either
vanishes, stop: tmux server ownership is wrong.

Do not restart `tmux-server.service` as a test.

## 6. Establish ordinary launching

Check which `session_launch_specs` the shipped launch table offers and which underlying
CLIs are actually available and authenticated. Prove at least the provider/CLI the owner
intends to use by launching one real session through the coworkspace and confirming its
opening prompt was delivered exactly once.

Do not treat a catalog cell as proof that its command exists on this box.

## 7. Set the session safety boundary

Explain the machine's concurrency budget to the owner before setting `sessions.max` in
the ⌂ Roster:

- use roughly 700 MB per live agent as the planning figure;
- the standard CX43 has 16 GB RAM;
- roughly 20 concurrent agents already consume about 14 GB, leaving limited room for the
  OS, Ronin, Node, tmux and services;
- approaching 30 agents is outside the safe intent of this standard box;
- memory exhaustion lets the kernel OOM killer choose an existing process to end.

Recommend a boundary around the intended roughly-20-agent workload, but let the owner set
the number. Ronin's design deliberately does not derive it from RAM. Confirm the saved
value is visible in the roster and that a launch beyond it is refused rather than evicting
an existing session.

## 8. Establish the inclusion_list

Ask which existing directories the owner wants Ronin to work in. Offer them as
project_roots; never move, rename or automatically include a directory. On an empty VM,
clone only project_repos the owner names and for which they provide access.

An empty inclusion_list is valid. State it rather than filling it speculatively.

## 9. Return Ronin to the owner

Report:

- canonical coworkspace URL;
- access route and which device proved it;
- BYOIN verdict and every remaining SKIP;
- restart-survival result;
- proved session_launch_specs;
- owner-set session max and the capacity rationale given;
- included project_roots, or that the list is empty;
- receiving/recovery session names;
- smallest recovery command or access route.

Ask before removing `.atarashi-handoff.md` or ending the Rogue recovery terminal. The
bootstrap is complete when the owner accepts this receipt.
