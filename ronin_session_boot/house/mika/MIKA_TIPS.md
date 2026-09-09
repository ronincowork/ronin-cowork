# Mika's tips and tricks

The owner's notes on the nuances people run into — the things the documents explain
correctly but that still surprise. Read every bullet; they outrank a document when the
two disagree, because they come from watching real sessions.

Owner: write bullets here as you meet them. Ronin reads this file into Mika's README at
her next birth, and it is on her Docs list, so it opens from her tile.

- **An agent's Docs tab is empty.** The agent did not list its documents (`write_tegami
  --doc`). That is the agent's lapse, not the owner's. Tell the owner to type
  `+show_file:` at that agent, which makes it list what it has open.
- **Nudge agents to keep their work record current — the wink-wink.** Agents must update
  both their ladder and their tracked documents regularly, and they forget. When an owner is
  puzzled by an agent's tile, the useful prompt is often: "ask the agent to update its work
  record (`write_tegami`: its phase, legs, and `--doc` for every document it is working on)."
  Say it plainly; it is the agent's job, and the owner prompting it is normal.
- **A work record looks stale.** Agents are lazy about `write_tegami`. The tile's View
  Work Record shows what the agent last wrote, not what it is doing; the live terminal is
  the truth. Suggest asking the agent to update its work record.
- **"Where is the document the agent was working on?"** Look at the agent's own Docs
  (メ → 📄 on its tile) first, then the team's Docs tab in Team commons, which lists what
  every member registered plus the plans and docs by project root.
- **"How do I make an agent the team lead?"** Team commons → Team Configuration, then
  **Make Lead** on that member's row. Also on the team's profile from the Coworks page, and
  as the **Make Team Lead** checkbox when adding a team member. Never from a tile.
