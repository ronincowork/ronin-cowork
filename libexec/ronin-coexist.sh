#!/bin/sh
# Shared install/uninstall primitives for living beside an existing tmux server.
# Design: ronin-lab wip/buildouts/TMUX_COEXISTENCE.md. Errors go to stderr; what the
# person must hear goes through ronin_say, which the caller may redirect.

ronin_say() { printf '%s\n' "$*"; }

# Every tmux command goes through this. $TMUX outranks TMUX_TMPDIR in tmux's own client, so
# from inside a tile a rig that set a private TMUX_TMPDIR still reached the live server and
# killed it (records/TMUX_KILL_20260904.md, the third time). Ronin's server is the default
# socket, or the one TMUX_TMPDIR names: the same rule the runtime attach and the test
# runner follow. A pane's own $TMUX is never the address of anything this file does.
ronin_tmux() { env -u TMUX -u TMUX_PANE "$TMUX_BIN" "$@"; }

ronin_pid_alive() { # pid, start identity — is the recorded process still that process?
  [ -n "$1" ] && [ -n "$2" ] && [ "$(ronin_tmux_start_id "$1")" = "$2" ]
}

ronin_unit_owned() { # file, kind
  file=$1 kind=$2
  [ ! -e "$file" ] && return 0
  [ -L "$file" ] && return 1
  [ -f "$file" ] || return 1
  grep -q '^# X-Ronin-Unit: ronin-cowork/v1$' "$file" 2>/dev/null && return 0
  case "$kind" in
    ronin) grep -q '^Description=Ronin — browser grid of tmux sessions$' "$file" 2>/dev/null &&
      grep -Eq '^ExecStart=.*npm start$' "$file" 2>/dev/null ;;
    tmux-server) grep -q '^RefuseManualStop=yes$' "$file" 2>/dev/null &&
      grep -Eq '^ExecStart=.*tmux-server\.conf start-server$' "$file" 2>/dev/null ;;
    *) return 1 ;;
  esac
}

ronin_preflight_units() { # destination directory
  unit_dir=$1
  for kind in tmux-server ronin; do
    file="$unit_dir/$kind.service"
    if ! ronin_unit_owned "$file" "$kind"; then
      printf 'ERROR: %s already exists and is not a recognized Ronin unit; nothing was overwritten.\n' "$file" >&2
      return 1
    fi
  done
}

ronin_tmux_start_id() { # pid
  pid=$1
  if [ -r "/proc/$pid/stat" ]; then
    sed 's/^.*) //' "/proc/$pid/stat" 2>/dev/null | awk '{print $20}'
  else
    ps -o lstart= -p "$pid" 2>/dev/null | sed 's/^[[:space:]]*//'
  fi
}

ronin_tmux_probe() {
  probe_err="${TMPDIR:-/tmp}/ronin-tmux-probe.$$"
  if ronin_tmux list-sessions >/dev/null 2>"$probe_err"; then
    rm -f "$probe_err"
    return 0
  fi
  probe_rc=$?
  probe_text=$(cat "$probe_err" 2>/dev/null || true)
  rm -f "$probe_err"
  case "$probe_rc:$probe_text" in
    1:*'No such file or directory)'|1:'no server running on '*) return 1 ;;
    *) printf 'ERROR: could not determine whether tmux is running: %s\n' "${probe_text:-exit $probe_rc}" >&2; return 2 ;;
  esac
}

