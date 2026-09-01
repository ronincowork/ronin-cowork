# test_protocols — the release boundary

`docs/test-protocols.md` is the provider-neutral contract. During ordinary work on
Ronin, do **not** run `bin/ronin-byoin` after a leg, a commit, or a hand-in. Keep the
desk moving and use the running dev product for direct dogfood. **The first full
repository BYOIN runs at team promotion — `team/<team>/dev → dev` — on the assembled
candidate, by the lead or compiler, once.** A hand-in is mechanical admission only. The
**second full repository BYOIN runs at `dev → master`**, after CI consumes the promotion
receipt for that exact SHA. A SKIP is not a pass. This 2026-09-01 owner ruling supersedes
the former isolated-assurance-only release wording.

Installed-box maintenance and user-store customization have their own full-BYOIN rule
on that page. Do not confuse that install-health workflow with repository development.
