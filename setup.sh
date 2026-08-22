#!/usr/bin/env bash
#
# ronin-cowork setup — installs dependencies and an always-on autostart service.
# Run from the repo root:   ./setup.sh
#
# Works on Linux (systemd --user) and macOS (prints launchd steps). No root needed
# for the app itself; only the optional `tailscale serve` and `enable-linger` steps
# below use sudo.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# The install talks to a log, not to the person. fd 3 is the terminal, kept for the
# banner at the end and for anything that actually needs them. RONIN_VERBOSE=1 puts the
# whole transcript back on screen.
RONIN_SETUP_LOG="${TMPDIR:-/tmp}/ronin-setup.log"
exec 3>&1
if [ -z "${RONIN_VERBOSE:-}" ]; then
  : > "$RONIN_SETUP_LOG" 2>/dev/null || RONIN_SETUP_LOG=/dev/null
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
  echo "    tailscale: not found (optional — it is what gives this box an HTTPS address)"
fi

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
  echo "==> created .env from .env.example (edit if you want auth / a different port)"
fi
# 600 OUTSIDE the create block, so a re-run repairs a box that installed before this line
# existed — which is every box that already has one. The file holds GRID_PASS and provider
# keys, and a ronin_machine's premise is many concurrent agent sessions under one Unix
# user: group-readable there means readable by every session on the box.
chmod 600 .env 2>/dev/null || true

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
  echo "    SKIPPED: python3 not found, cannot edit JSON safely. Add by hand to ~/.claude/settings.json:"
  echo "      \"statusLine\": { \"type\": \"command\", \"command\": \"$STATUSLINE_SH\" },"
  echo "      \"theme\": \"dark-ansi\""
else
  [ -x "$STATUSLINE_SH" ] || chmod +x "$STATUSLINE_SH" 2>/dev/null || true
  python3 "$CLAUDE_SETTINGS_PY" "$STATUSLINE_SH" || \
    echo "    WARNING: could not write ~/.claude/settings.json — add the two keys by hand."
fi

OS="$(uname -s)"   # also used by the autostart section below

# --- PATH: bin/shim (the guards), ronin_bin (the agent tools), bin (house scripts) ---
# THREE directories, and the order between them is deliberate.
#   <repo>/bin/shim  bin/shim/tmux enforces the @ronin-control dial before any tmux write
#                    lands and refuses kill-server while sessions are alive; bin/shim/systemctl
#                    refuses a destructive verb aimed at tmux-server.service, the unit that owns
#                    every tmux session on the box. BOTH ARE INERT unless this directory precedes
#                    /usr/bin, and until 2026-08-12 nothing in this installer put it there — so on
#                    the box Ronin was built on, neither guard had ever run.
#   <repo>/ronin_bin the agent-facing tools (tejun*) — what the catalogs tell agents to
#                    type by bare name. Off PATH they only work from the repo root, which
#                    no agent can rely on.
#   <repo>/bin       the owner's own commands (ronin-byoin, ronin-doctor, ronin-deploy,
#                    ronin-store, ronin-uninstall, ronin-export, bench) — typed by a
#                    person, so they are on PATH too. Not libexec/: nobody types those.
# The shim dir stays FIRST — ahead of bin/ as well as /usr/bin. bin/ holds no tmux and no
# systemctl today, and the guard's position must not depend on that staying true.
# A guard whose absence is invisible must not depend on someone remembering. Appends ONE
# marked block to ONE rc file, never rewrites what is already there, never fails the install.
SHIM_DIR="$REPO_DIR/bin/shim"

