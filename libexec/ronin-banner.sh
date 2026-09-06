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
#   ronin_bind   <root>            echoes the address this install binds
#   ronin_record_bind <root>       writes that address into .env, once, and says so
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

# The bind address, resolved once and the same way for everyone who asks. .env wins,
# because a recorded address is a fact and a probe is a guess; then the tailnet address;
# then loopback.
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
  if [ -n "$bind" ]; then printf '%s env' "$bind"; return 0; fi
  if command -v tailscale >/dev/null 2>&1; then
    bind="$(tailscale ip -4 2>/dev/null | head -1 || true)"
  fi
  if [ -n "$bind" ]; then printf '%s tailscale' "$bind"; return 0; fi
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
  {
    echo ""
    echo "# The address Ronin binds. Recorded by setup.sh on $(date +%Y-%m-%d) so that a later"
    echo "# start cannot quietly answer somewhere else. Delete this line to go back to working"
    echo "# it out from \`tailscale ip -4\` on every start."
    echo "BIND=$addr"
  } >> "$root/.env"
  if [ "$src" = tailscale ]; then
    echo "==> BIND: recorded $addr in .env (this box's tailnet address)"
  else
    echo "==> BIND: recorded 127.0.0.1 in .env — no tailnet address to be had, so Ronin will"
    echo "    answer on this box only. Install or sign in to tailscale, delete that BIND line"
    echo "    and re-run to reach it from your other devices."
  fi
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

# THE FRAME FITS AN 80-COLUMN TERMINAL. Every inner line is wrapped here to at most
# RONIN_FRAME_TEXT columns, and the frame around it is fixed: two columns of indent, the
# left edge, two of padding, the text, two of padding, the right edge — 72 + 8 = 80. A
# caller hands in whole sentences and paths and the frame does the fitting; it never
# refuses a long line and never lets one push the right edge off the screen.
RONIN_FRAME_TEXT=72

# A path with $HOME spelled out is what pushed the first frame to 103 columns. Callers
# print paths through this so the person reads ~/ronin/current, which is also how they
# would type it.
ronin_tilde() {
  case "$1" in
    "$HOME")   printf '~' ;;
    "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;;
    *)         printf '%s' "$1" ;;
  esac
}

# Wrap one frame line to at most $2 columns, on the last space that fits. A line shaped
# "Label        · text" continues under its text column, so the label column stays a
# column; any other line continues under its own leading whitespace. A run with no
# space in it (a long path) is cut where it must be, never dropped.
ronin_wrap() {
  local text="$1" width="$2" indent="" rest chunk cut after
  case "$text" in
    *" · "*) after="${text#* · }"; indent="$(printf '%*s' $(( ${#text} - ${#after} )) '')" ;;
    *)       indent="${text%%[! ]*}" ;;
  esac
  rest="$text"
  while [ ${#rest} -gt "$width" ]; do
    chunk="${rest:0:$(( width + 1 ))}"
    cut="${chunk% *}"
    if [ ${#cut} -eq ${#chunk} ] || [ ${#cut} -le ${#indent} ]; then cut="${rest:0:$width}"; fi
    printf '%s\n' "${cut%"${cut##*[! ]}"}"
    rest="${rest:${#cut}}"
    rest="${rest#"${rest%%[! ]*}"}"
    rest="$indent$rest"
  done
  printf '%s\n' "$rest"
}

ronin_banner() { # <root> <url> [change line...]
  local root="$1" url="$2"; shift 2
  local title=" RONIN COWORK " ver="" mark="人" grid_pass="" text="$RONIN_FRAME_TEXT"
  [ -f "$root/VERSION" ] && ver="$(sed -n 's/^release=//p' "$root/VERSION" 2>/dev/null || true)"
  [ -n "$ver" ] && ver=" $ver "

  # Visual width, not character count: 人 is double-width and counts as one. Keep
  # ambiguous-width glyphs (⬡ and friends) out of the frame — they are one column in
  # some terminals and two in others.
  local l1="$mark   You're in. Thanks for joining us."
  local l2="Your agents have a room now — open the door:"
  if [ -f "$root/.env" ]; then
    grid_pass="$(sed -n 's/^[[:space:]]*GRID_PASS=[[:space:]]*//p' "$root/.env" 2>/dev/null | head -1)"
  fi
  # The posture is two sentences on two lines: the fact, then the remedy. One line held
  # both at 88 columns and broke every 80-column terminal it met.
  local posture=()
  if [ -z "$grid_pass" ]; then
    posture=("No password: anyone your tailnet lets reach this has a shell here."
             "bin/ronin-passwd adds one.")
  fi
  # Everything after the greeting is wrapped to the text width before it is measured,
  # so the widest line the frame can hold is the widest line it will ever draw.
  local body=() details=() line
  while IFS= read -r line; do body+=("$line"); done < <(ronin_wrap "$l2" "$text")
  local url_at=${#body[@]}
  while IFS= read -r line; do body+=("$line"); done < <(ronin_wrap "$url" "$text")
  for line in ${posture[@]+"${posture[@]}"}; do
    while IFS= read -r l; do body+=("$l"); done < <(ronin_wrap "$line" "$text")
  done
  local l detail
  for detail in "$@"; do
    while IFS= read -r l; do details+=("$l"); done < <(ronin_wrap "$detail" "$text")
  done

  local w1=$(( ${#l1} + 1 )) w=0
  [ "$w1" -gt "$w" ] && w=$w1
  for line in "${body[@]}" ${details[@]+"${details[@]}"}; do
    [ ${#line} -gt "$w" ] && w=${#line}
  done
  # A frame that cannot hold its own chrome is a broken frame.
  local chrome=$(( ${#title} + ${#ver} + 4 ))
  local inner=$(( w + 4 )); [ "$chrome" -gt "$inner" ] && inner=$chrome

  local i fill="" dashes=$(( inner - ${#title} - ${#ver} - 2 ))
  for ((i = 0; i < dashes; i++)); do fill="$fill─"; done
  local bar=""; for ((i = 0; i < inner; i++)); do bar="$bar─"; done

  printf '\n  ╭─%s%s%s─╮\n' "$title" "$fill" "$ver"
  printf '  │%*s│\n' "$inner" ""
  printf '  │  %s%*s│\n' "$l1" $(( inner - 2 - w1 )) ""
  printf '  │%*s│\n' "$inner" ""
  i=0
  for line in "${body[@]}"; do
    # Bold only for a tty, so a piped transcript stays clean.
    if [ "$i" -eq "$url_at" ] && [ -t 1 ]; then
      printf '  │  \033[1m%s\033[0m%*s│\n' "$line" $(( inner - 2 - ${#line} )) ""
    else
      printf '  │  %s%*s│\n' "$line" $(( inner - 2 - ${#line} )) ""
    fi
    i=$(( i + 1 ))
  done
  if [ ${#details[@]} -gt 0 ]; then
    printf '  ├%s┤\n' "$bar"
    for line in "${details[@]}"; do
      printf '  │  %s%*s│\n' "$line" $(( inner - 2 - ${#line} )) ""
    done
  fi
  printf '  │%*s│\n' "$inner" ""
  printf '  ╰%s╯\n\n' "$bar"
}
