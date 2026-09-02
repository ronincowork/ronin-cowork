# Handoff — Worktrees Project Root UX and instructions

> expires: when the UX/SOP leg of `wip/buildouts/RONIN_WORKTREES_PACKET.md` lands

Read `wip/buildouts/RONIN_WORKTREES_PACKET.md` in full. Own implementation leg B:
Project Root configuration, Worktrees vocabulary, branch selection/flow preview, the
new-root seed wording, and the split between Ordinary Git and conditional Ronin Worktrees
Git guidance.

The surface must say **Worktrees**, not the ambiguous field label **coordination** and not
the on/off labels **Desks/None**. Internal desk records may remain where they genuinely
name Ronin's coordination object. The owner must be able to configure reviewed/direct,
working and stable branch names (including dev/main/master or another valid name), and
Worktrees on/off without the UI implying that Save moves or renames branches.

Do not change launch resolution, assignment mechanics, Git hooks, or guards; the sibling
mechanics session owns those. Coordinate shared schema/API needs through the PBS wipeboard
before editing. Follow KOKUGO: every visible string goes through `t()` and the professional
lexicon in the same commit. Use scoped UI/module/lexicon checks; no full BYOIN at commit or
hand-in.
