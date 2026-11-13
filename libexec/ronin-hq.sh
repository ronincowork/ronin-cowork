#!/bin/sh
# RONIN HQ — the services fetch, in its own file so it can be tested.
#
# Sourced by bin/ronin-update. It lives here rather than inside the updater because the
# grant seam is the part most worth proving end to end, and a function buried in a script
# that installs things cannot be exercised without installing things.
#
# Requires from the caller: say(), fail(), HOME_DIR.

# --- Ronin HQ: where services come from ---------------------------------------
#
# Services come from SHIWAKE and nowhere else on the network (owner, 7 Nov 2026, KAN-323:
# the release feed is private; there is no anonymous download). This box presents its
# key, asks which release matches the contract it answers, spends a short-lived grant,
# and downloads the granted artifact. A box with no key is told to get one; the only
# other way in is a tarball already on disk (bin/ronin-update --services --file).
#
# THE VERIFICATION DOES NOT CHANGE. The manifest's sha256 is written into a SHA256SUMS
# beside the tarball, so the existing checksum step in ronin-update runs exactly as it
# always has, and the contract check after it is untouched. A grant authorises a fetch; it
# never certifies an artifact, and an updater that stopped checking because a download was
# authorised would have removed the check that catches a corrupted transfer.
HQ_BASE="${RONIN_HQ_BASE:-https://hq.ronincowork.com}"

hq_token() {
  # THIS INSTALL'S OWN ronin-store, by absolute path — never whatever PATH happens to
  # resolve. On a machine with a cowork checkout lying around, bare `ronin-store` finds the
  # checkout's copy, and an older one does not know these stores at all. It then reports
  # "unknown store" and the key is never found. Measured on the E2E walk.
  # An office_unit (its office record is present) holds its entitlement_token beside the
  # record; self-hosted holds the Services key Ronin saved, in services_secrets. Same rule
  # as src/activation/secrets.ts.
  store="$("$SELF/bin/ronin-store" office_unit 2>/dev/null || true)"
  [ -n "$store" ] && [ -e "$store/office_record.json" ] || store="$("$SELF/bin/ronin-store" services_secrets 2>/dev/null || true)"
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

# Ask HQ which release is current for our contract; the manifest lands in file $1.
# Each way this can go wrong is a different answer, because each asks a different
# thing of the person: get a key, get a new key, wait, or fix the install.
#   0 manifest in $1    2 no key on this box    3 HQ rejected the key
#   4 HQ not reachable  5 no contract readable
hq_current() {
  tok="$(hq_token)" || return 2
  contract="$(cowork_contract)"
  [ -n "$contract" ] || return 5
  code="$(curl -sS -m 20 -o "$1" -w '%{http_code}' -H "authorization: Bearer $tok" \
    "$HQ_BASE/v1/services/releases/current?contract_version=$contract" 2>/dev/null)" || return 4
  case "$code" in
    200) return 0 ;;
    401|403) return 3 ;;
    *) return 4 ;;
  esac
}

# What to tell the person for an hq_current code. A missing or rejected key is the
# person's to fix and says so; HQ being away is not, and reads differently.
hq_explain() {
  case "$1" in
    1) exit 1 ;;   # a fail() inside the fetch's subshell already said why
    2) fail "no Services key on this box — register with Ronin HQ and paste your Services key into Settings (a tarball on disk installs with --services --file)" ;;
    3) fail "Ronin HQ rejected this box's Services key — it was disabled or replaced; register again and paste the new key" ;;
    4) fail "Ronin HQ was not reachable — try again later (a tarball on disk installs with --services --file)" ;;
    5) fail "no contract number readable at $HOME_DIR/current — not asking Ronin HQ" ;;
    *) fail "Ronin HQ: unexpected answer ($1)" ;;
  esac
}

# The current release for this contract as a tag (v1.8.0), or nothing when HQ cannot be
# asked or has none. For --check: never an exit, never a word.
hq_latest_version() {
  f="$(mktemp)"
  if hq_current "$f"; then
    v="$(hq_json "$(cat "$f")" version)"
    case "$v" in ""|v*) printf '%s' "$v" ;; *) printf 'v%s' "$v" ;; esac
  fi
  rm -f "$f"
}

# Fetch the current release into $1 (workdir). Echoes the version as a tag. Returns the
# hq_current code when HQ cannot be asked (the caller passes it to hq_explain), and 6 when
# HQ answered that nothing is published for our contract: up to date, nothing to install.
hq_fetch_services() {
  work="$1"
  hq_current "$work/current.json" || return $?
  cur="$(cat "$work/current.json")"
  rel="$(hq_json "$cur" release_id)"
  ver="$(hq_json "$cur" version)"
  sha="$(hq_json "$cur" sha256)"
  # "release": null is a real answer: nothing published for our contract.
  [ -n "$rel" ] && [ -n "$ver" ] && [ -n "$sha" ] || return 6

  grant_body="$(curl -fsS -m 20 -X POST \
    -H "authorization: Bearer $(hq_token)" -H 'content-type: application/json' \
    -d "{\"release_id\":\"$rel\"}" \
    "$HQ_BASE/v1/services/releases/grant" 2>/dev/null)" ||
    fail "Ronin HQ did not grant release $ver to this box — the key may have been disabled since; register again if it keeps refusing"
  grant="$(hq_json "$grant_body" grant)"
  [ -n "$grant" ] || fail "Ronin HQ answered the grant for $ver without a grant token — refusing to guess"

  # THE NAME MUST MATCH THE --file PATH'S CONVENTION, because everything downstream is
  # shared. ronin-update reads the contract out of "$PKG-$VER/VERSION", and the artifact's
  # own top-level directory is ronin-services-vX.Y.Z. Naming the download services-1.0.0
  # meant the bytes arrived, the checksum passed, and then the contract check read a path
  # that does not exist and refused the install. Measured on the E2E walk, one step past
  # where the seam test stopped.
  #
  # The manifest carries a bare version (1.0.0); the tag and the directory carry a v.
  case "$ver" in v*) tag="$ver" ;; *) tag="v$ver" ;; esac
  name="ronin-services-$tag.tar.gz"
  curl -fsSL -m 300 -o "$work/$name" \
    "$HQ_BASE/v1/services/releases/$rel/artifact?grant=$grant" 2>/dev/null ||
    fail "the download of $name from Ronin HQ failed — try again"

  # The checksum comes from the AUTHENTICATED manifest, not from beside the download.
  # Writing it here means the existing verification step runs unchanged.
  printf '%s  %s\n' "$sha" "$name" > "$work/SHA256SUMS"
  # Return the TAG-shaped version, so the caller's $PKG-$VER resolves the same way the
  # --file path's does.
  printf '%s' "$tag"
}
