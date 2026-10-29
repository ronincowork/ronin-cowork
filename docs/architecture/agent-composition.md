# What a Cowork Agent receives

Ronin calls the complete set of things given to one Cowork Agent its **Agent composition**.
The phrase means both the Agent's resolved settings and the documents that explain how to
use them. It has five parts:

1. **Tool capabilities** — the operational domains available to the Agent, each
   categorizing its tools. A composite tool remains a tool.
2. **Behaviors** — provider-neutral guidance for how the Agent works, including procedures
   previously classified separately as SOPs. Behaviors are floor, conditional, selected,
   or sought.
3. **Mandate** — the assignment boundary: Reach, Recruit, and Output, accompanied by base
   Ronin teaching that explains how the Agent interprets those values.
4. **Skills** — provider-native adaptations or teaching. They never own unique Ronin
   authority or business rules.
5. **Assignment** — the Agent's work and concrete designations, including whether the
   owner designated it Team lead.

Campaign and Team settings are inheritance layers for defaults. They are not additional
composition parts and do not create separate kinds of behavior. Installations, provider
availability, project roots, repository arrangements, Teams, and connections are facts
used to resolve the composition; a preset or template supplies editable starting values.

The [Tool surface](tool-surface.md) owns the definitions and authority boundaries for
tools, composite tools, capabilities, skills, UIs, and internal implementation.

## Values and teaching

Composition is not only a configuration record and not only a reading list. Each part
resolves the concrete value or authority, its provenance, and the teaching resources the
Agent needs to use it correctly:

| Part | Resolved substance | Teaching |
|---|---|---|
| Tool capability | callable tools and applicability | capability overview, boundary, and command help |
| Behavior | floor, matched conditional, selected, or sought awareness | full teaching for applied scopes; generated title, summary, and path only for sought |
| Mandate | Reach, Recruit, and Output values | base Ronin mandate teaching supplied to every Cowork Agent |
| Skill | installed provider-native package | its provider-native instructions, derived from Ronin-owned sources |
| Assignment | objective, work, and concrete designations | brief, Team and Workspace context, and applicable behavior teaching |

The receipt should make both sides inspectable. A named value without its necessary
teaching is an incomplete composition; teaching must not silently replace or invent the
resolved value.

## Resolution

The launch resolver combines explicit assignment choices, inherited Campaign and Team
defaults, installed facilities, provider state, and measured project-root facts. Its
result is one resolved Agent composition and birth packet: both the resolved values and
the resources needed to understand and use them. Defaults fill an unset choice; they do
not remain live links and do not rewrite an existing Agent.

```text
assignment + inherited defaults + installed and measured facts
                              ↓
                       launch resolver
                              ↓
 tool capabilities + behaviors + mandate + skills + assignment
```

Applicability must remain explicit. For example, selecting software-development behavior
does not manufacture a managed worktree: the Managed Worktree capability applies only when the
chosen project root and repository declaration resolve managed work. Likewise, enabling
an installation may make tools, behaviors, and skills available without making the
installation itself a behavior.

## Current Tool capabilities

- **Edges** — communication and coordination across Agents and Teams: `edges send`,
  `read`, `team`, `wipeboard`, `page`, `control`, and `schedule`.
- **Work Record** — the Agent's work record: `work-record read`, `update_record` and
  `workspace …`.
- **Work Item** — every act on a named work item: `item create`, `read`, `list`, `write`,
  `move`, `assign`, `plan`, `doc`, `evidence` and `focus`.
- **Session** — Agent creation, inspection, configuration, archive, restoration, and
  ending: `session_create`, `session_check`, `session_set`, `session_archive`,
  `session_restore`, and `session_end`.
- **Worktree Desk** — managed-worktree custody and delivery: `worktree-desk open`,
  `assign`, `status`, `sync`, `hand-in`, `close`, `handoff`, `discard`, `receipts`,
  `reply`, and `repository-init`.
