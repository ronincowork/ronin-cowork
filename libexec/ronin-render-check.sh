#!/usr/bin/env bash
# Shared render verdict for install/update gates. The renderer's exit contract is:
# 0 = rendered, 2 = no browser on this host, anything else = a real render failure.

render_check() { # $1=tree $2=url $3=what; returns 1 only on a REAL failure
  local out rc=0
  out="$(cd "$1" && node scripts/smoke-ui.mjs "$2" 2>&1)" || rc=$?
  if [ "$rc" = 0 ]; then
    say "$3 gated: the page renders"
  elif [ "$rc" = 2 ]; then
    say "render check skipped — no headless browser here; the boot and version answer are the proof (docs/host-tools.md)"
  else
    printf '%s\n' "$out" | tail -12 | sed 's/^/  /'
    return 1
  fi
}
