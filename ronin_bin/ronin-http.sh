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
# ITEM_ACK_ONLY=1 the acknowledgement alone. An error goes to stderr with exit 3, and a
# reply that is not JSON is reported with its HTTP status; a refusal (the hierarchy rule:
# "w39 can't go there.") exits 4.
ronin_item_call() {
  local method=$1 path=$2 body=${3-} out
  local args=(-sS -m 30 "${RONIN_CURL[@]+"${RONIN_CURL[@]}"}" -X "$method")
  [ -z "$body" ] || args+=(-H 'content-type: application/json' --data "$body")
  out=$(curl "${args[@]}" -w '\n%{http_code}' "$url$path") || { echo "UNREACHABLE: Ronin did not answer at $url" >&2; return 5; }
  printf '%s' "${out%$'\n'*}" | REPLY_STATUS=${out##*$'\n'} python3 -c '
import json, os, sys
try: d = json.loads(sys.stdin.read())
except Exception: print("HTTP %s: Ronin answered %s without JSON" % (os.environ["REPLY_STATUS"], sys.argv[1]), file=sys.stderr); sys.exit(3)
if d.get("error"):
    print(d["error"], file=sys.stderr); sys.exit(4 if d.get("refused") else 3)
if d.get("acknowledgement"):
    print(d["acknowledgement"])
    if os.environ.get("ITEM_ACK_ONLY") != "1" and d.get("item"): print(json.dumps(d["item"], indent=2, ensure_ascii=False))
else:
    d.pop("ok", None)
    out = d.get("item", d)
    if "held_by" in d: out = {**out, "held_by": d["held_by"]}
    if "linked_from" in d: out = {**out, "linked_from": d["linked_from"]}
    if "connection" in d: out = {**out, "connection": d["connection"]}
    if "children" in d: out = {**out, "children": [{k: c.get(k) for k in ("id", "title", "level", "kind", "priority", "status", "flagged")} for c in d["children"]]}
    print(json.dumps(out, indent=2, ensure_ascii=False))
' "$method $path"
}
