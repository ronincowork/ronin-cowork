#!/bin/sh
# statusline-ronin.sh — make Claude Code's context number visible ON SCREEN.
#
# WHAT IT IS
#   A Claude Code `statusLine` command. Claude Code pipes one JSON object to it on
#   stdin on every status refresh; whatever it prints to stdout is drawn as the
#   pane's status line. This script prints exactly one line:
#
#       ⛽ ctx 42% · Opus 5
#
# WHAT CONSUMES IT
#   src/ctx.ts:19  — CTX_PATTERNS[0]  /⛽ ctx (\d+(?:\.\d+)?)%/           (mode: 'used')
#   src/ctx.ts:33  — MODEL_PATTERNS[0] /⛽ ctx \d+(?:\.\d+)?% · ([^\n·]{1,24}?)\s*$/
#
#   Ronin scrapes that line back out of ORDINARY PANE TEXT with `tmux capture-pane`
#   (src/tmux.ts capturePane) to drive the ⛽ gauge on each session tile. It never
#   reads ~/.claude, transcripts or any API — see docs/context-gauge.md. This script
#   exists purely so the number is on the screen for anything to read.
#
#   Two consequences of those regexes, both load-bearing — do not "tidy" them away:
#     * the model name must be LAST on the line, right after " · ", and ≤24 chars
#       with no "·" in it, or MODEL_PATTERNS[0] will not match;
#     * the model is only readable when a percentage is printed, because the model
#       pattern is anchored on the "⛽ ctx NN%" prefix.
#
# REGISTRATION — NOT DONE BY THIS FILE, AND NOT DONE BY RONIN
#   Claude Code only runs a status line if `statusLine` is set in one of ITS OWN
#   settings files. The script lives here, in the repo; the registration is the
#   vendor's contract and is the user's (or setup.sh's) call to make. Nothing of
#   ours is written into ~/.claude/ by hand or by code.
#   See hostside/README.md — it holds the ruling and the one line to paste.
#
# BEHAVIOUR CONTRACT (it runs on every render)
#   * Never blocks: does not read stdin when stdin is a terminal, shells out to
#     nothing, touches no network, no git, no files.
#   * Never errors loudly: always exits 0; all stderr is discarded.
#   * Never invents a number. If the payload carries no context reading, it prints
#     the model alone (harmless, and Ronin honestly reports ctx null) rather than a
#     fabricated 0%.
#   * No ANSI. Ronin captures without `-e`, and stray escapes would break the
#     end-of-line anchor in MODEL_PATTERNS[0].
#   * No jq required — jq is not installed on dohyo. python3 (Ubuntu base) does the
#     parsing; a grep/sed path recovers the model name if even that is missing.

set -u

# Never block. Claude Code always pipes JSON; a human running this by hand does not.
if [ -t 0 ]; then
  payload=''
else
  payload=$(cat 2>/dev/null) || payload=''
fi

[ -n "$payload" ] || exit 0

line=''

if command -v python3 >/dev/null 2>&1; then
  line=$(printf '%s' "$payload" | python3 -c '
import json, re, sys

def num(v):
    if isinstance(v, bool) or v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if v == v and abs(v) != float("inf") else None

try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
if not isinstance(d, dict):
    d = {}

def obj(parent, key):
    v = parent.get(key)
    return v if isinstance(v, dict) else {}

cw = obj(d, "context_window")

# Documented source of truth, in order of directness.
pct = num(cw.get("used_percentage"))
if pct is None:
    rem = num(cw.get("remaining_percentage"))
    if rem is not None:
        pct = 100.0 - rem
if pct is None:
    # Same input-only formula Claude Code uses for used_percentage.
    usage = obj(cw, "current_usage")
    size = num(cw.get("context_window_size"))
    if size and size > 0:
        tok = 0.0
        for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"):
            tok += num(usage.get(k)) or 0.0
        if tok > 0:
            pct = tok * 100.0 / size
if pct is not None:
    pct = max(0.0, min(100.0, pct))

m = obj(d, "model")
model = m.get("display_name") or m.get("id") or ""
if not isinstance(model, str):
    model = ""
# The scrape forbids "·" and a newline inside the name, and caps it at 24 chars.
model = re.sub(r"[\x00-\x1f\x7f·]", " ", model)
model = re.sub(r"\s+", " ", model).strip()[:24].strip()

if pct is not None:
    out = "⛽ ctx %d%%" % int(round(pct))
    if model:
        out += " · " + model
    print(out)
elif model:
    print(model)
' 2>/dev/null) || line=''
fi

# No python3: recover the model name only. A percentage is deliberately NOT guessed
# here — "used_percentage" also appears under rate_limits, and a wrong number that
# looks right is the exact failure this script was rewritten to end.
if [ -z "$line" ]; then
  line=$(printf '%s' "$payload" \
    | tr ',{}' '\n\n\n' \
    | grep -m1 '"display_name"' 2>/dev/null \
    | sed -n 's/.*"display_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | tr -d '\000-\037·' \
    | cut -c1-24) || line=''
fi

[ -n "$line" ] && printf '%s\n' "$line"

exit 0
