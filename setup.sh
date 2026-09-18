#!/usr/bin/env bash
#
# ronin-cowork setup — installs dependencies and an always-on autostart service.
# Run from the repo root:   ./setup.sh
#
# Works on Linux (systemd --user) and macOS (prints launchd steps). The app stays
# unprivileged. On Linux, setup asks once before using sudo for the detected machine
# settings: linger, required Tailscale HTTPS, and an offerable swapfile.
set -euo pipefail

MACHINE_ONLY=0
if [ "${1:-}" = --machine-only ]; then MACHINE_ONLY=1; shift; fi
[ $# -eq 0 ] || { printf 'usage: %s [--machine-only]\n' "$0" >&2; exit 64; }

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# The install talks to a log, not to the person. fd 3 is the terminal, kept for the
# banner at the end and for anything that actually needs them. RONIN_VERBOSE=1 puts the
# whole transcript back on screen.
RONIN_REPORT_ROOT="$("$REPO_DIR/bin/ronin-store" --root data 2>/dev/null || printf '%s' "$HOME/.ronin")/reports"
mkdir -p "$RONIN_REPORT_ROOT" 2>/dev/null || true
RONIN_SETUP_LOG="${RONIN_INSTALL_REPORT:-$RONIN_REPORT_ROOT/install-$(date -u +%Y%m%dT%H%M%SZ)-$$.log}"
if [ -z "${RONIN_TERMINAL_FD:-}" ]; then exec 3>&1; fi
if [ -z "${RONIN_VERBOSE:-}" ]; then
  touch "$RONIN_SETUP_LOG" 2>/dev/null || RONIN_SETUP_LOG=/dev/null
  exec >>"$RONIN_SETUP_LOG" 2>&1
fi
out() { printf '%s\n' "$*" >&3; }
# A failure is the one thing that must reach them, with the log to look at.
trap 'rc=$?; [ $rc -eq 0 ] || { printf "\n  Setup failed (exit %s). What happened is in:\n    %s\n\n" "$rc" "$RONIN_SETUP_LOG" >&3; }' EXIT

echo "==> Ronin setup in $REPO_DIR"

# --- the runtime: a bundled release, or a developer's checkout ---
# vendor/ present means a bundled release (vendor.lock, bin/ronin-build): the tree
# already carries its own Node, static tmux, and node_modules, so nothing is checked,
# nothing is fetched, and no dependency is ever named at the user. vendor/ absent
# means a git checkout — the developer path stays exactly what it always was.
if [ -x "$REPO_DIR/vendor/node/bin/node" ] && [ -x "$REPO_DIR/vendor/tmux" ]; then
  BUNDLED=1
  NODE_BIN="$REPO_DIR/vendor/node/bin/node"
  NODE_DIR="$REPO_DIR/vendor/node/bin"
  TMUX_BIN="$REPO_DIR/vendor/tmux"
  TMUX_DIR="$REPO_DIR/vendor/bin"
  echo "    bundled: node $("$NODE_BIN" -v) · $("$TMUX_BIN" -V) — nothing to check, nothing to fetch"
else
  BUNDLED=0
  command -v tmux >/dev/null || { echo "ERROR: tmux not found — install tmux first."; exit 1; }
  command -v node >/dev/null || { echo "ERROR: node not found — install Node.js 18+."; exit 1; }
  # Resolve a STABLE node path (e.g. fnm/nvm put an ephemeral shim on PATH).
  NODE_BIN="$(readlink -f "$(command -v node)" 2>/dev/null || command -v node)"
  NODE_DIR="$(dirname "$NODE_BIN")"
  TMUX_BIN="$(command -v tmux)"
  TMUX_DIR="$(dirname "$TMUX_BIN")"
  echo "    tmux : $TMUX_BIN"
  echo "    node : $NODE_BIN ($(node -v))"
fi
if command -v tailscale >/dev/null; then
  echo "    tailscale: $(command -v tailscale)"
else
  echo "    tailscale: not found (local HTTP access is available)"
fi

# --- coexistence preflight: before dependency, rc, option, or unit mutations ---
# shellcheck source=libexec/ronin-coexist.sh
. "$REPO_DIR/libexec/ronin-coexist.sh"
# Adoption is disclosed, not asked: it reaches the terminal as well as the log.
ronin_say() { echo "$*"; [ -n "${RONIN_VERBOSE:-}" ] || out "$*"; }
PREFLIGHT_UNIT_DIR="$HOME/.config/systemd/user"
if [ "$(uname -s)" = Linux ]; then
  ronin_preflight_units "$PREFLIGHT_UNIT_DIR"
fi
# The address to test is the one the install will bind: .env if recorded, else the same
# resolution ronin_record_bind writes down later in this script (libexec/ronin-banner.sh).
# shellcheck source=libexec/ronin-banner.sh
. "$REPO_DIR/libexec/ronin-banner.sh"
RONIN_PREFLIGHT_BIND="${BIND:-$(ronin_bind "$REPO_DIR")}"
export RONIN_PREFLIGHT_BIND
ronin_preflight_port "$REPO_DIR" "$NODE_BIN"

# --- root-owned machine settings: one decision and one authorization during install ---
# Do this before setup changes tmux, rc files, units, or stores. The predicates remain
# in ronin-machine.sh, shared with doctor; the small apply helper receives only fixed,
# already-separated arguments and invokes each privileged program directly.
OS="$(uname -s)"
if [ "$OS" = Linux ] && { [ "$MACHINE_ONLY" -eq 1 ] || [ -z "${RONIN_MACHINE_PREPARED:-}" ]; }; then
  # shellcheck source=libexec/ronin-machine.sh
  . "$REPO_DIR/libexec/ronin-machine.sh"
  MACHINE_APPLY_ARGS=()
  machine_linger_on || if [ $? -eq 1 ]; then
    MACHINE_APPLY_ARGS+=(--linger "$(id -un)")
  fi
  TAILSCALE_IP="$(command -v tailscale >/dev/null 2>&1 && tailscale ip -4 2>/dev/null | head -1 || true)"
  PREFLIGHT_SERVED="$(ronin_served_url "$RONIN_PREFLIGHT_PORT" "$RONIN_PREFLIGHT_BIND" 4810)"
  if [ -z "$PREFLIGHT_SERVED" ] && [ -n "$TAILSCALE_IP" ]; then
    MACHINE_APPLY_ARGS+=(--serve "$RONIN_PREFLIGHT_BIND" "$RONIN_PREFLIGHT_PORT")
  fi
  if machine_swap_offerable; then
    MACHINE_APPLY_ARGS+=(--swap)
  fi
  if [ "${#MACHINE_APPLY_ARGS[@]}" -gt 0 ]; then
    set +e
    "$REPO_DIR/libexec/ronin-machine-apply" "${MACHINE_APPLY_ARGS[@]}" | tee /dev/fd/3
    apply_rc=${PIPESTATUS[0]}
    set -e
    [ "$apply_rc" -eq 0 ] || exit "$apply_rc"
  fi
fi
[ "$MACHINE_ONLY" -eq 0 ] || exit 0
ronin_adopt_tmux "$("$REPO_DIR/bin/ronin-store" --root data)"

# --- install deps (checkout only: a bundle arrives with finished node_modules) ---
if [ "$BUNDLED" = 1 ]; then
  echo "==> node_modules: vendored in the release — nothing to install"
else
  echo "==> npm install"
  "$NODE_DIR/npm" install
fi

# --- .env ---
if [ ! -f .env ]; then
  cp .env.example .env
  ronin_record_install_port "$REPO_DIR" "${RONIN_PREFLIGHT_PORT:-4810}"
  echo "==> created .env from .env.example (edit if you want auth / a different port)"
fi
# 600 OUTSIDE the create block, so a re-run repairs a box that installed before this line
# existed — which is every box that already has one. The file holds GRID_PASS and provider
# keys, and a ronin_machine's premise is many concurrent agent sessions under one Unix
# user: group-readable there means readable by every session on the box.
chmod 600 .env 2>/dev/null || true

# --- BIND, decided once and written down ---
# Straight after .env exists and before anything asks for the address: the preflight, the
# banner, the serve mapping and the first start all take it from the file from here on.
# The reasoning, and the rule that an owner's own BIND outranks ours, live with the
# function in libexec/ronin-banner.sh.
# shellcheck source=libexec/ronin-banner.sh
. "$REPO_DIR/libexec/ronin-banner.sh"
read -r RECORDED_BIND RECORDED_BIND_SOURCE <<<"$(ronin_bind_full "$REPO_DIR")"
ronin_record_bind "$REPO_DIR"

# --- Claude Code settings Ronin needs (two keys, one merge) ---
# Ronin sets exactly TWO keys in Claude Code's own settings — `statusLine`, without which the
# ⛽ context gauge stays dark, and `theme`, without which Ronin's light/dark stops at the edge
# of the pane. Both the reasoning and the merge discipline live in the script; it is a file
# rather than a heredoc because the common case is someone installing Claude Code AFTER
# running setup.sh, and an install-time-only step misses exactly those people.
# bin/ronin-doctor runs it with --check so the box says so out loud.
CLAUDE_SETTINGS_PY="$REPO_DIR/hostside/claude-settings.py"
STATUSLINE_SH="$REPO_DIR/hostside/statusline-ronin.sh"
echo "==> Claude Code settings (the ⛽ context gauge, and light/dark reaching the pane)"
if [ ! -f "$CLAUDE_SETTINGS_PY" ] || [ ! -f "$STATUSLINE_SH" ]; then
  echo "    SKIPPED: $CLAUDE_SETTINGS_PY or $STATUSLINE_SH not found."
elif ! command -v python3 >/dev/null 2>&1; then
  ronin_say "    SKIPPED: python3 not found, cannot edit JSON safely. Add by hand to ~/.claude/settings.json:"
  ronin_say "      \"statusLine\": { \"type\": \"command\", \"command\": \"$STATUSLINE_SH\" },"
  ronin_say "      \"theme\": \"dark-ansi\""
else
  [ -x "$STATUSLINE_SH" ] || chmod +x "$STATUSLINE_SH" 2>/dev/null || true
  python3 "$CLAUDE_SETTINGS_PY" "$STATUSLINE_SH" || \
    echo "    WARNING: could not write ~/.claude/settings.json — add the two keys by hand."
fi

# --- PATH: bin/shim (the tmux server wall), ronin_bin (agent tools), bin (house scripts) ---
#   <repo>/bin/shim  bin/shim/tmux makes kill-server unavailable.
#   <repo>/ronin_bin the Agent-facing capability tools — selected documents tell Agents
#                    which bare names they receive. Off PATH they only work from the repo
#                    root, which no Agent can rely on.
#   <repo>/bin       the owner's own commands (ronin-byoin, ronin-doctor, ronin-deploy,
#                    ronin-store, ronin-uninstall, ronin-export, bench) — typed by a
#                    person, so they are on PATH too. Not libexec/: nobody types those.
# The shim dir stays FIRST — ahead of bin/ as well as /usr/bin. bin/ holds no tmux and no
# systemctl today, and the guard's position must not depend on that staying true.
# A guard whose absence is invisible must not depend on someone remembering. Appends ONE
# marked block to ONE rc file, never rewrites what is already there, never fails the install.
SHIM_DIR="$REPO_DIR/bin/shim"
if [ "$(git -C "$REPO_DIR" config --local core.hooksPath 2>/dev/null || true)" = .githooks ]; then
  git -C "$REPO_DIR" config --local --unset core.hooksPath
fi

BIN_DIR="$REPO_DIR/bin"
RBIN_DIR="$REPO_DIR/ronin_bin"
# %q so a repo path with a space or a metacharacter still yields a line bash/zsh read back as
# one word; for an ordinary path it prints the path unchanged. It is also a valid literal
# pattern for the ${PATH#…} form below.
SHIM_Q="$(printf '%q' "$SHIM_DIR")"
BIN_Q="$(printf '%q' "$BIN_DIR")"
RBIN_Q="$(printf '%q' "$RBIN_DIR")"
# The tool directories travel as ONE unit in every line: shim first, then ronin_bin, then bin.
TOOLS_Q="$RBIN_Q:$BIN_Q"
PATH_LINE_BOTH="export PATH=$SHIM_Q:$TOOLS_Q:\"\$PATH\""
# Only the tools are missing: an earlier line (often a hand-added one) already prepends the
# shim, so a plain prepend here would land the tools IN FRONT of it. Re-stating the shim and
# stripping the copy that line just put at the head keeps the order shim → tools → rest with
# ONE shim entry.
PATH_LINE_BIN="export PATH=$SHIM_Q:$TOOLS_Q:\"\${PATH#$SHIM_Q:}\""
# Only the shim is missing: prepending puts it ahead of everything, bin/ included.
PATH_LINE_SHIM="export PATH=$SHIM_Q:\"\$PATH\""
SHIM_BEGIN="# >>> ronin PATH (added by setup.sh) >>>"
SHIM_END="# <<< ronin PATH <<<"
real_of() { (cd "$1" 2>/dev/null && pwd -P) || printf '%s' "$1"; }
SHIM_REAL="$(real_of "$SHIM_DIR")"
BIN_REAL="$(real_of "$BIN_DIR")"
RBIN_REAL="$(real_of "$RBIN_DIR")"
echo "==> PATH: guard shims + Ronin's tools"

# Does <file> already put <dir> on PATH? Purely textual — an rc file is code and this must
# never eval it. Recognises a hand-written `export PATH="$HOME/…/bin/shim:$PATH"` as readily
# as our own line, and resolves symlinks so two spellings of one directory count once. The
# two directories are judged INDEPENDENTLY, and the comparison is per PATH entry, so
# `<repo>/bin/shim` never counts as `<repo>/bin` even though one contains the other. An entry
# for a DIFFERENT clone is not a match. Sets RC_HIT to the matching line.
RC_HIT=""
rc_has_dir() {
  local file="$1" want="$2" real="$3" line raw tok
  [ -f "$file" ] || return 1
  while IFS= read -r raw || [ -n "$raw" ]; do
    line="${raw#"${raw%%[![:space:]]*}"}"          # trim leading blanks
    case "$line" in ''|'#'*) continue ;; esac      # skip blanks and comments
    case "$line" in *PATH*) : ;; *) continue ;; esac
    line="${line//\"/}"; line="${line//\'/}"       # unquote
    line="${line//\$\{HOME\}/$HOME}"               # expand $HOME / ${HOME} / ~ textually
    line="${line//\$HOME/$HOME}"
    line="${line//\~\//$HOME/}"
    local -a fields=()                             # split on ':' only — a PATH entry may
    IFS=':' read -ra fields <<< "$line"            # contain a space; read -ra never globs
    for tok in ${fields[@]+"${fields[@]}"}; do
      tok="${tok%%;*}"                             # `PATH=…; export PATH`
      tok="${tok#*=}"                              # drop a leading `export PATH=`
      tok="${tok//\\/}"                            # unescape `…/re\ po/…`
      tok="${tok#"${tok%%[![:space:]]*}"}"         # trim blanks either side
      tok="${tok%"${tok##*[![:space:]]}"}"
      tok="${tok%/}"                               # trailing slash
      [ -n "$tok" ] || continue
      if [ "$tok" = "$want" ] ||
         { [ -d "$tok" ] && [ "$(cd "$tok" && pwd -P)" = "$real" ]; }; then
        RC_HIT="$raw"; return 0
      fi
    done
  done < "$file"
  return 1
}

