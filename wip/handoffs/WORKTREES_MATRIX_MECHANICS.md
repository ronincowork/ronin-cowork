# Handoff — Ronin Worktrees 2×2 mechanics

> expires: when the mechanics leg of `wip/buildouts/RONIN_WORKTREES_PACKET.md` lands

Read `wip/buildouts/RONIN_WORKTREES_PACKET.md` in full. Own implementation leg A:
the single resolution seam, per-repository mixed assignments, conditional mechanical
enforcement, and the executable 2×2 regression suite.

The owner's governing model is two independent facts: an Agent either carries the Ronin
Worktrees packet or does not; each repository independently enables Worktrees or does not.
Only enabled+enabled invokes managed worktrees and hand-in. An Agent without the packet
uses ordinary Git even when `RONIN_REPO` exists and says managed.

Do not change Project Root presentation, visible vocabulary, lexicons, or Git SOP prose;
the sibling UX session owns those. Coordinate any unavoidable shared-file seam through the
PBS wipeboard before editing it. Preserve compatibility where practical, but do not add a
new environment/configuration switch beside the single resolver.

Verification and definition of done are the mechanics rows in the build-out. Follow the
repository's `AGENTS.md` and `docs/test-protocols.md`: scoped tests only during desk work;
no full BYOIN at commit or hand-in.
