#!/usr/bin/env bash
# Shared, read-only headroom check and conservative Ronin-owned /tmp janitor.

ronin_tmp_preflight() {
  local target="${TMPDIR:-/tmp}" inode_free inode_total byte_free byte_total
  read -r inode_total inode_free < <(df -Pi "$target" | awk 'NR==2 {print $2, $4}')
  read -r byte_total byte_free < <(df -Pk "$target" | awk 'NR==2 {print $2, $4}')
  if [ "${inode_free:-0}" -lt 32768 ] || [ "${byte_free:-0}" -lt 1048576 ]; then
    cat >&2 <<EOF
REFUSED — temporary storage has too little headroom to start safely.
  $target: ${inode_free:-?}/${inode_total:-?} inodes free; $(( ${byte_free:-0} / 1024 )) MiB free
Ronin is stopping before a gate fails halfway through. Run bin/ronin-doctor for the
machine readout, then clear old Ronin-owned temporary work or add storage. Nothing ran.
EOF
    return 1
  fi
}

ronin_tmp_janitor() {
  local target="${TMPDIR:-/tmp}" owner
  owner="$(id -un)"
  [ -d "$target" ] || return 0
  find "$target" -mindepth 1 -maxdepth 1 -user "$owner" -type d \
    \( -name 'ronin-promotion-*' -o -name 'ronin-test-run-*' \
       -o -name 'ronin-birth-proof.*' -o -name 'settle-probe-*' \) \
    -mmin +1440 -exec rm -rf -- {} + 2>/dev/null || true
}