# Which rc file? Chosen from $SHELL — the login shell, i.e. the one that will actually read
# it — never "every file we can find". zsh reads ~/.zshrc always; bash on macOS starts LOGIN
# shells that read ~/.bash_profile and never ~/.bashrc. A shell whose rc is not sh-syntax
# (fish, tcsh) gets the line printed rather than a line it cannot parse.
#
# BASH NEEDS TWO FILES, AND ONE OF THEM WAS MISSING FOR MONTHS. The stock ~/.bashrc opens
# with the Debian/Ubuntu guard
#
#     case $- in *i*) ;; *) return;; esac
#
# so a NON-INTERACTIVE bash — `bash -c`, a script, an agent CLI shelling out, a systemd
# ExecStart — returns before it reaches anything we appended, and BOTH GUARDS ARE INERT
# there: /usr/bin/tmux wins and kill-server is not
# refused. A guard whose absence is invisible must not also be conditional on a shell flag.
# Appending BEFORE that guard is not an option; this script is append-only by design, and
# rewriting somebody's rc file to install a safety feature is worse than the gap.
#
# So the block goes in ~/.profile as well — read by LOGIN shells whether or not they are
# interactive, which covers the whole descendant tree of a login session, since a child
# process inherits PATH through the environment. The one case neither file reaches is a
# non-interactive, non-login bash whose parent's PATH was never fixed; that needs BASH_ENV,
# and setting that for a user's whole account to install a speed bump is out of proportion.
# Two files, honestly stated, is the answer — RC_WHY says which and why on the day.
RC=""; RC_WHY=""; RC_ALSO=""; RC_ALSO_WHY=""; RC_PEERS=()
case "$(basename "${SHELL:-}")" in
  zsh)
    RC="$HOME/.zshrc"; RC_WHY="\$SHELL is zsh; ~/.zshrc is read by every interactive zsh"
    # zsh has no interactivity guard of its own, but ~/.zshrc is still interactive-only.
    RC_ALSO="$HOME/.zprofile"; RC_ALSO_WHY="login zsh, interactive or not"
    RC_PEERS=("$HOME/.zprofile" "$HOME/.zshenv" "$HOME/.zlogin") ;;
  bash|sh|'')
    if [ "$OS" = "Darwin" ] && [ ! -f "$HOME/.bashrc" ]; then
      RC="$HOME/.bash_profile"; RC_WHY="bash on macOS: Terminal starts LOGIN shells, which read ~/.bash_profile, not ~/.bashrc"
    else
      RC="$HOME/.bashrc"; RC_WHY="\$SHELL is bash; ~/.bashrc is read by INTERACTIVE bash only"
      RC_ALSO="$HOME/.profile"; RC_ALSO_WHY="login bash, interactive or not — ~/.bashrc returns early when it is not"
    fi
    [ -n "${SHELL:-}" ] || RC_WHY="\$SHELL is unset — assuming bash. $RC_WHY"
    RC_PEERS=("$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile") ;;
  *)
    RC=""; RC_WHY="\$SHELL is $SHELL — setup.sh only knows sh-syntax rc files" ;;
