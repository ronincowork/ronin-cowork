#!/usr/bin/env bash
# RONIN BANNER — the arrival box, and the address it names.
#
# Sourced, never run. Two callers share it so there is ONE implementation of
# "which door is open": setup.sh draws it at the end of an install, and
# bin/ronin-welcome redraws it afterwards — which is the whole point, because
# the HTTPS address does not exist until someone has run `tailscale serve`
# with a sudo the installer never has.
#
#   ronin_port   <root>            echoes the port this install actually serves
#   ronin_open_url <root> <port>   echoes the address that is live RIGHT NOW
#   ronin_banner <root> <url>      draws the box, on stdout
#
# Everything writes to stdout; a caller that wants another stream redirects.

# The port is the operator's to change (.env says so in as many words), so no
# address may be built from a constant. .env wins, then the example, then 3006.
ronin_port() {
  local root="$1" port=""
  local f
  for f in "$root/.env" "$root/.env.example"; do
    [ -f "$f" ] || continue
    port="$(sed -n 's/^[[:space:]]*PORT=\([0-9][0-9]*\).*/\1/p' "$f" 2>/dev/null | head -1)"
    [ -n "$port" ] && break
  done
  printf '%s' "${port:-3006}"
}

# A serve mapping counts only if it points at THIS install. `tailscale serve
# status` prints the public URL and then its target beneath it:
#
#   https://box.tailnet.ts.net:8443/
#   |-- proxy http://100.72.224.3:3006
#
# so the URL is remembered and only emitted once a target naming our port
# follows it. Matching any https:// line instead would hand a stranger whatever
# else they happen to serve on that tailnet and call it the door to Ronin.
ronin_served_url() {
  local port="$1"
  command -v tailscale >/dev/null 2>&1 || return 0
  tailscale serve status 2>/dev/null | awk -v p=":$port" '
    /^[[:space:]]*https:\/\// { u = $1; sub(/\/$/, "", u); next }
    u != "" && index($0, p) { print u; exit }
  ' || true
}

# The address to print: the served HTTPS one when it exists, otherwise the
# tailnet HTTP address that answers at this moment. Never a promise.
ronin_open_url() {
  local root="$1" port="$2" url=""
  url="$(ronin_served_url "$port")"
  if [ -z "$url" ]; then
    local fqdn="${RONIN_FQDN:-}" ip="${RONIN_IP:-}"
    if   [ -n "$fqdn" ]; then url="http://$fqdn:$port"
    elif [ -n "$ip" ];   then url="http://$ip:$port"
    else                      url="http://127.0.0.1:$port"; fi
  fi
  printf '%s' "$url"
}

ronin_banner() { # <root> <url>
  local root="$1" url="$2"
  local title=" RONIN COWORK " ver="" mark="人"
  [ -f "$root/VERSION" ] && ver="$(sed -n 's/^release=//p' "$root/VERSION" 2>/dev/null || true)"
  [ -n "$ver" ] && ver=" $ver "

  # Visual width, not character count: 人 is double-width and counts as one. Keep
  # ambiguous-width glyphs (⬡ and friends) out of the frame — they are one column in
  # some terminals and two in others.
  local l1="$mark   You're in. Thanks for joining us."
  local l2="Your agents have a room now — open the door:"
  local w1=$(( ${#l1} + 1 )) w=0
  [ "$w1" -gt "$w" ] && w=$w1
  [ ${#l2} -gt "$w" ] && w=${#l2}
  [ ${#url} -gt "$w" ] && w=${#url}
  # A frame that cannot hold its own chrome is a broken frame.
  local chrome=$(( ${#title} + ${#ver} + 4 ))
  local inner=$(( w + 6 )); [ "$chrome" -gt "$inner" ] && inner=$chrome

  local i fill="" dashes=$(( inner - ${#title} - ${#ver} - 2 ))
  for ((i = 0; i < dashes; i++)); do fill="$fill─"; done
  local bar=""; for ((i = 0; i < inner; i++)); do bar="$bar─"; done

  printf '\n  ╭─%s%s%s─╮\n' "$title" "$fill" "$ver"
  printf '  │%*s│\n' "$inner" ""
  printf '  │   %s%*s│\n' "$l1" $(( inner - 3 - w1 )) ""
  printf '  │%*s│\n' "$inner" ""
  printf '  │   %s%*s│\n' "$l2" $(( inner - 3 - ${#l2} )) ""
  # Bold only for a tty, so a piped transcript stays clean.
  if [ -t 1 ]; then
    printf '  │   \033[1m%s\033[0m%*s│\n' "$url" $(( inner - 3 - ${#url} )) ""
  else
    printf '  │   %s%*s│\n' "$url" $(( inner - 3 - ${#url} )) ""
  fi
  printf '  │%*s│\n' "$inner" ""
  printf '  ╰%s╯\n\n' "$bar"
}
