#!/usr/bin/env bash
# RONIN BANNER — the arrival box, and the address it names.
#
# Sourced, never run. Two callers share it so there is ONE implementation of
# "which door is open": setup.sh draws it at the end of an install, and
# bin/ronin-welcome redraws it afterwards — which is the whole point, because
# the HTTPS address does not exist until the installer has established Tailscale Serve.
#
#   ronin_port   <root>            echoes the port this install actually serves
#   ronin_bind   <root>            echoes the address this install binds
#   ronin_record_bind <root>       writes that address into .env, once, and says so
#   ronin_open_url <root> <port>   echoes the verified private HTTPS address, if present
#   ronin_banner <root> <url>      draws the box, on stdout
#
# Everything writes to stdout; a caller that wants another stream redirects.

# The port is the operator's to change (.env says so in as many words), so no
# address may be built from a constant. .env wins, then the example, then 4810.
ronin_port() {
  local root="$1" port=""
  local f
  for f in "$root/.env" "$root/.env.example"; do
    [ -f "$f" ] || continue
    port="$(sed -n 's/^[[:space:]]*PORT=\([0-9][0-9]*\).*/\1/p' "$f" 2>/dev/null | head -1)"
    [ -n "$port" ] && break
  done
  printf '%s' "${port:-4810}"
}

# The bind address, resolved once and the same way for everyone who asks. .env wins,
# because a recorded owner choice is a fact. New installs bind loopback and let
# Tailscale Serve own the private HTTPS listener; older setup-generated tailnet binds
# migrate to loopback without changing an owner-authored BIND.
#
# UNLIKE ronin_port THIS DOES NOT READ .env.example. The example ships BIND commented out
# on purpose — an unset BIND is a real answer ("work it out"), not a missing one, and a
# default lifted from the example would put an address in the file that nobody chose.
#
# ronin_bind_full prints "<address> <source>" because the source is the interesting half
# for an installer, and a function cannot hand it back any other way: every caller reads
# these through $( ), a subshell, so a variable set in here would never reach them.
ronin_bind_full() {
  local root="$1" bind=""
  if [ -f "$root/.env" ]; then
    bind="$(sed -n 's/^[[:space:]]*BIND=\([^[:space:]#]*\).*/\1/p' "$root/.env" 2>/dev/null | head -1)"
  fi
  if [ -n "$bind" ]; then
    local tail_ip=""
    tail_ip="$(command -v tailscale >/dev/null 2>&1 && tailscale ip -4 2>/dev/null | head -1 || true)"
    if [ -n "$tail_ip" ] && [ "$bind" = "$tail_ip" ] &&
       grep -q '^# The address Ronin binds\. Recorded by setup\.sh on ' "$root/.env" 2>/dev/null; then
      printf '127.0.0.1 migration'; return 0
    fi
    printf '%s env' "$bind"; return 0
  fi
  printf '127.0.0.1 loopback'
}

# Just the address, for the callers that only need somewhere to point.
ronin_bind() { ronin_bind_full "$1" | cut -d' ' -f1; }

# Write the resolved address into .env so that later starts bind a recorded fact instead
# of re-asking `tailscale ip -4`, which fails in four ways that all look the same from
# here — not installed, not up, not logged in, or merely slow while the box is still
# coming up — and every one of them silently lands Ronin on 127.0.0.1: a different
# address from the one this install prints, maps with `tailscale serve`, and hands to the
# agent tools. Nothing announces the move, so the first anyone knows of it is a door that
# will not open.
#
# WE ONLY EVER FILL IN A BLANK. An owner who wrote their own BIND outranks this, and a
# re-run must leave their file byte-for-byte alone.
ronin_record_bind() {
  local root="$1" addr="" src=""
  read -r addr src <<<"$(ronin_bind_full "$root")"
  if [ "$src" = env ]; then
    echo "==> BIND: $addr (already in .env — left as it is)"
    return 0
  fi
  if [ "$src" = migration ]; then
    tmp="${TMPDIR:-/tmp}/ronin-bind-$$"
    awk 'BEGIN{done=0} /^BIND=/ && !done {print "BIND=127.0.0.1"; done=1; next} {print}' "$root/.env" > "$tmp"
    cat "$tmp" > "$root/.env" && rm -f "$tmp"
    echo "==> BIND: migrated Ronin's recorded tailnet bind to loopback for private HTTPS"
    return 0
  fi
  {
    echo ""
    echo "# The address Ronin binds. Recorded by setup.sh on $(date +%Y-%m-%d) so that a later"
    echo "# start cannot quietly answer somewhere else. Tailscale Serve owns private HTTPS."
    echo "BIND=$addr"
  } >> "$root/.env"
  echo "==> BIND: recorded 127.0.0.1 in .env (Tailscale Serve owns private HTTPS)"
}

