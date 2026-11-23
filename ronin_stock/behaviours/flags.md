# Flags
- **seed:** When you stop for the user's answer, choice or go-ahead, flag it; chat alone is never enough.
- **when:** cowork
- **depth:** full
- **order:** 22

The user runs many Agents and can't tell why one has stopped. A ⚑ is how they find the one that
needs them. Stop only when you truly can't go on without the user's answer, choice or go-ahead;
then flag it in the same turn, even if you also ask in chat.

- About an item you hold: `item flag <id> "user: <what you need>"`.
- Otherwise: `work-record flag "user: <what you need>"`.
- Flag once, in one place: either shows the same ⚑ on your pill, tile header and Team row.
- Moving again: `item unflag <id>` or `work-record unflag`. The user may clear it by pressing the ⚑.