esac

manual_shim() {                                    # never fails the install: say the line
  ronin_say "    $1"
  ronin_say "    Put this in your shell's rc file by hand (the shim must come BEFORE /usr/bin):"
  ronin_say "      $PATH_LINE_BOTH"
}

OUTSIDE_RC_FILES=()

if [ ! -d "$SHIM_DIR" ]; then
  echo "    SKIPPED: $SHIM_DIR not found — nothing to put on PATH."
elif [ -z "$RC" ]; then
  manual_shim "SKIPPED: $RC_WHY."
else
  # Each directory is looked for on its own, so a box that already has some gets only the rest.
  # The two tool dirs count as ONE unit: a box carrying bin/ but not ronin_bin/ (a block from
  # before the split of the two) is treated as tools-missing and gets the full tools line —
  # the old block's bin/ entry stays behind it, a harmless duplicate PATH entry.
  SHIM_AT=""; SHIM_HIT=""; BIN_AT=""; BIN_HIT=""; RBIN_AT=""
  for f in "$RC" ${RC_PEERS[@]+"${RC_PEERS[@]}"}; do
    if [ -z "$SHIM_AT" ] && rc_has_dir "$f" "$SHIM_DIR" "$SHIM_REAL"; then SHIM_AT="$f"; SHIM_HIT="$RC_HIT"; fi
    if [ -z "$BIN_AT" ]  && rc_has_dir "$f" "$BIN_DIR"  "$BIN_REAL";  then BIN_AT="$f";  BIN_HIT="$RC_HIT";  fi
    if [ -z "$RBIN_AT" ] && rc_has_dir "$f" "$RBIN_DIR" "$RBIN_REAL"; then RBIN_AT="$f"; fi
  done
  TOOLS_AT=""
  [ -n "$BIN_AT" ] && [ -n "$RBIN_AT" ] && TOOLS_AT="$BIN_AT"

  PATH_LINE=""; PATH_ADDS=""; BLOCK_NOTE=""
  if [ -n "$SHIM_AT" ] && [ -n "$TOOLS_AT" ]; then
    echo "    already on PATH:"
    echo "      $SHIM_DIR  <-  $SHIM_AT"
    echo "      $RBIN_DIR + $BIN_DIR  <-  $TOOLS_AT"
  elif [ -n "$SHIM_AT" ]; then
    PATH_LINE="$PATH_LINE_BIN"; PATH_ADDS="$RBIN_DIR and $BIN_DIR"
    BLOCK_NOTE="# bin/shim is already prepended earlier in this file (or in a sibling rc); the"$'\n'"# \${PATH#…} strip keeps ONE shim entry and puts the tool dirs directly behind it."
    echo "    bin/shim already on PATH via $SHIM_AT:"
    echo "      $SHIM_HIT"
    echo "    adding $RBIN_DIR (Agent tools) and $BIN_DIR (house tools) behind it."
  elif [ -n "$TOOLS_AT" ]; then
    PATH_LINE="$PATH_LINE_SHIM"; PATH_ADDS="$SHIM_DIR"
    BLOCK_NOTE="# the tool dirs are already on PATH via $TOOLS_AT; prepending the shim puts it ahead of them too."
    echo "    the tool dirs already on PATH via $TOOLS_AT; adding the shim ahead of them."
  else
    PATH_LINE="$PATH_LINE_BOTH"; PATH_ADDS="$SHIM_DIR, $RBIN_DIR and $BIN_DIR"
  fi
  # An entry that lands after $PATH is on PATH and still inert — the guards only bite ahead
  # of /usr/bin. Checked for the shim, where position is the whole point.
  case "$SHIM_HIT" in
    *'$PATH'*bin/shim*)
      echo "    WARNING: that entry adds the shims AFTER \$PATH, so /usr/bin/tmux still wins."
      echo "    Prepend instead — the guards only bite ahead of /usr/bin:"
      echo "      $PATH_LINE_BOTH" ;;
  esac

  # Appended, never rewritten: nothing already in the file moves or changes. Appending at
  # the END also means no line already there can undo it. Creating the file when absent is
  # right — it is a standard rc for this shell, the shell reads it if present, and a file
  # holding only this block behaves exactly as no file did before.
  append_block() {                                 # $1 = file, $2 = the export line, $3 = note
    {
      printf '\n%s\n' "$SHIM_BEGIN"
      printf '%s\n' "# bin/shim/tmux makes tmux kill-server unavailable. It is INERT unless this"
      printf '%s\n' "# directory comes before /usr/bin, which is why it is PREPENDED and stays FIRST."
      printf '%s\n' "# ronin_bin holds Agent-facing tools and bin holds the house's own scripts"
      printf '%s\n' "# (including koshi) — all typed by bare name, so both stay on PATH."
      printf '%s\n' "#  Safe to delete this block."
      [ -z "$3" ] || printf '%s\n' "$3"
      printf '%s\n' "$2"
      printf '%s\n' "$SHIM_END"
    } >> "$1" 2>/dev/null
  }
  writable_rc() {                                  # can we append to $1, creating it if need be?
    if [ -e "$1" ]; then [ -w "$1" ]; else [ -w "$(dirname "$1")" ]; fi
  }

  if [ -z "$PATH_LINE" ]; then
    :                                              # nothing to add
  elif [ -e "$RC" ] && [ ! -w "$RC" ]; then
    manual_shim "LEFT ALONE: $RC is not writable."
  elif [ ! -e "$RC" ] && [ ! -w "$(dirname "$RC")" ]; then
    manual_shim "LEFT ALONE: cannot create $RC (directory not writable)."
  elif append_block "$RC" "$PATH_LINE" "$BLOCK_NOTE"; then
    OUTSIDE_RC_FILES+=("$RC")
    echo "    added $PATH_ADDS to $RC  ($RC_WHY)"
    echo "      $PATH_LINE"
  else
    manual_shim "LEFT ALONE: could not append to $RC."
  fi

  # THE SECOND FILE. Decided on its own contents, never on the first file's: these two are
  # read by different shells in different situations, and "it is already in ~/.bashrc" is
  # exactly the reasoning that left every non-interactive shell unguarded. Skipped only when
  # this file itself already carries the directories.
  if [ -n "$RC_ALSO" ] && [ "$RC_ALSO" != "$RC" ]; then
    if rc_has_dir "$RC_ALSO" "$SHIM_DIR" "$SHIM_REAL" && rc_has_dir "$RC_ALSO" "$BIN_DIR" "$BIN_REAL"; then
      echo "    $RC_ALSO already carries both ($RC_ALSO_WHY)."
    elif ! writable_rc "$RC_ALSO"; then
      ronin_say "    LEFT ALONE: cannot append to $RC_ALSO — put this in it by hand:"
      ronin_say "      $PATH_LINE_BOTH"
    elif append_block "$RC_ALSO" "$PATH_LINE_BIN" \
        "# ALSO here, not only in $(basename "$RC"): that file returns early for a NON-interactive"$'\n'"# shell, so the guards would be inert for scripts and agent CLIs. This file is read by"$'\n'"# login shells whichever they are. A shell that reads BOTH files ends up with these two"$'\n'"# directories twice — harmless, because what the guards need is the shim FIRST, and the"$'\n'"# \${PATH#…} strip keeps it there."; then
      OUTSIDE_RC_FILES+=("$RC_ALSO")
      echo "    added $SHIM_DIR and $BIN_DIR to $RC_ALSO  ($RC_ALSO_WHY)"
    else
      ronin_say "    LEFT ALONE: could not append to $RC_ALSO. Put this in it by hand:"
      ronin_say "      $PATH_LINE_BOTH"
    fi
  fi

  echo "    NOTE: rc files are read at shell START — this shell and every session already"
  echo "    open keep the old PATH. For the current shell, run:"
  echo "      $PATH_LINE_BOTH"
  echo "    Check any shell with:  command -v tmux work-record"
  echo "      -> $SHIM_DIR/tmux  and  $RBIN_DIR/work-record"
