# tarball — cutting a version across all three places

> services **v1.3.0**, and an entitled owner activating Services still received **v1.0.0**,
> built five days earlier. Nothing errored. The install said "Services ready" and delivered
> a roster with no gbrain and no koshi_weights — two of the five things the setup page sells.
>
> The cause was not a bug in any of the code. It was that **publishing to GitHub and
> publishing to Ronin HQ are two separate acts**, and only one of them is automated. Nobody
> had run the second one since v1.0.0. The two lists drifted for five days and the only
> symptom was users quietly getting an old version.
>
> `docs/release.md` remains the mechanics of the cowork release — the tag, the CI build,
> the install and rollback. THIS file is the checklist across all three places, because the
> gap that bit us lives between them, where no single repo's doc was looking.

## The three places a version has to land

| # | Place | What lives there | How it updates | Automated? |
|---|---|---|---|---|
| 1 | **ronin-cowork** GitHub release | the cowork tarball + 4 platform bundles | push a `vX.Y.Z` tag on `master` | **yes** — `release.yml` |
| 2 | **ronin-services** GitHub release | the services tarball | push a `vX.Y.Z` tag on `master` | **yes** — `release.yml` |
| 3 | **Ronin HQ** release registry | the manifest an ENTITLED owner downloads | `shiwake release publish` on the HQ box | **NO — by hand** |

Place 3 is the one that drifts. The updater's authorized path asks HQ
(`GET /v1/services/releases/current?contract_version=N`) and installs whatever HQ names.
**A GitHub release nobody registered with HQ does not exist as far as a paying owner is
concerned.** The public feed is a different door and is not what an entitled box uses.

## The order

1. **Land the work.** `dev` → PR → `master`, both repos. Master moving is a record of what
   is releasable, not a release.
2. **Tag cowork.** `git tag -a vX.Y.Z origin/master && git push origin vX.Y.Z`. CI refuses a
   tag whose commit is not on `origin/master`, re-runs the gates, builds once, publishes.
3. **Tag services**, the same way, from `ronin-services`.
4. **Register the services release with HQ.** On the HQ box, as the `shiwake` user:
   ```sh
   shiwake release publish /srv/ronin-artifacts/ronin-services-vX.Y.Z.tar.gz \
     --version X.Y.Z --contract <N>
   ```
   - The staging directory on the deployed box is **`/srv/ronin-artifacts`** (root:shiwake,
     0750). ronin-shiwake's own operations guide still says `/srv/artifacts`, which does not
     exist there — trust the box, not that line.
   - The artifact must sit **outside HQ's releases directory**, which holds manifests only —
     publish refuses otherwise.
   - `--contract` must equal the number cowork answers (`src/sockets-contract.ts`,
     `CONTRACT_V`). Selection matches **exactly**, so a contract one too high makes the
     release **invisible rather than erroring** — the same silent shape as the bug above.
   - The command computes the sha256 itself. Do not hand-write it.
   **Hand it a script, not a one-liner.** A long command wrapped in a paste becomes several
   shell lines, each running on its own — that cost us four unrelated errors from one paste.
   Write the steps to a file and run the file:

   ```sh
   cat > /tmp/pub.sh <<'EOF'
   #!/usr/bin/env bash
   set -u
   SRC=/tmp/svc.tgz                                             # the downloaded artifact
   DEST=/srv/ronin-artifacts/ronin-services-vX.Y.Z.tar.gz
   sha256sum "$SRC" || exit 1                                   # compare with SHA256SUMS
   install -o root -g shiwake -m 640 "$SRC" "$DEST" || exit 1
   sudo -u shiwake shiwake release publish "$DEST" --version X.Y.Z --contract 1 || exit 1
   sudo -u shiwake shiwake release list                         # what HQ will now serve
   sudo -u shiwake shiwake check                                # the store's own checker
   EOF
   bash /tmp/pub.sh
   ```

