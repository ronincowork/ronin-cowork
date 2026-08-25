# test_protocols — the release boundary

`docs/test-protocols.md` is the provider-neutral contract. During ordinary work on
Ronin, do **not** run `bin/ronin-byoin` after a leg, commit, or push. Keep dev moving and
use the running dev product for direct dogfood. The designated integrator runs BYOIN
once against the complete `dev → master` release candidate; GitHub checks the PR in an
isolated runner. A SKIP is not a pass.

Installed-box maintenance and user-store customization have their own full-BYOIN rule
on that page. Do not confuse that install-health workflow with repository development.
