# test_protocols — the release boundary

`docs/test-protocols.md` is the provider-neutral contract. During ordinary work on
Ronin, do **not** run `bin/ronin-byoin` after a leg, a commit, or a hand-in. Keep the
desk moving and use the running dev product for direct dogfood. **The one full
repository BYOIN runs at team promotion — `team/<team>/dev → dev` — on the assembled
candidate, by the lead or compiler, once.** A hand-in is mechanical admission only. The
`dev → master` PR consumes that receipt; GitHub's isolated checks verify the exact SHA
rather than being the first full check. A SKIP is not a pass.

Installed-box maintenance and user-store customization have their own full-BYOIN rule
on that page. Do not confuse that install-health workflow with repository development.