fi

# --- PATH: where an agent Ronin installs lands ---
# Ronin can install an agent CLI for the owner (the install operation, src/agent-install.ts).
# `npm install -g` puts the command in the NODE PREFIX's bin, and Ronin's prefix is ~/.local —
# the standard user-level prefix, needing no root, outside every release directory (ronin-update
# swaps releases, so anything under vendor/ would vanish at the next update), and already where
# Claude Code's own installer puts itself.
#
# THE INSTALL IS NOTHING WITHOUT THIS LINE. The agent probe asks a LOGIN SHELL (src/agents.ts),
# because a login shell's PATH is the PATH a pane gets — so an install into a prefix no rc file
# mentions succeeds silently and the row says "not installed" forever.
#
# APPENDED, not prepended: the owner's own copy of an agent must win over one we fetched. The
# shim block above prepends because a guard that is not first is inert; this is a fallback and
# must never shadow. And the directory is CREATED here, because Debian's stock ~/.profile adds
# ~/.local/bin to PATH only when it already exists at login.
AGENT_PREFIX="$HOME/.local"
AGENT_BIN="$AGENT_PREFIX/bin"
echo "==> PATH: where an installed agent lands ($AGENT_BIN)"
mkdir -p "$AGENT_BIN" 2>/dev/null || true
# A bundled release carries its own Node and the box may have no other. Every npm-installed
# agent starts `#!/usr/bin/env node`, so without this the install succeeds and the command dies
# on its first line. In a checkout NODE_DIR is the system Node and is already on PATH.
AGENT_DIRS=("$AGENT_BIN")
[ "$BUNDLED" = 1 ] && AGENT_DIRS+=("$NODE_DIR")
AGENT_TAIL=""
for d in "${AGENT_DIRS[@]}"; do AGENT_TAIL="$AGENT_TAIL:$(printf '%q' "$d")"; done
AGENT_LINE="export PATH=\"\$PATH\"$AGENT_TAIL"
AGENT_BEGIN="# >>> ronin agent PATH (added by setup.sh) >>>"
AGENT_END="# <<< ronin agent PATH <<<"

