#!/bin/sh
# STATIC TMUX — the release's own tmux, built from pinned upstream sources.
#
#   sh scripts/tmux-static/build.sh linux-x64        # inside an Alpine container
#
# Runs inside Alpine (musl) so the binary carries no libc expectation at all —
# glibc "static" linking still wants NSS at runtime; musl static is actually static.
# The workflow (.github/workflows/tmux-static.yml) is the only caller; this file is
# the whole recipe, so bumping tmux is editing the pins below and nothing else.
#
# Terminfo is the trap: a static ncurses has no /usr/share/terminfo to lean on, and
# the no-package-manager box this binary exists for may not either. The fallback list
# below is compiled INTO the binary, so tmux answers from memory when the box has no
# database. (Generating fallbacks needs the build host's tic + terminfo db — a
# build-time dependency only; nothing of Alpine's ncurses lands in the output.)
set -eu

PLATFORM="${1:?usage: build.sh <platform>  (e.g. linux-x64)}"

# --- the pins: versions and checksums, verified before a single byte is compiled ---
TMUX_V=3.7c
TMUX_SHA=7c60cae9a0e25288e2e24750aafc9e8800fc7fd4555e447e1b29ee4201cfb3bf
LIBEVENT_V=2.1.13-stable
LIBEVENT_SHA=f7e9383b8c0baa81b687e5b5eecc01beefaf1b19b64151d95ed61647fe7a315c
NCURSES_V=6.5
NCURSES_SHA=136d91bc269a9a5785e5f9e980bc76ab57428f604ce3e5a5a90cebc767971cc6

FALLBACKS="tmux-256color,screen-256color,xterm-256color,xterm,linux,vt100"

# build-base: cc/make/etc.  bison: tmux's parser.  pkgconf: how tmux finds the libs.
# ncurses + terminfo: build-host tic and the db the fallback entries are read from.
apk add --no-cache build-base bison pkgconf curl ncurses ncurses-terminfo ncurses-terminfo-base

SRC_DIR="$(pwd)"
WORK="$(mktemp -d)"
PREFIX="$WORK/prefix"
mkdir -p "$PREFIX"
JOBS="$(nproc 2>/dev/null || echo 2)"

fetch() { # <file> <url> <sha256>
  curl -fsSL --retry 3 -o "$WORK/$1" "$2"
  echo "$3  $WORK/$1" | sha256sum -c -
  tar -xzf "$WORK/$1" -C "$WORK"
}

fetch "ncurses-$NCURSES_V.tar.gz" \
  "https://ftp.gnu.org/gnu/ncurses/ncurses-$NCURSES_V.tar.gz" "$NCURSES_SHA"
fetch "libevent-$LIBEVENT_V.tar.gz" \
  "https://github.com/libevent/libevent/releases/download/release-$LIBEVENT_V/libevent-$LIBEVENT_V.tar.gz" "$LIBEVENT_SHA"
fetch "tmux-$TMUX_V.tar.gz" \
  "https://github.com/tmux/tmux/releases/download/$TMUX_V/tmux-$TMUX_V.tar.gz" "$TMUX_SHA"

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

# --- tmux: against exactly the two prefixes above, fully static ---
cd "$WORK/tmux-$TMUX_V"
PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig" \
  ./configure --enable-static >/dev/null
make -j"$JOBS" >/dev/null
strip tmux

OUT="$SRC_DIR/out"
mkdir -p "$OUT"
cp tmux "$OUT/tmux-$PLATFORM"
cd "$OUT" && sha256sum "tmux-$PLATFORM" | tee "tmux-$PLATFORM.sha256"
"$OUT/tmux-$PLATFORM" -V
