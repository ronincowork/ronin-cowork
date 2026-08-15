# ronin_sops — how this house goes about things

An **SOP** is the standard way this install approaches an area of work: source control,
data, getting a thing deployed. **Not the only way and not the right way** — the way, so
every session goes about it the same, and the_owner has one file to change when they want
it done differently.

**The shelf is defined by reach, not by length or audience.** If a catalog entry can
point at it, it belongs in `ronin_library/` — that shelf answers *how do I do this step*,
and is reached from the action or macro that needs it. An SOP is reached by **name**,
because no single action owns it.

**Short.** An SOP is a stance and an order of operations, not a manual. If it runs past a
screen it has stopped being a standard and become a how-to — and a how-to is either
library or nothing, because the agent reading it already knows the domain.

**No facts about a machine.** An SOP says where to look and what to establish first. It
never says what is installed, what is running, or where anything currently sits — those
are resolved (`bin/ronin-doctor`, `bin/ronin-store --all`), never written down. A written
fact about a box is wrong the day the box changes, and nobody notices.

**Where a domain has a measurable, name the tool.** An SOP carries a `> Tool:` line in its
header — the same form `ronin_catalogs/ACTIONS.md` uses, so the eye finds it in the same
place everywhere. That line is the discovery mechanism: reading the SOP is how an agent
learns the measurement exists, and running it is how the numbers stay true, since they
live in a terminal and never in a file. `data.md` names `tejun-survey`; `github.md` names
nothing, because git is git. The pointer is always to a **cataloged action's tool**, never
a loose script.

## The two voices

- **Written at the agent** — a house rule the agent applies itself. `documents.md`.
- **Written for the agent to relay** — a walkthrough for a person who does not know the
  domain, delivered by the agent. `github.md`, `data.md`, `deploy.md`.

Each SOP declares which it is in its header. Getting it wrong means the agent silently
follows a walkthrough itself instead of walking the_owner through it.

**Who they are for.** The_owner may know an area cold or may never have had a repo.
Nothing here is pushed at either of them — an SOP costs nothing until a situation calls
for it, and the situation is what selects the reader. That is the whole skill gate; there
is no other.

## How one reaches a session

Two routes, and neither pastes an SOP at a session that did not ask:

- an action cites one with `- **sop:** <name>`, and `ronin_bin/tejun` inlines it at
  compile — the_owner's copy winning whole-file, so a redefined SOP takes effect on the
  very next run and nobody goes looking for it;
- otherwise it is **found by name**, because `docs/SHELVES.md` says the shelf is there.
  (Nothing points a session at that map yet — the brief wiring is R32 in `KOTOBA.md`,
  held until the session boot is reworked.)

**Yours beats ours, file for file.** Your own SOPs live in the `sops` store
(`ronin-store sops` — never spell the path): a file there with the same name as a shipped
one replaces it whole, a new name sits beside stock, and an upgrade never touches your
store. Redefining one is how your sessions inherit *your* process instead of ours.

**Deliberately near-empty.** Stock SOPs are screened in one at a time, exactly like the
library.