agent_append() {                                   # $1 = file
  {
    printf '\n%s\n' "$AGENT_BEGIN"
    printf '%s\n' "# Where an agent CLI installed by Ronin lands (npm prefix $AGENT_PREFIX), and the"
    printf '%s\n' "# runtime that runs it. APPENDED, so your own copy of an agent always wins over ours."
    printf '%s\n' "# Without this the probe cannot see what Ronin installed and a pane cannot run it."
    printf '%s\n' "# Why: $REPO_DIR/src/agent-install.ts.  Safe to delete this block."
    printf '%s\n' "$AGENT_LINE"
    printf '%s\n' "$AGENT_END"
  } >> "$1" 2>/dev/null
}

if [ -z "$RC" ]; then
  ronin_say "    SKIPPED: $RC_WHY. Put this in your shell's rc file by hand:"
  ronin_say "      $AGENT_LINE"
else
  for f in "$RC" ${RC_ALSO:+"$RC_ALSO"}; do
    missing=0
    for d in "${AGENT_DIRS[@]}"; do
      rc_has_dir "$f" "$d" "$(real_of "$d")" || missing=1
    done
    if [ "$missing" = 0 ]; then
      echo "    already on PATH via $f"
    elif ! { [ -e "$f" ] && [ -w "$f" ]; } && ! { [ ! -e "$f" ] && [ -w "$(dirname "$f")" ]; }; then
      ronin_say "    LEFT ALONE: cannot append to $f — put this in it by hand:"
      ronin_say "      $AGENT_LINE"
    elif agent_append "$f"; then
      OUTSIDE_RC_FILES+=("$f")
      echo "    added ${AGENT_DIRS[*]} to $f"
    else
      ronin_say "    LEFT ALONE: could not append to $f. Put this in it by hand:"
      ronin_say "      $AGENT_LINE"
    fi
  done
  echo "    NOTE: read at shell START. For this shell:  $AGENT_LINE"
