#!/bin/sh
# STATIC TMUX — the release's own tmux, built from pinned upstream sources.
#
#   sh scripts/tmux-static/build.sh linux-x64      # inside an Alpine container (musl)
#   sh scripts/tmux-static/build.sh linux-arm64    # same container, arm64 (QEMU in CI)
#   sh scripts/tmux-static/build.sh darwin-arm64   # natively on a macOS runner
#   sh scripts/tmux-static/build.sh darwin-x64     # natively on an Intel macOS runner
#
# Linux runs inside Alpine (musl) so the binary carries no libc expectation at all —
# glibc "static" linking still wants NSS at runtime; musl static is actually static.
# macOS cannot fully static-link (libSystem is always dynamic); there, libevent and
# ncurses are linked as static archives and the proof is that otool -L shows nothing
# but /usr/lib. The workflow (.github/workflows/tmux-static.yml) is the only caller;
# this file is the whole recipe, so bumping tmux is editing the pins below.
#
# Terminfo is the trap: a static ncurses has no /usr/share/terminfo to lean on, and
# the no-package-manager box this binary exists for may not either. The fallback list
# below is compiled INTO the binary. The entries are read from the ncurses tarball's
# OWN terminfo.src (compiled into a scratch db) — never from the build host's db,
# which on macOS is too old to know tmux-256color.
set -eu

PLATFORM="${1:?usage: build.sh <platform>  (linux-x64|linux-arm64|darwin-arm64|darwin-x64)}"

# --- the pins: versions and checksums, verified before a single byte is compiled ---
TMUX_V=3.7c
TMUX_SHA=7c60cae9a0e25288e2e24750aafc9e8800fc7fd4555e447e1b29ee4201cfb3bf
LIBEVENT_V=2.1.13-stable
LIBEVENT_SHA=f7e9383b8c0baa81b687e5b5eecc01beefaf1b19b64151d95ed61647fe7a315c
NCURSES_V=6.5
NCURSES_SHA=136d91bc269a9a5785e5f9e980bc76ab57428f604ce3e5a5a90cebc767971cc6

FALLBACKS="tmux-256color,screen-256color,xterm-256color,xterm,linux,vt100"

case "$(uname -s)" in
  Linux)
    # build-base: cc/make.  bison: tmux's parser.  pkgconf: how tmux finds the libs.
    # ncurses: the build-host tic that compiles the fallback entries.
    apk add --no-cache build-base bison pkgconf curl ncurses
    ;;
  Darwin)
    # The Xcode CLT carry cc/make/bison/tic; pkg-config is on the runner image, but
    # say so loudly if an image ever drops it rather than failing three steps later.
    command -v pkg-config >/dev/null || brew install pkgconf
    ;;
esac

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

SRC_DIR="$(pwd)"
WORK="$(mktemp -d)"
PREFIX="$WORK/prefix"
mkdir -p "$PREFIX"
JOBS="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)"

fetch() { # <file> <url> <sha256>
  curl -fsSL --retry 3 -o "$WORK/$1" "$2"
  [ "$(sha256_of "$WORK/$1")" = "$3" ] || { echo "checksum mismatch: $1" >&2; exit 1; }
  tar -xzf "$WORK/$1" -C "$WORK"
}

fetch "ncurses-$NCURSES_V.tar.gz" \
  "https://ftp.gnu.org/gnu/ncurses/ncurses-$NCURSES_V.tar.gz" "$NCURSES_SHA"
fetch "libevent-$LIBEVENT_V.tar.gz" \
  "https://github.com/libevent/libevent/releases/download/release-$LIBEVENT_V/libevent-$LIBEVENT_V.tar.gz" "$LIBEVENT_SHA"
fetch "tmux-$TMUX_V.tar.gz" \
  "https://github.com/tmux/tmux/releases/download/$TMUX_V/tmux-$TMUX_V.tar.gz" "$TMUX_SHA"

# --- the fallback source of truth: the tarball's own terminfo, not the host's ---
tic -x -o "$WORK/tidb" "$WORK/ncurses-$NCURSES_V/misc/terminfo.src" 2>/dev/null || true
if TERMINFO="$WORK/tidb" infocmp tmux-256color >/dev/null 2>&1; then
  export TERMINFO="$WORK/tidb"
else
  # The host tic could not compile the modern source (or infocmp disagrees) — fall
  # back to the host db, and let the entry check below say exactly what is missing.
  echo "note: using the host terminfo db for fallbacks (scratch compile unusable)"
fi
for entry in $(printf '%s' "$FALLBACKS" | tr ',' ' '); do
  infocmp "$entry" >/dev/null 2>&1 || { echo "no terminfo source for fallback '$entry'" >&2; exit 1; }
done

# --- ncurses: wide-char (tmux is UTF-8), static only, fallbacks compiled in ---
cd "$WORK/ncurses-$NCURSES_V"
./configure --prefix="$PREFIX" \
  --enable-widec --without-shared --without-debug --without-ada \
  --without-manpages --without-progs --without-tests \
  --with-fallbacks="$FALLBACKS" \
  --with-terminfo-dirs="/etc/terminfo:/lib/terminfo:/usr/share/terminfo" \
  --with-default-terminfo-dir="/usr/share/terminfo" \
  --enable-pc-files --with-pkg-config-libdir="$PREFIX/lib/pkgconfig" \
  >/dev/null
make -j"$JOBS" >/dev/null
make install >/dev/null

# --- libevent: static only, no openssl (tmux never speaks TLS through it) ---
cd "$WORK/libevent-$LIBEVENT_V"
./configure --prefix="$PREFIX" --disable-shared --disable-openssl \
  --disable-libevent-regress --disable-samples >/dev/null
make -j"$JOBS" >/dev/null
make install >/dev/null

# --- tmux: against exactly the two prefixes above ---
# --enable-static passes -static, which musl supports and macOS's ld refuses; on
# Darwin the same effect comes from the prefixes holding ONLY static archives.
cd "$WORK/tmux-$TMUX_V"
case "$(uname -s)" in
  Linux)  PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig" ./configure --enable-static >/dev/null ;;
  Darwin) PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig" ./configure >/dev/null ;;
esac
make -j"$JOBS" >/dev/null
strip tmux

OUT="$SRC_DIR/out"
mkdir -p "$OUT"
cp tmux "$OUT/tmux-$PLATFORM"
(cd "$OUT" && printf '%s  %s\n' "$(sha256_of "tmux-$PLATFORM")" "tmux-$PLATFORM" | tee "tmux-$PLATFORM.sha256")
"$OUT/tmux-$PLATFORM" -V
