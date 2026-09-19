# Contributor map — seven surfaces

This is the canonical codebase map consumed by contributor and bounty guidance. Keep this
path and the seven section anchors stable. Program documents link here; they do not own a
second surface taxonomy. Start with [AGENTS.md](../AGENTS.md) for the repository workflow.
Use the [repository layout](architecture/repository-layout.md) for directory and file
placement; this page maps cross-cutting product surfaces rather than folders.

These are change areas, not seven directories or seven UI objects. A feature can cross
several areas. [KOTOBA](../KOTOBA.md) defines the terms; the linked contracts own behavior.

| Surface | Question | Canonical entry |
|---|---|---|
| 1. Scope | Where does this apply, and which settings or resources win? | [Scope](#scope) |
| 2. User interface | Where does the owner discover and operate it? | [User interface](#user-interface) |
| 3. Runtime and state | What runs, and who owns the truth? | [Runtime and state](#runtime-and-state) |
| 4. Services and connections | Which optional part or external connection supplies it? | [Services and connections](#services-and-connections) |
| 5. Agent composition | What values and teaching does one Agent receive? | [Agent composition](#agent-composition) |
| 6. Capabilities and tools | Which executable contract does the work, and what teaches it? | [Capabilities and tools](#capabilities-and-tools) |
| 7. Work Record | How does the Agent represent its work and completion evidence? | [Work Record](#work-record) |

## Documentation audiences

[Using Ronin](README.md#evaluate-install-and-use-ronin), understanding its construction,
and planning its development are different reading tasks. This map is the construction
entry point. [Documentation ownership](development/documentation.md) keeps product guides,
current contracts, and the creators' Lab plans distinct without duplicating these surfaces.

## Scope

Scope describes applicability and inheritance, not a second Agent-composition package.
Distinguish Campaign/Team defaults, behavior delivery scope, and owner resource shadowing.
Agent composition uses these facts to resolve one Agent's package.

- Contracts: [Agent composition](architecture/agent-composition.md#resolution),
  [Installations](architecture/installations.md), [Shadowing](architecture/shadowing.md).
- Code: [campaign-scope.ts](../src/campaign-scope.ts),
  [instruction-cascade.ts](../src/instruction-cascade.ts), [resources.ts](../src/resources.ts),
  [agent-defaults.ts](../src/agent-defaults.ts).
- Tests: [campaign-scope.test.ts](../tests/campaign-scope.test.ts),
  [agent-defaults.test.ts](../tests/agent-defaults.test.ts), [capabilities.test.ts](../tests/capabilities.test.ts).

## User interface

The browser composes surfaces and calls shared contracts. It does not become a second
writer of server truth. Desktop and phone share feature modules but have separate entries.

- Start at the [visible-surface ownership index](../public/js/README.md#visible-surface-ownership-index)
  for the UI → route → state → test path, then its detailed module map.
- Contracts: [UI](architecture/ui.md), [Workbench construction](architecture/workbench.md), [Workbench use](using-ronin/workbench.md),
  [UI wording](products/kokugo.md), [Agent glossary](../KOTOBA_GLOSSARY.md).
- Shared boundaries: [request.js](../public/js/request.js), [ui.js](../public/js/ui.js),
  [state.js](../public/js/state.js). Entries: [main.js](../public/js/main.js), [phone.js](../public/js/phone.js).
- Tests: the index names a focused test for each visible surface. Browser diagnostics are
  explicit when rendered behavior needs checking; a server test alone does not verify UI.

## Runtime and state

Separate live runtime facts, durable authorities, and projections. Start with the
[durable-state inventory](state-inventory.md) for exact writers, readers, and lifecycle boundaries.

- Contracts: [tmux and process boundaries](architecture/tmux-connection.md),
  [Session identity](architecture/session-identity.md), [Worktrees](architecture/worktrees.md).
- Code: [tmux-client.ts](../src/tmux-client.ts), [spawn-broker.ts](../src/spawn-broker.ts),
  [session-archive.ts](../src/session-archive.ts), [machine-settings.ts](../src/machine-settings.ts),
  [worktree lifecycle](../src/desks/lifecycle-ledger.ts).
- Tests: [tmux-client.test.ts](../tests/tmux-client.test.ts),
  [spawn-broker.test.ts](../tests/spawn-broker.test.ts), [session-archive.test.ts](../tests/session-archive.test.ts),
  [desks.test.ts](../tests/desks.test.ts).

## Services and connections

Cowork owns the host and all browser UI. Optional parts are authored in `ronin_services`;
`src/services/` is their generated runtime placement, not a second source tree to edit.
A Services capability selects parts; an Agent tool capability teaches tools. Keep the two explicit.

- Services entry: [README](https://github.com/ronincowork/ronin-services/blob/dev/README.md),
  [manifest](https://github.com/ronincowork/ronin-services/blob/dev/services.json),
  [connector contract](https://github.com/ronincowork/ronin-services/blob/dev/connector-contract.md),
  [install contract](https://github.com/ronincowork/ronin-services/blob/dev/install-contract.md).
  Use those same paths in your matching Services desk for local work.
- Cowork contract: [Services activation construction](architecture/services-activation.md).
- User route: [Ronin Services](getting-started/services-activation.md).
- Code: [parts.ts](../src/parts.ts) plans what loads; [index.ts](../src/index.ts) imports and
  registers it; [sockets.ts](../src/sockets.ts) hosts hooks;
  [installed-api.ts](../src/routes/installed-api.ts) reports present, loaded, parked, and desired facts.
  [credential-store.ts](../src/credential-store.ts) owns connector credentials.
- Tests: [parts.test.ts](../tests/parts.test.ts),
  [service-capability-runtime.test.ts](../tests/service-capability-runtime.test.ts),
  [services-activation.test.ts](../tests/services-activation.test.ts), plus Services `bin/verify`.

## Agent composition

One Agent receives resolved capabilities, behaviors, mandate, skills, and assignment,
including their values, provenance, and teaching. Scope provides the input rules; this
surface owns the resulting package and birth receipt.

- Contract: [What a Cowork Agent receives](architecture/agent-composition.md).
- Inputs: [capabilities](../ronin_catalogs/capabilities/README.md),
  [behaviors](../ronin_catalogs/behaviours/README.md), [templates](../ronin_catalogs/templates/README.md).
- Code: [launch.ts](../src/routes/launch.ts), [agent-defaults.ts](../src/agent-defaults.ts),
  [capabilities.ts](../src/capabilities.ts), [behaviours.ts](../src/behaviours.ts),
  [birth-readme.ts](../src/birth-readme.ts).
- Tests: [capabilities.test.ts](../tests/capabilities.test.ts),
  [behaviours.test.ts](../tests/behaviours.test.ts), [session-boot.test.ts](../tests/session-boot.test.ts),
  [birth-receipt.test.ts](../tests/birth-receipt.test.ts).

## Capabilities and tools

A tool owns executable authority; a capability categorizes tools and teaches their use.
Composite tools reuse guarded operations. UI and provider-native skills call or teach
these contracts without creating another authority.

- Contract: [Tools and Agent capabilities](architecture/tool-surface.md).
- Inventory: [TOOLS.md](../ronin_catalogs/TOOLS.md),
  [capability index](../ronin_catalogs/capabilities/README.md), [executables](../ronin_bin/).
- Follow the executable to its actual implementation: [worktree-desk](../ronin_bin/worktree-desk)
  uses [cli-api.ts](../src/routes/cli-api.ts) and [commands/desk.ts](../src/commands/desk.ts);
  [work-record](../ronin_bin/work-record) dispatches to [work-record-write](../libexec/work-record-write).
  Tools do not all share one transport.
- Tests: [routine-tools.test.ts](../tests/routine-tools.test.ts),
  [tool-bundle-dispatchers.test.ts](../tests/tool-bundle-dispatchers.test.ts),
  [work-record.test.ts](../tests/work-record.test.ts).

## Work Record

The Work Record is the Agent-authored account of its work, documents, Projects, and
completion evidence. Coordination mechanisms support this surface; they do not replace
its name or become another work-record store.

- Contract: [Work record](using-ronin/work-record.md).
- Code path: [shingo.js](../public/js/shingo.js) →
  [sessions-api.ts](../src/routes/sessions-api.ts) (`GET /api/sessions/:name/tegami`) →
  [tegami-read.ts](../src/tegami-read.ts). Writes enter through
  [work-record](../ronin_bin/work-record) → [work-record-write](../libexec/work-record-write),
  which updates the authored block atomically. [tegami.ts](../src/tegami.ts) seeds the record
  and supports server-side custody/derived-field changes; [projects.ts](../src/projects.ts)
  defines Project shape.
- Supporting trace: [coordination](coordination-trace.md) links Team custody, messages,
  wipeboards, schedules, desks, hand-in, and promotion. [Team Kanban](using-ronin/team-kanban.md)
  is a derived reading of that evidence.
- Tests: [work-record.test.ts](../tests/work-record.test.ts),
  [tegami-read.test.ts](../tests/tegami-read.test.ts), [team-kanban.test.js](../tests/team-kanban.test.js);
  Services `tests/kanban.test.mts` checks the derived server view.

## Trace a visible behavior change

In the change description, name affected seams in this order. Mark an unaffected seam
briefly when its absence would otherwise be ambiguous; a small change needs no long checklist.

1. **UI:** discovery, operation, recovery, and removal in its owning module.
2. **API:** exact route and request/response contract.
3. **State:** authority, writer, projection, and migration/removal boundary.
4. **Services:** canonical part and manifest row, or core Cowork.
5. **Composition:** applicability, inherited inputs, and resulting values/teaching.
6. **Tool:** executable authority and capability teaching.
7. **Documentation:** owning contract, vocabulary, and affected user/Agent instructions.
8. **Tests:** focused seam checks and any necessary cross-surface journey.

Privacy, security, accessibility, failure recovery, and release apply across all seven.
Resolve competing writers before extending a feature. Individual Agents use focused checks
and report them at hand-in. The Team lead/release maintainer owns `npm run verify` for the
combined integration or release candidate; a lead may request an earlier run when needed.
See [verification guidance](development/verification.md). For combined Services changes,
also arrange `bin/verify --cowork /path/to/the/matching/ronin-cowork` from the Services desk.