5. **Verify HQ actually serves it** before believing any of the above:
   ```sh
   curl -fsS -H "Authorization: Bearer $ENTITLEMENT_TOKEN" \
     "https://hq.ronincowork.com/v1/services/releases/current?contract_version=1"
   ```
   The `version` it returns is what a real owner will receive. If it is not the version you
   just published, **the release is not done**, whatever GitHub shows.

## Where HQ actually is, and who may publish

HQ is **SHIWAKE** — the ronin-shiwake repository, deployed as the ronin-shiwake systemd
unit and reached at `hq.ronincowork.com`. Its own operations guide
(ronin-shiwake, docs/operations.md, § *Publishing a release*) is the authority on the
command; what follows is only what a cowork release needs to know about it.

- The store is a **filesystem database** owned by the `shiwake` user, so publishing is
  `sudo -u shiwake shiwake release publish …`. An ordinary login gets `EACCES` on the
  releases directory — that refusal is the permission model working, not a fault.
- **The `shiwake` CLI is the operator's whole interface.** Every field it writes was
  hand-written once and each had a silent failure mode: a mistyped checksum makes the
  updater refuse the download it just made, and a `contract_version` one too high makes the
  release invisible rather than erroring. Use the command; never edit a manifest by hand.
- **`shiwake check`** is the store's own checker — a filesystem database has no schema, so
  the enforcement lives there. Run it after publishing.
- **`shiwake release list`** shows what HQ will serve. This is the list that drifted.

The activation side of SHIWAKE — grants, entitlements, confirmation mail — is documented in
that same repository and is not restated here. What a cowork release depends on is exactly
one thing: **that the version you tagged is the version HQ names.**

## The check that would have caught this

Compare all three in one breath. Any disagreement is a release that is not finished:

```sh
gh release view --repo ronincowork/ronin-cowork  --json tagName -q .tagName
gh release view --repo ronincowork/ronin-services --json tagName -q .tagName
curl -fsS -H "Authorization: Bearer $TOK" \
  https://hq.ronincowork.com/v1/services/releases/current?contract_version=1
```

## Things that cost us an attempt, once each

Kept here because every one of them looked like something else at the time.

- **Run the copy and the publish as SEPARATE lines, never `a && b`.** Chaining hid a failure
  once: the copy failed, and the publish ran anyway and reported a second, misleading error
  about a file it could not read. Each step should be allowed to stop.
- **A GitHub release page renders assets as they attach.** Mid-upload it genuinely looks
  unfinished, and the plain source tarball displays as `0 MB` because it is under a
  megabyte. Neither means a broken build. `sha256sum -c SHA256SUMS` is the answer.
- **A twenty-minute arm64 job during a release is the tmux build, not the release.** It
  compiles under QEMU and publishes nothing. Fixed by pinning `branches:` in its trigger;
  if you ever see it again on a tag, that pin has been lost.
- **HQ runs on the same box as everything else here.** `hq.ronincowork.com` resolves to a
  local address, so "the HQ box" is not somewhere else to log into — but the store is owned
  by another user, and that is the only barrier.

## Standing rules

- **The tag is the release act, and it is a person's** (`release.yml`: *"two deliberate acts
  by a person, never automation"*). That has not changed. Registering with HQ is the third
  deliberate act, and it belongs to the same person in the same sitting — not to a later
  moment when it will be forgotten.
- **Never publish a `--dirty` build.** `bin/ronin-build --dirty` exists for local trials and
  is guarded only by a comment (OPEN_THREADS 4.19).
- **A release tag must not start the tmux build.** GitHub ignores `paths:` filters for tag
  pushes, so `tmux-static.yml` pins `branches:` to keep tags out. It compiles arm64 under
  QEMU for twenty minutes and publishes nothing — a convincing false "still building".
- **Cowork and services move together.** They are paired by contract number, and the
  installer refuses a mismatch with a message naming both sides. If the contract moves,
  both sides ship in the same sitting.

## What this does not cover

The **cowork** release has no HQ leg — a cowork install fetches its own tarball from the
public GitHub release. Only **services** are gated, because only services are entitled.