# The commit guard. core.hooksPath is LOCAL config, so it does not travel with a clone —
# without this line a fresh checkout has the hooks on disk and never runs them. See
# docs/shared-tree.md.
if [ -d "$REPO_DIR/.githooks" ]; then
  git -C "$REPO_DIR" config core.hooksPath .githooks 2>/dev/null \
    && echo "    commit guard: hooks wired (core.hooksPath=.githooks)"
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
# there: /usr/bin/tmux wins, the @ronin-control dial is not checked, and kill-server is not
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
  echo "    $1"
  echo "    Put this in your shell's rc file by hand (the shim must come BEFORE /usr/bin):"
  echo "      $PATH_LINE_BOTH"
}

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
    echo "    adding $RBIN_DIR (tejun*) and $BIN_DIR (write_tegami, read_tegami, koshi) behind it."
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
      printf '%s\n' "# bin/shim/tmux enforces the @ronin-control session dial and refuses kill-server"
      printf '%s\n' "# while sessions are live; bin/shim/systemctl refuses stopping tmux-server.service,"
      printf '%s\n' "# the unit that owns every tmux session on this box. Both are INERT unless that"
      printf '%s\n' "# directory comes before /usr/bin, which is why it is PREPENDED and stays FIRST."
      printf '%s\n' "# ronin_bin holds the agent-facing tools (tejun*) and bin the house's own scripts"
      printf '%s\n' "# (write_tegami, read_tegami, koshi) — all typed by bare name, so both stay on PATH."
      printf '%s\n' "# Speed bump, not physics: the real binaries are still there, but reaching them"
      printf '%s\n' "# becomes a deliberate, visible act. Why: $REPO_DIR/docs/session-control-dials.md"
      printf '%s\n' "# and $REPO_DIR/docs/tmux-server-cgroup.md.  Safe to delete this block."
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
      echo "    LEFT ALONE: cannot append to $RC_ALSO — put this in it by hand:"
      echo "      $PATH_LINE_BOTH"
    elif append_block "$RC_ALSO" "$PATH_LINE_BIN" \
        "# ALSO here, not only in $(basename "$RC"): that file returns early for a NON-interactive"$'\n'"# shell, so the guards would be inert for scripts and agent CLIs. This file is read by"$'\n'"# login shells whichever they are. A shell that reads BOTH files ends up with these two"$'\n'"# directories twice — harmless, because what the guards need is the shim FIRST, and the"$'\n'"# \${PATH#…} strip keeps it there."; then
      echo "    added $SHIM_DIR and $BIN_DIR to $RC_ALSO  ($RC_ALSO_WHY)"
    else
      echo "    LEFT ALONE: could not append to $RC_ALSO."
    fi
  fi

  echo "    NOTE: rc files are read at shell START — this shell and every session already"
  echo "    open keep the old PATH. For the current shell, run:"
  echo "      $PATH_LINE_BOTH"
  echo "    Check any shell with:  command -v tmux write_tegami"
  echo "      -> $SHIM_DIR/tmux  and  $BIN_DIR/write_tegami"
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
  echo "    SKIPPED: $RC_WHY. Put this in your shell's rc file by hand:"
  echo "      $AGENT_LINE"
else
  for f in "$RC" ${RC_ALSO:+"$RC_ALSO"}; do
    missing=0
    for d in "${AGENT_DIRS[@]}"; do
      rc_has_dir "$f" "$d" "$(real_of "$d")" || missing=1
    done
    if [ "$missing" = 0 ]; then
      echo "    already on PATH via $f"
    elif ! { [ -e "$f" ] && [ -w "$f" ]; } && ! { [ ! -e "$f" ] && [ -w "$(dirname "$f")" ]; }; then
      echo "    LEFT ALONE: cannot append to $f — put this in it by hand:"
      echo "      $AGENT_LINE"
    elif agent_append "$f"; then
      echo "    added ${AGENT_DIRS[*]} to $f"
    else
      echo "    LEFT ALONE: could not append to $f."
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
  local src="$1" dest="$2" text
  [ -f "$src" ] || { echo "ERROR: unit template not found: $src"; exit 1; }
  text="$(<"$src")"                       # command substitution eats trailing newlines
  text="$(subst_literal "$text" '__REPO_DIR__' "$REPO_DIR")"
  text="$(subst_literal "$text" '__NODE_DIR__' "$NODE_DIR")"
  text="$(subst_literal "$text" '__TMUX_BIN__' "$TMUX_BIN")"
  text="$(subst_literal "$text" '__TMUX_DIR__' "$TMUX_DIR")"
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
    systemctl --user restart ronin
    echo "==> Ronin was already running: restarted onto the freshly rendered unit"
  else
    systemctl --user enable --now ronin
  fi
  echo "==> systemd --user services 'tmux-server' + 'ronin' installed and started"
  echo "    logs:   journalctl --user -u ronin -f"
  echo "    status: systemctl --user status ronin"
elif [ "$OS" = "Darwin" ]; then
  LA_DIR="$HOME/Library/LaunchAgents"
  mkdir -p "$LA_DIR"
  echo "==> rendering launchd agent from deploy/com.ronin.plist"
  render_unit "$REPO_DIR/deploy/com.ronin.plist" "$LA_DIR/com.ronin.plist"
  echo "    load it with:  launchctl load -w $LA_DIR/com.ronin.plist"
  if [ -f "$LA_DIR/com.tmux-ronin.plist" ]; then
    echo "    old agent found (renamed 2026-08-19) — retire it with:"
    echo "      launchctl unload -w $LA_DIR/com.tmux-ronin.plist && rm $LA_DIR/com.tmux-ronin.plist"
  fi