- **Machine Settings** — Campaign, installation, provider, default, owner, and Workspace
  Folder configuration: `machine-settings …`.
- **Team** — Team record, membership and lead designation, the Team's reading of its work
  items, and Team forking: `team roster …`, `team member status`, and Team-related
  `session_set` operations.

An installed extension may add another Tool capability, but a capability without a real
tool is only proposed teaching and must not be presented as executable ability.

## Behaviors

A behavior owns normative, provider-neutral guidance. A short standing practice and a
long procedure are the same kind of artifact with different delivery rules.
“Procedure” may remain ordinary prose for steps within a Behavior; SOP is not a separate
Agent-composition part.

- **Floor** resolves and applies every file in `behaviours/floor/`.
- **Conditional** applies individual files whose authored launch predicates match.
- **Selected** applies individual files chosen explicitly or inherited through Agent →
  Team → Campaign composition.
- **Sought** applies no document. It generates awareness cards from every resolved file in
  `behaviours/sought/`; that shelf is currently empty.

Docs explain Ronin and remain ordinarily searchable without Build Brief awareness. A
working Agent's operational instruction belongs in a Behavior, capability, or tool help;
it must not require finding a docs page.

## Assignment and mandate

Assignment says what this Agent is doing and records concrete designations. Team lead is
one explicit designation, never inferred from activity or treated as a capability or
general role system. It may select additional Team-management teaching, but the operational
domain remains the Team capability.

Mandate is separate because it states the assignment boundary rather than teaching a
method:

- **Reach** — how far the Agent goes.
- **Recruit** — how it may form or extend a Team.
- **Output** — what it hands back.

An inherited mandate is a default. An explicit assignment mandate wins.

The current mandate lives in the work record (`writeMandate`, `src/tegami.ts`); the birth
mandate stays in the birth record. A newborn's mandate is chosen at creation and carried in
its birth brief, never written after birth. The Configuration's Update (owner, 2026-10-24;
`docs/architecture/birth-packet.md` §8) writes it there and sends the Agent its new brief as the
one message, with no record notice on top. Any other write to the record by anyone but the
Agent pushes it one fixed line, "Your work record changed; please read it (work-record read)."
(`ackRecord`, owner 2026-10-07); the record says what changed. A change to an item the Agent
holds is not a record write: its ack names the item and the change, "w64 KAN-27: a comment from
jira:x (item read w64)." (`ackHolders`, `src/work-items.ts`).

The record's `teams` block is Ronin's, one entry per Team: `team`, `team_role` (lead or
member) and the roster's `objective`; a lead's entry also lists `members`, leads marked
"(lead)". `teamChanged` (`src/tegami.ts`) derives it again on every roster write (objective,
title, defaults, holds, anything `PUT /api/team` or `PUT /api/team-rosters/:name` changes),
on a join, a leave, a lead change, a restore and a Team retire; `memberEnded` drops an ended
Agent from its leads' lists. Each record that changed gets the one-line ack, and the lead
gets it on every roster change; never for the Agent's own change. `work-record
update_record` carries the block through and `work-record read` shows it as stored.

The record's `configuration` line is Ronin's too: `{ title, project_root }`, written by
`writeConfiguration` at birth, on a restore, and on `PUT /api/sessions/:name/title` and
`POST /api/sessions/:name/project-root`, which ack it to the Agent unless the Agent made
the change. Adding a Behavior sends its own message carrying the teaching, which is the
notification. Brief and model have no write after birth.

Mandate teaching is part of the Ronin floor for every Cowork Agent. It is not selectable
and must not appear among elective behaviors. The floor page teaches what each Reach,
Recruit and Output value means; the brief carries a per-session copy (`MANDATES.md` in the
session's boot cache) that adds the Agent's own values from its current record, so a brief
resent after a Configuration change states the new mandate. This value-plus-teaching pattern is
fundamental to composition: stating a fact is insufficient when the Agent has not also
been taught what that fact means and how it governs its work.
