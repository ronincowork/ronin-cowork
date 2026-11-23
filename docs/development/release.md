# release — how a change becomes a running Ronin

The chain is `ronin_repo → ronin_artifact → ronin_install → ronin_operator`
([Vocabulary](../../KOTOBA.md#coworkspace-and-work)). This page is the middle two links: how the artifact is cut, and how an
install moves to it. The one-line answer to "when does the app change": **merging to
master changes nothing running; a box changes only when someone installs a release on
it.** Two deliberate acts stand between an edit and the grid — the tag, and the update.

## Cutting a release (the producing half)

1. Work reaches `dev` by **team promotion**, which constructs the candidate, advances the
   working reference by compare-and-swap, restarts the app, and checks deployment health.
   The lead/release maintainer owns full `npm run verify` on the combined candidate before
   publishing global `dev` to remote `dev` and opening the release PR; the lead may choose
   to obtain that verdict earlier at Team promotion. Individual Agents use focused checks,
   not a full run at every hand-in ([verification guidance](verification.md)).
   A `dev → master` pull request also runs `npm run verify` in GitHub.
2. A person merges. Master moving is a record of what is releasable, not a release.
3. A person fetches and checks out `master`, confirms it is current, then pushes a tag
   `vX.Y.Z` on that commit. That is the release act. The release workflow
   (`.github/workflows/release.yml`) first refuses any tag whose commit is not on
   `origin/master`, then builds ONCE with `bin/ronin-build`, and
   attaches the artifact to a GitHub Release. `bin/ronin-build` itself refuses a commit
   that is not on the declared stable line (`stable` on the repository's Workspace row): acceptance is the commit's
   place on that line, never the checkout that happens to be open.
4. **A fresh box proves the artifact before anyone is pointed at it.** The bundle, not a
   checkout, on a disposable Linux VM or a throwaway account that has never run tmux or
   Ronin — the state every new user is in, and one no developer's box is ever in. Three
   releases (v2.1.2 – v2.2.1) failed every fresh install at the tmux probe while every
   rerun on a box with a server passed (issue #74); the unit floor now covers the probe
   with real tmux on a private socket, and this walk is what covers `setup.sh` itself:

   ```bash
   tmux list-sessions              # expect the honest "no server running" / "error connecting"
   bin/ronin-update --home ~/ronin && cd ~/ronin/current && ./setup.sh
   systemctl --user is-active tmux-server ronin        # active, active
   cat /proc/"$(tmux display-message -p '#{pid}')"/cgroup  # ends in tmux-server.service
   bin/ronin-doctor                                    # exit 0, or only the linger/swap offers
   ```

   The server must be in `tmux-server.service`'s cgroup, not the SSH session's; a release
   that fails this walk is not published as latest.

The build is a **stamp, a prune and a tarball** — there is no compiler in this stack
(`tsx` runs the TypeScript; the client is native ES modules):

- `git archive` stages tracked files only, so `.env`, `node_modules/` and untracked
  scratch can never leak into a tarball — by construction, not by list.
- The version is stamped into `package.json`, and a `VERSION` file (plain `key=value`:
  `release`, `commit`, `built`, `contract`) lands at the root. That file is the
  install's identity: `/api/version` answers `release` from it, and `bin/ronin-doctor`
  compares release strings instead of inferring from commits.
- `.github/` is pruned because it belongs to the repository rather than the install.
  `scripts/` and `tests/` (the two guards) ship with the artifact.
- `node_modules` do not travel (~74 MB; the pty module is a per-platform native
  binary). `npm install` runs at install time instead.
- Output: `ronin-cowork-vX.Y.Z.tar.gz` + `SHA256SUMS`. Same commit in, same bytes out
  (the tar metadata and the `built` stamp both come from the commit, not the clock).

The tarball is built once, in CI, for every box alike. An artifact built on the
machine that runs it is a build, not an artifact — a box only ever downloads and
verifies a checksum.

## Installing and updating (the consuming half)

One implementation, `bin/ronin-update`, behind two doors: the terminal, and the
**Release & update** row of the Account rail (`public/js/cowork-commons.js`) and Ronin
Home's update line, whose buttons run the same script. The layout it
manages, under an install home named once at first install (`--home`):

```
<home>/releases/v1.0.0/     every release unpacked whole, beside the others
<home>/releases/v1.1.0/
<home>/current -> releases/v1.1.0     what the systemd unit points at
<home>/previous -> releases/v1.0.0    what --rollback returns to
<home>/.env                           lives in the home, linked into each release
```

The flow, in order — and the order is the safety:

1. **fetch** the release (gh or curl; `--file` for a tarball already in hand)
2. **verify** `SHA256SUMS` — a mismatch refuses, loudly
3. **unpack beside** `current`, never over it; `npm install` completes the candidate
4. **gate the candidate**: it boots on a loopback scratch port, must answer its own
   release string on `/api/version`, and must pass the real-browser render gate
   (`libexec/ronin-gate`). **A failed gate swaps nothing — the serving release never
   moved.** The candidate uses temporary stores and a private tmux server allocated
   by `bin/ronin-testserver`; both are cleaned up on success or failure. Setup then
   adopts a real existing server, or starts Ronin’s own when none exists.
5. **swap** the `current` symlink and restart `ronin` — only if that unit
   actually serves this home; otherwise it says so and stops
6. **gate the live page**, and report the release now answering

**An update cannot kill your work.** Sessions live in `tmux-server.service`, a unit
this flow never touches; only the operator restarts, and the browser reconnects.

**Rollback is a symlink**: `bin/ronin-update --rollback` re-points `current` at the
previous unpacked release and restarts. Running it again rolls forward.

**Services ride along.** A Cowork update copies the installed Services store
(`<home>/services`) into the candidate, and `--services --file` installs Services only
when their `contract=` matches the serving Cowork's `CONTRACT_V`. Neither one can move an
install across a contract change, so that move takes both packages at once:

```
<new>/bin/ronin-update --home <home> --file ronin-cowork-vX.Y.Z.tar.gz \
    --services-file ronin-services-vA.B.C.tar.gz
```

- Both tarballs are checked against `SHA256SUMS`: one file beside each, or one file
  holding both lines when the two tarballs share a directory.
- The two must answer the same contract: the Cowork tarball's `src/sockets-contract.ts`
  and the Services `VERSION` `contract=`. The installed contract doesn't enter into it.
  A mismatch is refused with both numbers, and nothing moves.
- The candidate is the new Cowork carrying the **new** Services, gated exactly as above.
  Only a pass swaps `current` and the store together. The store it replaced is kept as
  `<home>/services.previous`.
- Run it from the **new release's own copy**: unpack its Cowork tarball anywhere and
  call that tree's `bin/ronin-update` with `--home`. The installed older copy doesn't know
  `--services-file`.
- `--rollback` returns to the previous Cowork and its Services. Roll forward from the
  newer release's copy (`<home>/releases/<new>/bin/ronin-update --rollback`), because the
  older release's updater doesn't move the store back.

**The one route a restart cannot carry**: unit files are COPIES in systemd
(docs/repo-to-operator.md). If a release changes `deploy/`, the updater says so —
run `./setup.sh` from `current` to re-render them.

## Release & update

The Account rail's **Release & update** row, and the update line under Ronin Home's doors,
show what this install runs and hold the buttons: **Check for updates** (the one outbound
ask this product makes to the release feed — on press only, never on a timer or at boot)
and **Update Cowork** / **Update Services**, shown when the check names a release (runs
`bin/ronin-update` in a transient systemd unit, so the update survives the operator
restart it performs). It shows what changed and never acts unasked. Completion is
`/api/version` answering the new release; the page reloads itself when it sees it.

## A dev checkout beside a release install

Both can live on one box. The release serves the usual port under the unit; the
checkout is run by hand when wanted — a different `PORT`, `npm run dev`, killed when
done, never a unit. Both watch the same tmux server, so it is the same grid in two
versions of the UI, and `/api/version` tells them apart: a release string on one, a
bare commit on the other. **After cutover, never run `setup.sh` from the checkout** —
setup points the unit at a directory, and from the checkout it would re-point the
serving Ronin at a source tree. The checkout is updated by git; the install by
releases. `npm run stage` remains a low-level static-client copy to `/staging/`; it is not
a Team review: a Team's UI work is tried on dev after the lead promotes it.

## Cutover (a checkout-serving box moves to releases, once)

A box that has been serving its checkout directly becomes a release-install box in
five steps, owner present:

1. `bin/ronin-update --home <dir>` — first install into a fresh home (fetch or
   `--file`); it unpacks, gates the candidate, sets `current`, and stops with
   instructions, because no unit serves that home yet
2. `(cd <dir>/current && ./setup.sh)` — points the unit at `current`, starts it
3. the gate verdict on the served page, and `/api/version` answers the release
4. rollback, if wanted: re-run `setup.sh` from the checkout — the old unit rendering
   is one setup run away, which is why the checkout is not deleted
5. from then on the checkout is a source tree only, and updates go through the
   updater or the gear
