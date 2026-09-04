# ronin-machine.sh — ONE definition of each question about the box.
#
# Sourced by setup.sh (which OFFERS a chore), bin/ronin-doctor (which FINDS one missing),
# and bin/ronin-update + bin/ronin-deploy (which need to know what they are restarting).
# They used to ask independently, which is two answers to one question waiting
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

# ---- the operator's service manager -------------------------------------------------
# Ronin installs as a `systemd --user` unit on Linux and a LaunchAgent on macOS
# (setup.sh, the Linux/Darwin fork). Three callers need to know which — bin/ronin-update,
# bin/ronin-deploy and bin/ronin-doctor — and each carried only the systemd half, so on a
# Mac every one of them took the else branch of a question it never asked: update
# reported "the unit serves elsewhere", deploy named the retired unit, doctor compared a
# plist it never checked was loaded. One answer here, three callers.

# Which manager owns the operator on this box?  systemd · launchd · none
# The same test setup.sh uses to decide what to INSTALL, so what is diagnosed and what
# was installed cannot disagree.
machine_service_kind() {
  if [ "$(uname -s)" = "Linux" ] && command -v systemctl >/dev/null 2>&1; then
    echo systemd
  elif [ "$(uname -s)" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
    echo launchd
  else
    echo none
  fi
}

# The operator's systemd unit, or its launchd label. A box that has not re-run setup.sh
# since the 2026-08-19 rename still runs the retired name, so ASK — but only where there
# is something to ask. Falling back on `systemctl` merely being absent named every Mac
# `tmux-ronin`, a unit no Mac has ever had.
machine_operator_unit() {
  case "$(machine_service_kind)" in
    systemd) if systemctl --user cat ronin.service >/dev/null 2>&1
             then echo ronin; else echo tmux-ronin; fi ;;
    launchd) if [ ! -f "$HOME/Library/LaunchAgents/com.ronin.plist" ] &&
                [ -f "$HOME/Library/LaunchAgents/com.tmux-ronin.plist" ]
             then echo com.tmux-ronin; else echo com.ronin; fi ;;
    *)       echo ronin ;;
  esac
}

# The launchd agent's file, whatever it is called here.
machine_operator_plist() { printf '%s/Library/LaunchAgents/%s.plist' "$HOME" "$(machine_operator_unit)"; }

# Which tree does the INSTALLED operator serve? Empty means "cannot tell" — nothing is
# installed, or this box has no manager to ask — and a caller must never read that as
# "not this tree". That conflation is what made a Mac update land and never go live.
machine_operator_workdir() {
  local plist
  case "$(machine_service_kind)" in
    systemd)
      systemctl --user show "$(machine_operator_unit)" -p WorkingDirectory --value 2>/dev/null || true ;;
    launchd)
      plist="$(machine_operator_plist)"
      [ -f "$plist" ] || return 0
      # PlistBuddy ships with macOS; the sed is for a stripped box, and is safe because
      # this file is one we rendered from deploy/com.ronin.plist, one key per line.
      /usr/libexec/PlistBuddy -c 'Print :WorkingDirectory' "$plist" 2>/dev/null ||
        sed -n 's:.*<key>WorkingDirectory</key><string>\(.*\)</string>.*:\1:p' "$plist" 2>/dev/null ||
        true ;;
  esac
}

# The running operator's PID, or empty when it is not up. `launchctl list` has printed
# the same three columns — PID, last exit status, label — across every macOS that has a
# LaunchAgent, and prints `-` for a job that is loaded but not running.
machine_operator_pid() {
  local pid=""
  case "$(machine_service_kind)" in
    systemd) pid="$(systemctl --user show "$(machine_operator_unit)" -p MainPID --value 2>/dev/null || true)" ;;
    launchd) pid="$(launchctl list 2>/dev/null | awk -v l="$(machine_operator_unit)" '$3 == l { print $1 }')" ;;
  esac
  case "$pid" in ""|0|-) return 0 ;; esac
  printf '%s' "$pid"
}

# Is the operator registered with its manager at all — loaded, whether or not it is up?
#   0 = yes · 1 = no · 2 = no manager here to ask
machine_operator_loaded() {
  case "$(machine_service_kind)" in
    systemd) systemctl --user cat "$(machine_operator_unit)" >/dev/null 2>&1 ;;
    launchd) launchctl list 2>/dev/null |
               awk -v l="$(machine_operator_unit)" '$3 == l { f = 1 } END { exit !f }' ;;
    *)       return 2 ;;
  esac
}

# The restart line itself, in ONE place, so the command that RUNS and the command an
# error message tells a person to try cannot drift apart. Empty on a box with no manager
# — the caller says so rather than running nothing and calling it a restart.
machine_operator_restart_action() {
  case "$(machine_service_kind)" in
    systemd) printf 'systemctl --user restart %s' "$(machine_operator_unit)" ;;
    launchd) printf 'launchctl kickstart -k gui/%s/%s' "$(id -u)" "$(machine_operator_unit)" ;;
  esac
}