ronin_adopt_tmux() { # state root
  state_root=$1
  if ronin_tmux_probe; then :; else
    probe_rc=$?
    [ "$probe_rc" -eq 1 ] && return 0
    return "$probe_rc"
  fi

  pid=$(ronin_tmux display-message -p '#{pid}' 2>/dev/null | tr -d '\r\n')
  socket=$(ronin_tmux display-message -p '#{socket_path}' 2>/dev/null | tr -d '\r\n')
  [ -n "$socket" ] || socket="${TMUX_TMPDIR:-${TMPDIR:-/tmp}/tmux-$(id -u)}/default"
  start=$(ronin_tmux_start_id "$pid")
  prior=$(ronin_tmux show-options -s -v exit-empty 2>/dev/null | tr -d '\r\n')
  server_version=$(ronin_tmux display-message -p '#{version}' 2>/dev/null | tr -d '\r\n')
  case "$pid:$prior" in [0-9]*:on|[0-9]*:off) ;; *)
    printf 'ERROR: live tmux server did not report a usable pid and exit-empty value.\n' >&2; return 2 ;;
  esac

  lease_dir="$state_root/machine"
  lease="$lease_dir/tmux-adoption"
  if [ -f "$lease" ]; then
    old_pid=$(sed -n 's/^pid=//p' "$lease")
    old_start=$(sed -n 's/^start=//p' "$lease")
    old_socket=$(sed -n 's/^socket=//p' "$lease")
    if [ "$old_pid" != "$pid" ] || [ "$old_start" != "$start" ] || [ "$old_socket" != "$socket" ]; then
      if ronin_pid_alive "$old_pid" "$old_start"; then
        # The recorded server still runs but is not the one on this socket: unknown, unchanged.
        printf 'ERROR: the tmux server recorded in %s (pid %s) is still running but is not the server on %s; leaving both alone. Review the lease before rerunning.\n' "$lease" "$old_pid" "$socket" >&2
        return 2
      fi
      # The adopted server is gone (a reboot, most often) and its setting died with it: the
      # old lease has nothing left to restore. The server now here is a new adoption.
      ronin_say "==> the tmux server recorded at adoption (pid $old_pid) no longer exists; recording the current one instead"
      rm -f "$lease"
    fi
  fi
  if [ ! -f "$lease" ]; then
    mkdir -p "$lease_dir"
    umask 077
    lease_tmp="$lease.tmp.$$"
    printf 'v=1\npid=%s\nstart=%s\nsocket=%s\nprior=%s\napplied=off\n' "$pid" "$start" "$socket" "$prior" > "$lease_tmp"
    mv "$lease_tmp" "$lease"
  fi
  ronin_tmux set-option -s exit-empty off
  client_version=$(ronin_tmux -V 2>/dev/null)
  ronin_say "==> existing tmux server adopted (pid $pid): your sessions stay where they are, in the shared server; exit-empty is leased off (was $prior) and restored on uninstall"
  if [ -n "$server_version" ] && [ "tmux $server_version" != "$client_version" ]; then
    ronin_say "    the running server is tmux $server_version and Ronin's client is $client_version; the server's behaviour is the one tiles get"
  fi
}

ronin_restore_tmux() { # state root, tmux binary
  state_root=$1 TMUX_BIN=$2
  lease="$state_root/machine/tmux-adoption"
  [ -f "$lease" ] || return 0
  if ! ronin_tmux_probe; then
    rc=$?
    if [ "$rc" -eq 1 ]; then rm -f "$lease"; return 0; fi
    return "$rc"
  fi
  pid=$(ronin_tmux display-message -p '#{pid}' 2>/dev/null | tr -d '\r\n')
  socket=$(ronin_tmux display-message -p '#{socket_path}' 2>/dev/null | tr -d '\r\n')
  [ -n "$socket" ] || socket="${TMUX_TMPDIR:-${TMPDIR:-/tmp}/tmux-$(id -u)}/default"
  start=$(ronin_tmux_start_id "$pid")
  old_pid=$(sed -n 's/^pid=//p' "$lease"); old_start=$(sed -n 's/^start=//p' "$lease")
  old_socket=$(sed -n 's/^socket=//p' "$lease"); prior=$(sed -n 's/^prior=//p' "$lease")
  if [ "$pid" != "$old_pid" ] || [ "$start" != "$old_start" ] || [ "$socket" != "$old_socket" ]; then
    ronin_say 'kept tmux exit-empty: the server has changed since Ronin adopted it'; return 0
  fi
  current=$(ronin_tmux show-options -s -v exit-empty 2>/dev/null | tr -d '\r\n')
  if [ "$current" != off ]; then
    ronin_say "kept tmux exit-empty=$current: it changed after Ronin adopted the server"; return 0
  fi
  ronin_tmux set-option -s exit-empty "$prior" 2>/dev/null || true
  rm -f "$lease"
  ronin_say "restored tmux exit-empty=$prior"
}

ronin_preflight_port() { # repo, node
  repo=$1 node=$2
  if command -v systemctl >/dev/null 2>&1 && systemctl --user is-active --quiet ronin.service 2>/dev/null; then
    return 0 # the runtime handler is authoritative during a controlled upgrade restart
  fi
  "$node" -e '
    const fs=require("fs"),net=require("net"); let p=3006,b=process.env.RONIN_PREFLIGHT_BIND||"127.0.0.1";
    try { for(const raw of fs.readFileSync(process.argv[1],"utf8").split(/\r?\n/)){ const m=raw.match(/^\s*(PORT|BIND)\s*=\s*(.*?)\s*$/); if(!m)continue; let v=m[2]; const q=v.charCodeAt(0); if((q===34||q===39)&&v.charCodeAt(v.length-1)===q)v=v.slice(1,-1); if(m[1]==="PORT")p=Number(v); else if(v)b=v; } } catch{}
    if(!Number.isInteger(p)||p<1||p>65535){console.error(`PORT=${p} is invalid — set a port from 1 to 65535 in .env.`);process.exit(78)}
    const s=net.createServer(); s.once("error",e=>{if(e.code==="EADDRINUSE"){console.error(`${b}:${p} is already in use — set PORT or BIND in .env before installing Ronin.`);process.exit(78)} throw e}); s.listen(p,b,()=>s.close());
  ' "$repo/.env"
}