else
  echo "==> No systemd/launchd detected. Start manually with: npm start"
fi

# Work out this server's URLs so you don't have to guess them.
IP=""; FQDN=""
if command -v tailscale >/dev/null; then
  IP="$(tailscale ip -4 2>/dev/null | head -1 || true)"
  FQDN="$(tailscale status --json 2>/dev/null | "$NODE_DIR/node" -e \
    'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write((JSON.parse(d).Self.DNSName||"").replace(/\.$/,""))}catch{}})' 2>/dev/null || true)"
fi


# The box, and the address it names, are shared with bin/ronin-welcome, so redrawing
# it after `tailscale serve` runs cannot drift from what was printed here. One
# implementation of "which door is open", and it asks the machine rather than
# assuming: serve needs a sudo this script does not have.
# shellcheck source=libexec/ronin-banner.sh
. "$REPO_DIR/libexec/ronin-banner.sh"
export RONIN_IP="${IP:-}" RONIN_FQDN="${FQDN:-}"
PORT="$(ronin_port "$REPO_DIR")"
OPEN_URL="$(ronin_open_url "$REPO_DIR" "$PORT")"
ronin_banner "$REPO_DIR" "$OPEN_URL" >&3

# Only what is still outstanding on this box — and no prose dressed as a numbered
# step. A person at this prompt needs exactly three things: run this, here is the
# gap so you know what to copy, here is where you end up. (Owner, 2026-08-22: "copy
# and paste this line, put it in, and you will be good to go — then the new URL.")
SERVED_ALREADY="$(ronin_served_url "$PORT")"
STEP_CMD=(); NSTEPS=0
if command -v loginctl >/dev/null 2>&1 &&
   [ "$(loginctl show-user "$USER" --property=Linger --value 2>/dev/null || echo no)" != "yes" ]; then
  STEP_CMD[$NSTEPS]="sudo loginctl enable-linger $USER"
  NSTEPS=$(( NSTEPS + 1 ))
fi
# Nothing to ask for when serve already points at THIS install: the address in the box
# above is that mapping. Asking anyway is what put a second, different door on a box
# that already had one, and left the banner naming the other.
WANT_SERVE=""
if [ -z "$SERVED_ALREADY" ] && [ -n "${IP:-}" ] && command -v tailscale >/dev/null 2>&1; then
  STEP_CMD[$NSTEPS]="sudo tailscale serve --bg --https=8443 http://$IP:$PORT"
  NSTEPS=$(( NSTEPS + 1 ))
  WANT_SERVE=1
fi

if [ "$NSTEPS" = 1 ]; then
  out "  One more step. Copy and paste this line, and you're good to go:"
elif [ "$NSTEPS" -gt 1 ]; then
  out "  Two more steps. Copy and paste each line, one at a time:"
fi
if [ "$NSTEPS" -gt 0 ]; then
  out ""
  s=0
  while [ "$s" -lt "$NSTEPS" ]; do
    out "      ${STEP_CMD[$s]}"
    out ""
    s=$(( s + 1 ))
  done
  if [ -n "$WANT_SERVE" ] && [ -n "${FQDN:-}" ]; then
    out "  When that's done, your door is:"
    out ""
    out "      https://$FQDN:8443"
  else
    out "  When that's done, run  ronin-welcome  to see your address."
  fi
  out ""
fi

# Printed instructions above are the contract. On a local graphical desktop this is
# merely a convenience: wait for /api/health to answer 200, then ask the OS to open
# the page. SSH/headless detection and opener failures are non-fatal in the helper.
# Linux only, deliberately: macOS renders the launchd agent but the user loads it by
# hand, so setup.sh has no moment where the service is observably ready to open.
if [ "$OS" = "Linux" ]; then
  RONIN_READY=0
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if "$NODE_DIR/node" -e '
      const http = require("node:http");
      const req = http.get(process.argv[1] + "/api/health",
        r => { r.resume(); process.exit(r.statusCode === 200 ? 0 : 1); });
      req.setTimeout(500, () => req.destroy());
      req.on("error", () => process.exit(1));
    ' "$OPEN_URL" >/dev/null 2>&1; then
      RONIN_READY=1
      break
    fi
    sleep 1
  done
  if [ "$RONIN_READY" -eq 1 ]; then
    "$REPO_DIR/libexec/ronin-open-browser" "$OPEN_URL" || true
  fi
fi
