# ronin-machine.sh — ONE definition of each question about the box.
#
# Sourced by setup.sh (which OFFERS a chore) and bin/ronin-doctor (which FINDS one
# missing). Both used to ask independently, which is two answers to one question waiting
# to disagree — the defect OPEN_THREADS 4.36 names, and the same one that had four
# opinions about where a browser lives. `ronin_served_url` in ronin-banner.sh already
# works this way for the tailnet door; this is the rest of the set.
#
# PURE PREDICATES, NO OUTPUT. Nothing here prints, exits, or changes the machine — each
# function answers and returns. The caller decides whether an answer is an offer, a
# finding, or nothing at all, because that judgement differs between the two: absence of
# swap is a finding for doctor and an offer for setup, and absence of a tailnet door is
# neither.
#
# NOTHING HERE RUNS `sudo`. These say what is true; a person runs what is needed.

# Are we inside a container, where swap is the host's business and /etc/fstab is not
# ours to write?
machine_is_container() {
  if command -v systemd-detect-virt >/dev/null 2>&1 && systemd-detect-virt --container --quiet; then return 0; fi
  [ -f /.dockerenv ]
}

# Does this box have swap at all? Non-Linux has no /proc/swaps — "cannot tell" is
# deliberately NOT the same as "none", so callers must handle 2.
#   0 = has swap · 1 = has none · 2 = cannot tell here
machine_has_swap() {
  [ -r /proc/swaps ] || return 2
  [ "$(awk 'NR>1' /proc/swaps | wc -l)" -gt 0 ]
}

# Total swap, human, for a caller that wants to say the number.
machine_swap_total() {
  awk '/^SwapTotal:/ {printf "%.1f GB", $2/1048576; exit}' /proc/meminfo 2>/dev/null
}

# Is a swapfile a sane thing to OFFER here? Every condition, because a wrong offer is
# worse than no offer: genuinely absent, not a container, a filesystem `fallocate` suits,
# room to spare, and nothing already at the path.
machine_swap_offerable() {
  # if-form, not a bare call: a bare `machine_has_swap` returning non-zero would trip a
  # caller running under `set -e` (setup.sh does). Inside a condition, set -e is off.
  if machine_has_swap; then return 1; else [ $? -eq 2 ] && return 1; fi
  machine_is_container && return 1
  [ -e /swapfile ] && return 1
  case "$(findmnt -no FSTYPE / 2>/dev/null || echo unknown)" in ext4|xfs) ;; *) return 1 ;; esac
  free_g="$(df -BG --output=avail / 2>/dev/null | tail -1 | tr -dc '0-9')"
  [ -n "$free_g" ] && [ "$free_g" -ge 9 ]
}

# The swapfile line itself, in ONE place. Both the offer and the remedy quote this, so
# they cannot drift into two slightly different commands.
machine_swap_action() {
  printf '%s' 'fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab'
}

# Does the user manager stay up after logout? Without it every --user service stops.
#   0 = on · 1 = off · 2 = cannot tell (no loginctl — macOS, or a non-systemd box)
machine_linger_on() {
  command -v loginctl >/dev/null 2>&1 || return 2
  [ "$(loginctl show-user "${USER:-$(id -un)}" --property=Linger --value 2>/dev/null || echo no)" = "yes" ]
}

machine_linger_action() { printf 'loginctl enable-linger %s' "${USER:-$(id -un)}"; }

# Can anything here read the kernel log — the only way to say what was killed and when?
#   0 = yes · 1 = no · 2 = no kernel log interface at all
machine_kernel_log_readable() {
  if [ ! -e /proc/sys/kernel/dmesg_restrict ] && ! command -v journalctl >/dev/null 2>&1; then return 2; fi
  if command -v journalctl >/dev/null 2>&1 &&
     journalctl -k -n 1 --no-pager 2>/dev/null | grep -qv 'No entries'; then return 0; fi
  [ "$(cat /proc/sys/kernel/dmesg_restrict 2>/dev/null || echo 0)" = "0" ] && dmesg >/dev/null 2>&1
}

machine_kernel_log_action() { printf 'usermod -aG adm %s' "${USER:-$(id -un)}"; }
