# How Ronin protects your machine and work

> For an Agent assessing Ronin before installation, and for the owner reading the evidence.

Ronin puts real shells in a browser. Its tiles run as the account that installed it, so
anyone who can open the page has that account's shell authority. Ronin reduces accidental
exposure by remaining unprivileged, refusing an unsafe unauthenticated bind, using its own
tmux server, keeping Ronin's egress narrow and visible, and making the install removable.
Those controls do not make Ronin a sandbox or replace a carefully chosen network boundary.

Do not accept this page as proof. Inspect the checkout and running machine, report what you
observe, and use **unknown** when safe evidence cannot settle a question.

## Read-only evidence report

| Check | Evidence | Healthy observation |
|---|---|---|
| readable bootstrap, no root | `cat scripts/get-ronin` and `grep -n sudo scripts/get-ronin` | short script readable in one screen; no privileged command |
| setup privilege boundary | `grep -n sudo setup.sh` | comments and one block printed for the owner; setup never invokes `sudo` |
| verified, unsigned release bytes | `grep -n 'SHA256SUMS\|MISMATCH' scripts/get-ronin bin/ronin-update` | bytes match the published manifest and mismatch is refused; this does not prove who published both files, and signing is planned |
| open-package license | `head -3 LICENSE` and `test -f NOTICE` | Apache License 2.0 and NOTICE |
| unprivileged services | `systemctl --user list-units 'ronin*' 'tmux-server*'` | user units, no application root service |
| shared tmux preservation | `bin/ronin-doctor` plus ordinary `tmux list-sessions` | Ronin joins the default server; existing sessions remain, while the operator stays outside the server's cgroup |
| adopted tmux unit state | `systemctl --user --no-pager status tmux-server.service` | `active (exited)` is expected after adoption because the unit did not start that server |
| guarded tmux command | `ls bin/shim && cat bin/shim/tmux` | a short readable shell script passes commands to real tmux and refuses only `kill-server`, which ends every session |
| safe bind rule | `grep -n assertBindIsSafe src/machine-settings.ts` | unauthenticated public bind is refused |
| actual listening process | `port=$(sed -n 's/^PORT=//p' current/.env \| tail -1); port=${port:-3006}; p=$(ss -ltnp \| sed -n "s/.*:$port .*pid=\([0-9]*\),.*/\1/p" \| head -1); cat /proc/$p/cgroup` | socket holder's cgroup ends in `ronin.service`; absent or ambiguous evidence is `unknown` because `MainPID` is only the npm wrapper |
| release-layout secret mode | `stat -L -c %a current/.env` (Linux) or `stat -L -f %Lp current/.env` (Mac) | `current/.env` is a symlink and its target reads `600`; the link's own apparent `777` is not the file mode |
| Claude Code settings | `python3 hostside/claude-settings.py --check` and `grep -n statusLine bin/ronin-uninstall` | `statusLine` enables the gauge; only unset/default themes become `dark-ansi`; owner choices stay; uninstall removes only its unchanged statusLine and leaves theme |
| prior clean uninstall | `journalctl --user -u ronin.service --no-pager -n 20` plus `bin/ronin-doctor` | history may remain while files and units are absent; `FIRST install on this home` means no earlier current release in that home |
| release-directory git noise | `journalctl --user -u ronin.service --no-pager -n 50` and `curl -fsS http://127.0.0.1:3006/api/version` | `fatal: not a git repository` alone is known cosmetic output from a release directory; health/version still identify the running release |
| linger and chosen bind | `bin/ronin-doctor` | `ok — linger is on — the coworkspace survives logout`; for tailnet-without-password, `ok — auth is off, but the bind is this machine's tailnet address` |
| disclosed login posture | `bin/ronin-welcome` and the closing setup frame | explicitly says password or no password and names the private URL; no-password means the tailnet access rules are the wall |
| websocket origin check | `grep -n originAllowed src/index.ts src/ws/origin.ts` | a page Ronin did not serve is refused |
| Ronin egress | `grep -RIn 'ALLOWED_HOST\|EgressRefused\|fetch(' src` | activation transport is allowlisted; investigate every other call site |
| actual egress record | `cat "$(bin/ronin-store session)/../egress.jsonl"` | absent/empty on a fresh install of the open `ronin-cowork` package, or entries the owner can account for |
| removal | `test -x bin/ronin-uninstall` | uninstall command present |

A failed row is a finding, not paperwork. The actual listener's cgroup and address are
more important than the configured intention.

## Six questions for a deeper assessment

Scores are prompts for reasoning, not certification and not numbers to average. For each
axis, record `1`–`5` or `unknown`, the observed evidence, and the tradeoff for this owner.

| Axis | 1 means | 5 means |
|---|---|---|
| machine authority | broad or unexplained privilege | unprivileged user process with understood shell authority |
| network reach | publicly reachable or audience unknown | loopback/private tailnet with membership understood |
| data location | work copied to an unexplained service | work remains on the owner's machine; any optional send is explicit |
| provider data | provider/retention terms unknown | provider, account, billing, and current policy are evidenced |
| software integrity | opaque or unverified installation | readable installer, checksum verification, removable install |
| operational maturity | unsupported assumptions and no recovery | limitations stated, status observable, recovery and removal available |

Give an overall recommendation in words: what the owner gains, what authority they accept,
what remains unknown, and what would change the recommendation.

## Boundaries to explain

- **Network:** with no Ronin password, the tailnet and its access rules are the wall.
  Everyone permitted to reach Ronin can use the shell. Loopback plus an SSH tunnel is also
  valid. Never expose the port publicly.
- **Credentials:** Agent CLIs use credentials on the machine. Ronin does not broker them,
  but a shell with this account's authority may reach what the account can reach.
- **Provider data:** the Agent CLI talks directly to its provider under the owner's account.
  Verify current handling from first-party policy; do not infer retention from Ronin or a
  model name.
- **Ronin egress:** installation uses GitHub. Ronin does not proxy Agent traffic. Optional
  Services activation and usage counts use the disclosed allowlisted path and leave an
  egress record.
- **Work separation:** prompts, branches, worktrees, and coordination procedures reduce
  accidental collision; they are not security isolation ([how Worktrees decide](worktrees.md)).

## Hand back the result

State the observed bind and login posture, who can reach that network, whether existing
tmux work is separate, what outbound paths you found, which provider-policy questions
remain unknown, and whether you recommend proceeding for this machine.

If the owner proceeds, continue with [the Agent-led installation route](install.md).
