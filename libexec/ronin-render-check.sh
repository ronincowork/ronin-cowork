#!/usr/bin/env bash
# Shared render verdict for install/update gates. The caller provides say(), which this
# helper calls with its progress sentence on rendered and skipped checks. On return,
# RENDER_VERDICT holds smoke-ui's PASSED/FAILED line and RENDER_DETAILS
# holds its last twelve output lines. Return 0 = rendered, 2 = no browser on this host,
# 1 = a real render failure; callers decide how those states are presented or enforced.

render_check() { # $1=tree $2=url $3=what
  local out rc=0
  RENDER_VERDICT=""
  RENDER_DETAILS=""
  RENDER_REPORT=""
  out="$(cd "$1" && node scripts/smoke-ui.mjs "$2" 2>&1)" || rc=$?
  RENDER_VERDICT="$(printf '%s\n' "$out" | grep -E '^(PASSED|FAILED)' | head -1 || true)"
  RENDER_DETAILS="$(printf '%s\n' "$out" | tail -12)"
  if [ "$rc" = 0 ]; then
    RENDER_REPORT="$3 gated: the page renders"
    say "$RENDER_REPORT"
    return 0
  elif [ "$rc" = 2 ]; then
    RENDER_REPORT="render check skipped — no headless browser here; the boot and version answer are the proof (docs/host-tools.md)"
    say "$RENDER_REPORT"
    return 2
  else
    return 1
  fi
}
