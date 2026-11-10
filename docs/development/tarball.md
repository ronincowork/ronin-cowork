# Release coordination

For release maintainers. Users installing or updating Ronin should start with
[Install Ronin](../getting-started/install.md). [Release mechanics](release.md) owns
builds, tags, checksums, installation, and rollback.

## Publication boundaries

Cowork's public release, Services' private release (`ronincowork/ronin-releases`, copied there
by `bin/feed-publish`), and HQ's authenticated Services release registry are separate
publication targets. A version present in one is not
proof that another serves it. The installed Cowork/Services connector versions must
match; release selection uses that compatibility contract.

1. Verify and integrate the intended source revisions through the repository's release workflow.
2. Build and publish versioned artifacts through the declared release tooling.
3. Register the intended Services artifact through HQ's supported release command.
4. Check that the public artifacts and the authenticated release selection return the
   intended versions, contract numbers, and checksums.
5. Record deployment evidence in the creators' Lab. Source integration, artifact publication,
   and a running operator are separate outcomes.

Do not publish a local `--dirty` trial build. Do not hand-edit an HQ release manifest.
Use the HQ repository's current operations guide for host access and publication syntax;
this repository does not own those machine-specific procedures or credentials.

## Verification boundary

Run the repository checks for the exact release candidate and the required installed-user
checks when changing an installed box or its user stores. An artifact must retain its
checksum and connector checks even when the fetch was authorized.

Dated incident reports, prior release versions, temporary artifact paths, and rollout
observations belong in the creators' Lab. They do not override current build or deployment
contracts and are not prerequisites for an owner's installation.