fi

# --- autostart ---
# ONE SOURCE OF TRUTH PER UNIT. The unit files live in deploy/*.service with
# __REPO_DIR__ / __NODE_DIR__ placeholders; setup.sh only fills those in. It used to
# keep its own inline copy instead, and the copy silently drifted: the render gate
# (ExecStartPost=-… libexec/ronin-gate &, added after the 2026-08-08 outage) existed only
# in the deploy/ unit file, so no box installed by setup.sh ever ran it.
# Read deploy/tmux-server.service before touching it — that unit owns the tmux server,
# and every session on the box lives in its cgroup.

# Replace every literal occurrence of $2 in $1 with $3, on stdout. Deliberately not
# `sed` and not `${var//…}`: a repo path may contain '#', '&' or a backslash, all of
# which those two rewrite (sed: delimiter and "the whole match"; bash 5.2+: '&' means
# the match unless patsub_replacement is off). Prefix/suffix removal with a quoted
# needle is literal in every bash, so spaces and metacharacters pass through as typed.
subst_literal() {
  local text="$1" needle="$2" value="$3" out=""
  while [ -n "$text" ]; do
    case "$text" in
      *"$needle"*)
        out="$out${text%%"$needle"*}$value"
        text="${text#*"$needle"}"
        ;;
      *) out="$out$text"; text="" ;;
    esac
  done
  printf '%s' "$out"
}

