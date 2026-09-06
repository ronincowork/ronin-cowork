# ronin-http.sh — sourced by the shell tools that talk to the operator. Not a tool.
#
#   . "$TOOL_DIR/ronin-http.sh"
#   ronin_connect || exit $?
#   ... "${RONIN_CURL[@]+"${RONIN_CURL[@]}"}" "$url/api/whatever"
#
# ronin_connect resolves the operator through the sibling ronin-url (the one resolver) and
# sets two things: `url`, the base every request is built on, and `RONIN_CURL`, the
# transport options that go before it. Over the operator's socket the base is a placeholder
# host and the option names the socket; over RONIN_URL the base is that URL and the options
# carry RONIN_CLI_TOKEN as a bearer and RONIN_AUTH as HTTP Basic, when set. Callers never
# know which they got, which is the point.
ronin_connect() {
  local target
  target=$("$TOOL_DIR/ronin-url") || return $?
  RONIN_CURL=()
  case $target in
    http://*|https://*)
      url=${target%/}
      [ -n "${RONIN_CLI_TOKEN:-}" ] && RONIN_CURL+=(-H "Authorization: Bearer $RONIN_CLI_TOKEN")
      [ -n "${RONIN_AUTH:-}" ] && RONIN_CURL+=(-u "$RONIN_AUTH")
      ;;
    *)
      url=http://ronin
      RONIN_CURL=(--unix-socket "$target")
      ;;
  esac
  return 0
}
