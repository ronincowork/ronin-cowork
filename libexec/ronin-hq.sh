#!/bin/sh
# RONIN HQ — the authorized services fetch, in its own file so it can be tested.
#
# Sourced by bin/ronin-update. It lives here rather than inside the updater because the
# grant seam is the part most worth proving end to end, and a function buried in a script
# that installs things cannot be exercised without installing things.
#
# Requires from the caller: say(), fail(), HOME_DIR.

# --- Ronin HQ: the authorized services path ----------------------------------
#
# When this install holds an entitlement token, services come from SHIWAKE instead of
# the public feed: ask which release matches the contract we answer, spend a short-lived
# grant, download the granted artifact.
#
# THE VERIFICATION DOES NOT CHANGE. The manifest's sha256 is written into a SHA256SUMS
# beside the tarball, so the existing checksum step below runs exactly as it always has,
# and the contract check after it is untouched. A grant authorises a fetch; it never
# certifies an artifact, and an updater that stopped checking because a download was
# authorised would have removed the check that catches a corrupted transfer.
#
# The public feed stays as the fallback. The owner ruled that download ungated, and a box
# with no entitlement must still be able to install.
HQ_BASE="${RONIN_HQ_BASE:-https://hq.ronincowork.com}"

hq_token() {
  store="$(ronin-store services_secrets 2>/dev/null || true)"
  [ -n "$store" ] && [ -r "$store/entitlement_token" ] || return 1
  tok="$(cat "$store/entitlement_token" 2>/dev/null | tr -d '\r\n')"
  [ -n "$tok" ] || return 1
  printf '%s' "$tok"
}

# The contract this cowork answers. Asked BEFORE choosing a release, because "current"
# means current *for this contract* — a newer artifact we cannot speak is not an upgrade.
cowork_contract() {
  sed -n 's/^export const CONTRACT_V = \([0-9][0-9]*\);.*/\1/p' \
    "$HOME_DIR/current/src/sockets-contract.ts" 2>/dev/null
}

hq_json() { # $1=body $2=key   — one field out of a flat JSON object, no jq dependency
  printf '%s' "$1" | sed -n "s/.*\"$2\": *\"\([^\"]*\)\".*/\1/p" | head -1
}

# Fetch the authorized release into $1 (workdir). Echoes the version; returns 1 if HQ
# has nothing for us or cannot be reached, so the caller can fall back.
hq_fetch_services() {
  work="$1"
  tok="$(hq_token)" || return 1
  contract="$(cowork_contract)"
  [ -n "$contract" ] || { say "no contract number readable — not asking Ronin HQ"; return 1; }

  cur="$(curl -fsS -m 20 -H "authorization: Bearer $tok" \
    "$HQ_BASE/v1/services/releases/current?contract_version=$contract" 2>/dev/null)" || return 1
  rel="$(hq_json "$cur" release_id)"
  ver="$(hq_json "$cur" version)"
  sha="$(hq_json "$cur" sha256)"
  # "release": null is a real answer: nothing published for our contract. Up to date.
  [ -n "$rel" ] && [ -n "$ver" ] && [ -n "$sha" ] || return 1

  grant_body="$(curl -fsS -m 20 -X POST \
    -H "authorization: Bearer $tok" -H 'content-type: application/json' \
    -d "{\"release_id\":\"$rel\"}" \
    "$HQ_BASE/v1/services/releases/grant" 2>/dev/null)" || return 1
  grant="$(hq_json "$grant_body" grant)"
  [ -n "$grant" ] || return 1

  name="services-$ver.tar.gz"
  curl -fsSL -m 300 -o "$work/$name" \
    "$HQ_BASE/v1/services/releases/$rel/artifact?grant=$grant" 2>/dev/null || return 1

  # The checksum comes from the AUTHENTICATED manifest, not from beside the download.
  # Writing it here means the existing verification step runs unchanged.
  printf '%s  %s\n' "$sha" "$name" > "$work/SHA256SUMS"
  printf '%s' "$ver"
}