# render_unit <template> <destination>
render_unit() {
  local src="$1" dest="$2" text repo="$REPO_DIR" node="$NODE_DIR" tmux="$TMUX_BIN" tmux_dir="$TMUX_DIR"
  [ -f "$src" ] || { echo "ERROR: unit template not found: $src"; exit 1; }
  case "$src" in *.plist)
    repo="$(printf '%s' "$repo" | sed 's/\&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')"
    node="$(printf '%s' "$node" | sed 's/\&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')"
    tmux="$(printf '%s' "$tmux" | sed 's/\&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')"
    tmux_dir="$(printf '%s' "$tmux_dir" | sed 's/\&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')"
  esac
  text="$(<"$src")"                       # command substitution eats trailing newlines
  text="$(subst_literal "$text" '__REPO_DIR__' "$repo")"
  text="$(subst_literal "$text" '__NODE_DIR__' "$node")"
  text="$(subst_literal "$text" '__TMUX_BIN__' "$tmux")"
  text="$(subst_literal "$text" '__TMUX_DIR__' "$tmux_dir")"
  # A template that grows a placeholder setup.sh doesn't know about would otherwise
  # install a unit with a literal __THING__ in it. Say so; don't fail the install.
  if [[ "$text" =~ __[A-Z][A-Z0-9_]*__ ]]; then
    echo "    WARNING: $src still contains ${BASH_REMATCH[0]} — setup.sh does not substitute it."
  fi
  printf '%s\n' "$text" > "$dest"         # …so put exactly one back
  echo "    $dest  <-  ${src#"$REPO_DIR"/}"
}

