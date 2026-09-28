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

# ronin_item_call METHOD PATH [JSON] — one work item request, printed for the caller: the
# acknowledgement first, then the item as it now is (or the reply of a read); with
# ITEM_ACK_ONLY=1 the acknowledgement alone. An error goes to stderr with exit 3; a
# refusal (the one refusal: a reparent cycle) exits 4.
ronin_item_call() {
  local method=$1 path=$2 body=${3-} out
  local args=(-sS -m 30 "${RONIN_CURL[@]+"${RONIN_CURL[@]}"}" -X "$method")
  [ -z "$body" ] || args+=(-H 'content-type: application/json' --data "$body")
  out=$(curl "${args[@]}" "$url$path") || { echo "UNREACHABLE: Ronin did not answer at $url" >&2; return 5; }
  REPLY_JSON=$out python3 -c '
import json, os, sys
try: d = json.loads(os.environ["REPLY_JSON"])
except Exception: print("REFUSED: Ronin returned an invalid answer", file=sys.stderr); sys.exit(4)
if d.get("error"):
    print(d["error"], file=sys.stderr); sys.exit(4 if d.get("refused") else 3)
if d.get("acknowledgement"):
    print(d["acknowledgement"])
    if os.environ.get("ITEM_ACK_ONLY") != "1": print(json.dumps(d.get("item"), indent=2, ensure_ascii=False))
else:
    d.pop("ok", None)
    print(json.dumps(d.get("item", d), indent=2, ensure_ascii=False))
'
}