# A serve mapping counts only if it points at THIS install. `tailscale serve
# status` prints the public URL and then its target beneath it:
#
#   https://box.tailnet.ts.net:4810/
#   |-- proxy http://<loopback>:<backend-port>
#
# so the URL is remembered and only emitted once a target naming our port
# follows it. Matching any https:// line instead would hand a stranger whatever
# else they happen to serve on that tailnet and call it the door to Ronin.
ronin_served_url() {
  local port="$1" host="${2:-}" public_port="${3:-4810}"
  [ -n "$host" ] || return 0
  command -v tailscale >/dev/null 2>&1 || return 0
  tailscale serve status 2>/dev/null | awk -v backend="$host:$port" -v public_port="$public_port" '
    /^[[:space:]]*https:\/\// {
      u = $1; sub(/\/$/, "", u)
      public_ok = (u ~ (":" public_port "$") )
      next
    }
    u != "" && /proxy[[:space:]]+https?:\/\// {
      target = $NF
      sub(/^https?:\/\//, "", target)
      sub(/\/$/, "", target)
      if (public_ok && target == backend) { print u; exit }
    }
  ' || true
}

# The optional private HTTPS address, only when Serve maps to this installation.
ronin_open_url() {
  local root="$1" port="$2"
  : "$root"
  ronin_served_url "$port" "${RONIN_BACKEND_HOST:-${RONIN_IP:-}}" "${RONIN_PUBLIC_PORT:-4810}"
}

# Address reachable from a browser on the computer running Ronin.
# Preserve explicit owner binds; wildcard listeners also accept loopback.
ronin_http_url() {
  local host="$(ronin_bind "$1")"
  case "$host" in 0.0.0.0) host=127.0.0.1 ;; ::) host='[::1]' ;; *:*) host="[$host]" ;; esac
  printf 'http://%s:%s' "$host" "$(ronin_port "$1")"
}

ronin_banner() { # <root> <url> [report] [warning]
  local root="$1" url="$2" report="${3:-}" warning="${4:-}"
  local title=" RONIN COWORK " ver="" mark="人"
  [ -f "$root/VERSION" ] && ver="$(sed -n 's/^release=//p' "$root/VERSION" 2>/dev/null || true)"
  [ -n "$ver" ] && ver=" $ver "

  local l1="$mark  Yatta, Ronin is running on your machine."
  local w1=$(( ${#l1} + 1 ))
  local w="$w1"
  local chrome=$(( ${#title} + ${#ver} + 4 ))
  local inner=$(( w + 4 )); [ "$chrome" -gt "$inner" ] && inner=$chrome

  local i fill="" dashes=$(( inner - ${#title} - ${#ver} - 2 ))
  for ((i = 0; i < dashes; i++)); do fill="$fill─"; done
  local bar=""; for ((i = 0; i < inner; i++)); do bar="$bar─"; done

  printf '\n  ╭─%s%s%s─╮\n' "$title" "$fill" "$ver"
  printf '  │%*s│\n' "$inner" ""
  printf '  │  %s%*s│\n' "$l1" $(( inner - 2 - w1 )) ""
  printf '  │%*s│\n' "$inner" ""
  printf '  ╰%s╯\n\n' "$bar"
  if [ -n "$url" ]; then
    printf '  On this computer or another device connected to your Tailscale network:\n'
    printf '  %s\n\n' "$url"
  fi
  local http_url="$(ronin_http_url "$root")"
  case "$http_url" in
    http://127.*|http://localhost:*|http://\[::1\]:*)
      printf '  On this computer only (no Tailscale needed):\n' ;;
    *) printf '  HTTP address (your custom BIND setting):\n' ;;
  esac
  printf '  %s\n\n' "$http_url"
  [ -n "$url" ] || printf '  Tailscale HTTPS is not configured.\n\n'
  printf '  Next: open Machine Settings to set up your first Agent.\n'
  [ -z "$warning" ] || printf '\n  Warning: %s\n' "$warning"
  [ -z "$report" ] || printf '\n  Install details: %s\n' "$report"
  printf '\n'
}
