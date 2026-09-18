# The dependency bundle — an install that checks nothing and fetches nothing

`ronin-bundle` calls the operator's HTTP bundle surface and prints its reply. Packing,
planning and installation execute behind that surface.

> and node into the Ronin download as it is. Even if someone does go to terminal, they are
> getting the whole package."* This file is the one telling of what that means: what a
> bundled release carries, how each platform installs it, and where every vendored byte
> is pinned. `docs/getting-started/install.md` stays the walk for an agent performing the install;
> `docs/development/release.md` stays the procedure for cutting one.

## What the bundle is

A bundled release is today's release tree plus three things it used to demand from the
box:

    vendor/node/        the official Node runtime for the platform (vendor/node/bin/node)
    vendor/tmux         one static tmux binary — libevent and ncurses compiled in,
                        terminfo fallbacks compiled in, owes the box nothing
    vendor/bin/tmux     the same binary with a PATH-able face (a symlink) — the app's
                        own tmux calls resolve here, never through the agent-guard shim
    node_modules/       finished — every native module ships prebuilt

The installer's whole detection is the vendor directory present or absent — a directory
that exists only inside a bundled artifact, never in this repo. Present means a bundled
release: nothing is checked, nothing is fetched, and no dependency is ever named at the
user — the two historical hard-fails ("install tmux first", "install Node.js") cannot
happen, because there is nothing to be missing. Absent means a git checkout, and the
developer path behaves exactly as it always has: system tmux, system node, `npm install`.

## The platforms

| artifact | runs on | how it is built |
|---|---|---|
| `ronin-cowork-vX.Y.Z-linux-x64.tar.gz` | any x86-64 Linux, no package manager needed | tmux: Alpine/musl, truly static |
| `ronin-cowork-vX.Y.Z-linux-arm64.tar.gz` | any arm64 Linux (Pi-class boxes included) | same recipe, QEMU in CI |
| `ronin-cowork-vX.Y.Z-darwin-arm64.tar.gz` | Apple-silicon macOS | native runner; static archives against dynamic libSystem |
| `ronin-cowork-vX.Y.Z-darwin-x64.tar.gz` | Intel macOS | same, on an Intel runner |

**Windows** runs Ronin through **WSL2**, using the linux artifact unchanged — see the
Windows section below. There is no native Windows artifact and cannot honestly be one:
tmux is a POSIX program with no Windows port, and Ronin is a tmux operator. WSL2 is not a
workaround here; it is Microsoft's supported way to run Linux programs, one command to
enable, and the bundle's whole promise (no package manager, no compiler, no versions to
match) is exactly what makes the WSL path painless.

## Installing, per platform

The public installer (`scripts/get-ronin`, fetched raw and piped to sh) selects the
platform artifact, verifies its checksum, installs it, and runs setup. The bundle supplies
Node, tmux, and application dependencies. Setup explains outstanding administrator
changes before applying them. For access from other devices, the owner supplies an
installed, signed-in Tailscale; local use does not require it.

A standard installation binds to loopback. On macOS, setup prints
`http://127.0.0.1:<backend-port>` for a browser on that Mac. Linux omits this local
address from the greeting. When Tailscale HTTPS is available and verified, setup prints `https://<machine>.<tailnet>.ts.net:4810` for this computer
or another authorized tailnet device. Missing Tailscale or an unavailable HTTPS route
does not prevent local installation. On a local graphical desktop,
`libexec/ronin-open-browser` opens the local URL as a convenience.

- **Linux:** services use user-level systemd units. The tmux unit runs the bundled binary
  (`deploy/tmux-server.service`, `__TMUX_BIN__`); the application resolves tmux through
  `vendor/bin` (`deploy/ronin.service`, `__TMUX_DIR__`).
- **macOS:** setup renders, loads, and starts the per-user launchd agent from
  `deploy/com.ronin.plist`. It uses the GUI domain when available, otherwise the user
  domain for an SSH installation. There is no laptop/server choice or manual activation
  step. A per-user agent does not promise service before login after a reboot.
- **Windows (WSL2):** enable WSL2, then use the Linux artifact matching its architecture.
  The Linux environment needs a working service manager. Verify the printed address
  from the intended browser; do not infer access from unpacking the artifact.

## Where every byte is pinned

- **`vendor.lock`** (repo root) is the single authority on what a bundle vendors: the
  Node version, the tmux-static release tag, and a sha256 per platform for both.
  `bin/ronin-build` verifies every download against it and fails loud on any mismatch.
  Bumping Node or tmux is a reviewed commit to this file, never a release side effect.
- **The static tmux** is built by `scripts/tmux-static/build.sh` — the pins for tmux,
  libevent, and ncurses live at the top of that file — and proven by
  `.github/workflows/tmux-static.yml` on a box with nothing (busybox for Linux; an empty
  terminfo directory and `otool -L` for macOS) before being published as a
  `tmux-static-vN` release. It runs when we bump tmux, a few times a year.
- **`node_modules`** is pinned by `package-lock.json` as always. The release assembles it
  per platform with `npm ci --os --cpu --ignore-scripts`: every native module
  (`@lydell/node-pty`, esbuild under tsx) ships prebuilt binaries, which is what lets one
  Linux runner assemble all four platforms — and what guarantees no install script ever
  runs at either build or install time.
- **The release itself**: `.github/workflows/release.yml` compiles nothing. It runs the
  gates, calls `bin/ronin-build`, and attaches the plain tarball plus one bundle per
  `vendor.lock` platform, all under one `SHA256SUMS`.

## Updates

`bin/ronin-update` detects the box's platform from `uname` and prefers the bundled
artifact; a release that predates bundling falls back to the plain tarball and the old
`npm install` path. A bundled candidate installs with no npm step at all — the existing
checksum, candidate-gate, and rollback machinery is unchanged, and is precisely what
makes shipping our own runtime safe.

## What this kills

The prerequisite checks die at the root (nothing is checked because nothing can be
missing). Installs work on boxes with no compiler, no package-manager access, and hostile
corporate proxies — the network is touched for nothing but the release itself. And every
box runs a tmux and Node we chose and proved, not whatever 2019 left in `/usr/bin`.
