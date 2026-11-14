# ronin-park.sh — what bin/ronin-archive and bin/ronin-rehydrate share. Sourced, not run.
#
# THE CONTRACT with Ronin Cloud's kohai (KAN-502, docs/operating/park.md): each command
# returns at once and goes on detached; the kohai never holds a guest exec open, it reads
# <file>.status.json:
#   {"state":"running"|"done"|"failed","step":"…","size":N,"sha256":"…","error":"…"}
# The detached run's own output lands in <file>.log beside it.
#
# The caller sets PARK_NAME (its own name), PARK_FILE (the file) and sources this after
# libexec/ronin-machine.sh.

PARK_STATUS="$PARK_FILE.status.json"
PARK_LOG="$PARK_FILE.log"
PARK_STEP="starting"
PARK_SIZE=0
PARK_SHA=""

park_status() { # <state> [error]
  python3 - "$PARK_STATUS" "$1" "$PARK_STEP" "$PARK_SIZE" "$PARK_SHA" "${2:-}" <<'PY'
import json, os, sys
path, state, step, size, sha, error = sys.argv[1:]
tmp = path + ".tmp"
with open(tmp, "w") as f:
    f.write(json.dumps({"state": state, "step": step, "size": int(size), "sha256": sha, "error": error}) + "\n")
os.replace(tmp, path)
PY
}

park_step() { PARK_STEP="$1"; echo "→ $1"; park_status running; }

PARK_FAILED=0
PARK_WORK=""
park_fail() { echo "✗ $1" >&2; PARK_FAILED=1; park_status failed "$1"; exit 1; }

# Any exit that did not write its own status still ends in a failed one, never a "running"
# the kohai would wait on forever. The scratch directory goes either way.
park_exit() {
  local rc=$?
  [ -z "$PARK_WORK" ] || rm -rf "$PARK_WORK"
  if [ "$rc" -ne 0 ] && [ "$PARK_FAILED" = 0 ]; then
    echo "✗ $PARK_STEP failed (exit $rc)" >&2
    park_status failed "$PARK_STEP failed (exit $rc) — see $PARK_LOG"
  fi
}
park_trap() { trap park_exit EXIT; }

# Return at once: write the first status, re-run this command detached, print where to look.
park_detach() { # <args to re-run with>
  park_status running
  setsid nohup "$0" --foreground "$@" >"$PARK_LOG" 2>&1 </dev/null &
  echo "$PARK_NAME: started (pid $!) — status: $PARK_STATUS · log: $PARK_LOG"
}

park_digest() {
  PARK_SIZE="$(wc -c <"$PARK_FILE" | tr -d ' ')"
  if command -v sha256sum >/dev/null 2>&1; then PARK_SHA="$(sha256sum "$PARK_FILE" | cut -d' ' -f1)"
  else PARK_SHA="$(shasum -a 256 "$PARK_FILE" | cut -d' ' -f1)"; fi
}

# This tree's release and commit: VERSION in a release, package.json and git in a checkout.
park_release() {
  local v=""; [ ! -f "$PARK_ROOT/VERSION" ] || v="$(sed -n 's/^release=//p' "$PARK_ROOT/VERSION")"
  [ -n "$v" ] || v="v$(sed -n 's/^  "version": "\(.*\)",$/\1/p' "$PARK_ROOT/package.json")"
  case "$v" in v*) ;; *) v="v$v" ;; esac
  printf '%s' "$v"
}
park_commit() {
  local c=""; [ ! -f "$PARK_ROOT/VERSION" ] || c="$(sed -n 's/^commit=//p' "$PARK_ROOT/VERSION")"
  [ -n "$c" ] || c="$(git -C "$PARK_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  printf '%s' "$c"
}
park_contract() {
  local c=""; [ ! -f "$PARK_ROOT/VERSION" ] || c="$(sed -n 's/^contract=//p' "$PARK_ROOT/VERSION")"
  [ -n "$c" ] || c="$(sed -n 's/^export const CONTRACT_V = \([0-9][0-9]*\);.*/\1/p' "$PARK_ROOT/src/sockets-contract.ts")"
  printf '%s' "$c"
}

# Stop and start the operator through its manager — the same unit ronin-host restart names.
park_ronin() { # stop|start
  local kind unit; kind="$(machine_service_kind)"; unit="$(machine_operator_unit)"
  case "$kind:$1" in
    systemd:stop)  systemctl --user stop "$unit" ;;
    systemd:start) systemctl --user start "$unit" ;;
    launchd:stop)  launchctl bootout "$(machine_launchd_domain)/$unit" 2>/dev/null || true ;;
    launchd:start) launchctl bootstrap "$(machine_launchd_domain)" "$(machine_operator_plist)" ;;
    *) park_fail "no service manager here to $1 Ronin with (systemd or launchd)" ;;
  esac
}

# After a start: wait until the operator answers a request, as ronin-host restart waits.
park_wait_ronin() {
  local i=0 TOOL_DIR="$PARK_ROOT/ronin_bin"
  . "$TOOL_DIR/ronin-http.sh"
  while [ "$i" -lt 90 ]; do
    if ronin_connect 2>/dev/null &&
       curl -sf -m 5 "${RONIN_CURL[@]+"${RONIN_CURL[@]}"}" -o /dev/null "$url/api/archived-sessions"; then return 0; fi
    i=$((i + 1)); sleep 1
  done
  park_fail "Ronin did not answer 90s after starting — journalctl --user -u $(machine_operator_unit) says why"
}
