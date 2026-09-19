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
| Assignment | objective, work, and concrete designations | brief, Team/project context, and applicable behavior teaching |

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
- **Work Record** — the Agent's work record, documents, and held Projects:
  `work-record read`, `update_record`, `document …`, and `project …`.
- **Session** — Agent creation, inspection, configuration, archive, restoration, and
  ending: `session_create`, `session_check`, `session_set`, `session_archive`,
  `session_restore`, and `session_end`.
- **Worktree Desk** — managed-worktree custody and delivery: `worktree-desk open`,
  `assign`, `status`, `sync`, `hand-in`, `close`, `handoff`, `discard`, `receipts`,
  `reply`, and `repository-init`.
- **Machine Settings** — Campaign, installation, provider, default, owner, and Workspace
  Folder configuration: `machine-settings …`.
- **Team** — Team record, membership and lead designation, Team-held Projects, assignment,
  return, status, and Team forking: `team roster …`, `team project …`, `team member
  status`, and Team-related `session_set` operations.

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

Mandate teaching is part of the Ronin floor for every Cowork Agent. It is not selectable
and must not appear among elective behaviors. This value-plus-teaching pattern is
fundamental to composition: stating a fact is insufficient when the Agent has not also
been taught what that fact means and how it governs its work.