if [ "$OS" = "Linux" ] && command -v systemctl >/dev/null; then
  UNIT_DIR="$HOME/.config/systemd/user"
  mkdir -p "$UNIT_DIR"
  echo "==> rendering systemd units from deploy/*.service"
  render_unit "$REPO_DIR/deploy/tmux-server.service" "$UNIT_DIR/tmux-server.service"
  render_unit "$REPO_DIR/deploy/ronin.service"       "$UNIT_DIR/ronin.service"
  # One-time migration: the operator unit was named tmux-ronin.service until 2026-08-19,
  # after the frozen unified repo (KOTOBA: ronin_legacy). Retire it before the reload so
  # only one unit ever points at this box.
  if [ -f "$UNIT_DIR/tmux-ronin.service" ]; then
    systemctl --user disable --now tmux-ronin 2>/dev/null || true
    rm -f "$UNIT_DIR/tmux-ronin.service"
    echo "==> retired the old unit name tmux-ronin.service — this box now runs ronin.service"
  fi
  systemctl --user daemon-reload
  systemctl --user enable --now tmux-server
  # `enable --now` is a no-op on a unit that is already running — but the unit file was
  # just re-rendered, so a live ronin must be RESTARTED or the box keeps running
  # the old tree while the unit points at the new one (BYOKI). tmux-server is never
  # restarted here: that unit owns every live session on the box.
  if systemctl --user is-active --quiet ronin; then
    systemctl --user enable ronin
    node "$REPO_DIR/scripts/guard-dev-restart.mjs" "$REPO_DIR"
    systemctl --user restart ronin
    echo "==> Ronin was already running: restarted onto the freshly rendered unit"
  else
    systemctl --user enable --now ronin
  fi
  echo "==> systemd --user services 'tmux-server' + 'ronin' installed and started"
  echo "    logs:   journalctl --user -u ronin -f"
  echo "    status: systemctl --user status ronin"
elif [ "$OS" = "Darwin" ]; then
  . "$REPO_DIR/libexec/ronin-machine.sh"
  LA_DIR="$HOME/Library/LaunchAgents"
  mkdir -p "$LA_DIR"
  echo "==> rendering launchd agent from deploy/com.ronin.plist"
  render_unit "$REPO_DIR/deploy/com.ronin.plist" "$LA_DIR/com.ronin.plist"
  chmod 644 "$LA_DIR/com.ronin.plist"
  LA_DOMAIN="$(machine_launchd_domain com.ronin)"
  if [ -f "$LA_DIR/com.tmux-ronin.plist" ]; then
    OLD_DOMAIN="$(machine_launchd_domain com.tmux-ronin)"
    if launchctl print "$OLD_DOMAIN/com.tmux-ronin" >/dev/null 2>&1; then
      launchctl bootout "$OLD_DOMAIN/com.tmux-ronin"
    fi
    rm "$LA_DIR/com.tmux-ronin.plist"
  fi
  if launchctl print "$LA_DOMAIN/com.ronin" >/dev/null 2>&1; then
    launchctl bootout "$LA_DOMAIN/com.ronin"
  fi
  launchctl enable "$LA_DOMAIN/com.ronin"
  launchctl bootstrap "$LA_DOMAIN" "$LA_DIR/com.ronin.plist"
  launchctl kickstart "$LA_DOMAIN/com.ronin"
  echo "==> Ronin installed and started automatically"
  echo "    status: launchctl print $LA_DOMAIN/com.ronin"
else
  echo "==> No systemd/launchd detected. Start manually with: npm start"
fi

# Both platforms offer local HTTP and, when configured, private Tailscale HTTPS.
BACKEND_IP="$(ronin_bind "$REPO_DIR")"
export RONIN_BACKEND_HOST="$BACKEND_IP" RONIN_PUBLIC_PORT=4810
PORT="$(ronin_port "$REPO_DIR")"
HTTP_URL="$(ronin_http_url "$REPO_DIR")"
OPEN_URL="$(ronin_open_url "$REPO_DIR" "$PORT")"
if [ "$OS" = Darwin ] && [ -z "$OPEN_URL" ] &&
   command -v tailscale >/dev/null 2>&1 && tailscale ip -4 >/dev/null 2>&1; then
  tailscale serve --bg --https=4810 "$HTTP_URL" || true
  OPEN_URL="$(ronin_open_url "$REPO_DIR" "$PORT")"
fi

if ! "$NODE_DIR/node" "$REPO_DIR/libexec/ronin-wait-ready.cjs" "$HTTP_URL"; then
  out ""
  out "  Ronin is installed, but it did not start answering at:"
  out "  $HTTP_URL"
  out "  Install details: $RONIN_SETUP_LOG"
  out ""
  exit 1
fi
if [ -n "$OPEN_URL" ] && ! "$NODE_DIR/node" "$REPO_DIR/libexec/ronin-wait-ready.cjs" "$OPEN_URL"; then
  out "  Tailscale HTTPS is not answering yet. Ronin is available over HTTP on this computer."
  OPEN_URL=""
fi
"$REPO_DIR/libexec/ronin-open-browser" "$HTTP_URL" || true

MACHINE_WARNING=""
if [ -n "${RONIN_MACHINE_RESULT:-}" ] && [ -s "$RONIN_MACHINE_RESULT" ]; then
  MACHINE_WARNING="Some machine protections did not complete; run ronin-doctor after setup."
fi
ronin_banner "$REPO_DIR" "$OPEN_URL" "$RONIN_SETUP_LOG" "$MACHINE_WARNING" >&3
