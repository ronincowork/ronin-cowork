#!/usr/bin/env bash

# The path this tool was REACHED BY, kept before the links are followed. A born session
# runs its tools through its own command directory — <session-commands>/<session>/<tool>
# — so this path names the session, and ronin_session_me below reads it.
RONIN_TOOL_INVOKED=${BASH_SOURCE[1]}

ronin_tool_source=${BASH_SOURCE[1]}
while [ -L "$ronin_tool_source" ]; do
  ronin_tool_link=$(readlink "$ronin_tool_source")
  case $ronin_tool_link in
    /*) ronin_tool_source=$ronin_tool_link ;;
    *) ronin_tool_source=$(dirname "$ronin_tool_source")/$ronin_tool_link ;;
  esac
done
SELF=$ronin_tool_source
unset ronin_tool_source ronin_tool_link

# WHICH SESSION AM I — and it must NEVER guess.
#
# The one resolver for every tool that acts on its own session's record. It once lived
# as a copy in each tool, and each copy had a fallback that answered for the ATTACHED
# CLIENT — whichever tile the owner had focused — and wrote one session's ladder into
# another's letter. Three sources, each authoritative, none the attached client, tried
# in this order:
#   TMUX_PANE  the pane this shell runs in -> its window -> the non-viewer session holding it
#   $TMUX      socket,pid,SESSION_ID — set for any process started inside a session
#   the path   <session-commands>/<session>/<tool>: the directory a born session reaches
#              its tools through names that session. Some agents' tool shells are not
#              started inside tmux and carry neither variable; this is how they still
#              know whose letter it is. It is truth about how the tool was reached, not
#              a guess, and it is accepted ONLY when the name is a live non-viewer tmux
#              session — invoked by its real path the parent is ronin_bin, which is no
#              session and falls through.
# grid_* sessions are browser viewers of a pane, several per tile, and never the answer.
# If nothing answers, return 1: the caller refuses in its own words. Nothing here picks
# the one on screen.
ronin_session_me() {
  local win s sid dir
  if [ -n "${TMUX_PANE:-}" ]; then
    win=$(tmux display-message -p -t "$TMUX_PANE" '#{window_id}' 2>/dev/null) || win=""
    if [ -n "$win" ]; then
      s=$(tmux list-windows -a -F '#{session_name}	#{window_id}' 2>/dev/null \
          | awk -F'	' -v w="$win" '$2==w && $1 !~ /^grid_/ {print $1; exit}')
      [ -n "$s" ] && { printf '%s\n' "$s"; return 0; }
    fi
  fi
  if [ -n "${TMUX:-}" ]; then
    sid=${TMUX##*,}
    s=$(tmux list-sessions -F '#{session_id}	#{session_name}' 2>/dev/null \
        | awk -F'	' -v i="\$$sid" '$1==i && $2 !~ /^grid_/ {print $2; exit}')
    [ -n "$s" ] && { printf '%s\n' "$s"; return 0; }
  fi
  if [ -n "${RONIN_TOOL_INVOKED:-}" ]; then
    dir=$(cd "$(dirname "$RONIN_TOOL_INVOKED")" 2>/dev/null && pwd) || dir=""
    dir=${dir##*/}
    if [ -n "$dir" ]; then
      s=$(tmux list-sessions -F '#{session_name}' 2>/dev/null \
          | awk -F'	' -v n="$dir" '$1==n && $1 !~ /^grid_/ {print $1; exit}')
      [ -n "$s" ] && { printf '%s\n' "$s"; return 0; }
    fi
  fi
  return 1
}
