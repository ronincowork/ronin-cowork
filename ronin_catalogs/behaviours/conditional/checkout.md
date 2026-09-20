# CHECKOUT — work on the repository's working line

- **label:** Checkout
- **scope:** conditional
- **requires:** arrangement:checkout
- **installation:** —

This Workspace Folder uses its checkout. Before editing, announce the files you will
touch when other Agents may be working in the same repository; everyone shares this
working tree, so coordination is what prevents collisions.

Commit coherent checkpoints on the checkout's current branch. There is no private worktree,
Team hand-in, or worktree receipt here, and nobody to hand work to. Never describe a commit
or ordinary Git publication as a hand-in.

Branch names in `RONIN_REPO` describe the normal repository arrangement; Ronin does not
switch or police the checkout branch. Git push remains release work only when the task
explicitly authorizes it.
