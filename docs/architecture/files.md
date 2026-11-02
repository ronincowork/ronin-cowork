# Files — construction

The card is **Explorer**; the user guide is [Explorer](../using-ronin/explorer.md). Owner's rulings: KAN-146, 2026-11-01/02.

## One process, one socket, one route

- **Start** — `startFiles(ROOT)` in `src/index.ts`'s `startBox`, code in `src/files.ts`. `PYTHON` is
  `python3` looked up on PATH once, when the module loads. With no `python3`, nothing starts and
  the page is told `data-files="off"`. Nothing is logged or shown. There is no switch.
- **Run** — `python3 libexec/copyparty/copyparty-sfx.py` runs as the user and as a child of Ronin.
  It is killed on SIGINT/SIGTERM, and on a service restart it goes with Ronin's cgroup. It listens
  only on `unix:700:<data root>/files.sock`, which no other user can open and which takes no port
  (owner, 2026-11-02: in place of loopback). Ronin removes the last run's socket before it starts
  copyparty. There is no supervisor: if copyparty dies, `/files` answers 502 until Ronin restarts.
- **Serve** — `app.use('/files', signIn, filesProxy())` is the first route. It comes before
  `compressResponse` and `express.json`, because up2k's JSON handshakes and the chunk bodies must
  stream through untouched. `signIn` is the same gate every other route uses. The proxy is
  `node:http` on `socketPath`, with the request's own path and headers, less Ronin's
  `Authorization`.
- **The file** — `copyparty-sfx.py` (MIT) is committed in the repo, so dev and release run the same
  bytes. The pinned version and sha256 are in [NOTICE](../../NOTICE). To bump it, replace the file
  and update that line.

## The mapping

`-v $HOME::rwmd.,*` mounts the home folder at copyparty's root. The permissions are read, write,
move, delete and dotfiles for "everyone", and the only one who can reach the socket is Ronin's
proxy. `--rp-loc /files` makes copyparty draw every link as `/files/...`. So `/files/<path>` is
`$HOME/<path>`: the Workspace page (`workspaces-surface.js`) adds a dropped `/files/` link as that
folder.

## Cost

`--no-thumb`, no `-e2d*` (no database, no scan) and `--http-only` (no TLS certificate). Idle, it uses
no CPU and about 60 MB of memory. Volume data lives under `--hist <data root>/copyparty`.

## Look and chrome

These are copyparty's own options, not patches:
- **Theme:** `--js-browser /files.js` (`public/files.js`). The frame shares Ronin's origin, so the
  script reads the page around it. It follows Ronin's `<html data-theme>` with `settheme.go(2|3)`:
  copyparty's flat dark or flat light. It copies Ronin's live tokens, skins included, into the frame
  as `--ronin-*`. Two MutationObservers (the root's attributes and the head's styles) keep it
  following without a reload.
- **Colours:** `--css-browser /files.css` (`public/files.css`) maps copyparty's variables to those
  `--ronin-*` tokens, for both themes.
- **Hidden:** `--ui-nombar` (menu bar), `--ui-noacci` (account and permissions), `--ui-nosrvi`
  (server info), `--ui-nocpla` (control-panel link) and `--ui-norepl` (code console).

Marking a Workspace's places in Files (`--html-head`) is planned for later.

## The surface

`public/js/files-surface.js` registers `ronin.files`. It is an `<iframe src="/files/">` filling a
flush card. It is offered only when `<html data-files="on">`, which the server stamps into
`index.html` (`__RONIN_FILES__`). Its selector card, **Explorer**, is in the Workspaces profile only
(owner, 2026-11-02). The other workbenches' selectors stay as the owner ruled them.
`createWorkspacesView` seats it in tilespace 2, or GitHub CLI there when Files is off.
