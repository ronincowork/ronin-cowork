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
Distinguish Campaign/Team defaults, brief settings, and owner resource shadowing.
The brief uses these facts to resolve what one Agent is told.

- Contracts: [The brief](architecture/brief.md#layers-and-brief-settings),
  [Installations](architecture/installations.md), [Shadowing](architecture/shadowing.md).
- Code: [campaign-scope.ts](../src/campaign-scope.ts),
  [instruction-cascade.ts](../src/instruction-cascade.ts), [resources.ts](../src/resources.ts),
  [agent-defaults.ts](../src/agent-defaults.ts).
- Tests: [agents.test.ts](../tests/agents.test.ts), [stores.test.ts](../tests/stores.test.ts).

## User interface

The browser composes surfaces and calls shared contracts. It does not become a second
writer of server truth. Desktop and phone share feature modules but have separate entries.

- Start at the [visible-surface ownership index](../public/js/README.md#visible-surface-ownership-index)
  for the UI → route → state → test path, then its detailed module map.
- Contracts: [UI](architecture/ui.md), [Workbench construction](architecture/workbench.md), [Workbench use](using-ronin/workbench.md),
  [UI wording](products/kokugo.md), [Agent glossary](../KOTOBA_GLOSSARY.md).
- Shared boundaries: [request.js](../public/js/request.js), [ui.js](../public/js/ui.js),
  [state.js](../public/js/state.js), and [store.js](../public/js/store.js) — the one `/events`
  socket and the resources the server pushes on it; a surface subscribes rather than polls
  ([the data path](architecture/data-path.md)). Entries: [main.js](../public/js/main.js), [phone.js](../public/js/phone.js).
- Tests: [terminal.test.ts](../tests/terminal.test.ts) for the tile's socket; the rendered page
  is `npm run smoke:ui`. A server test alone does not verify UI.

## Runtime and state

Separate live runtime facts, durable authorities, and projections. Start with the
[durable-state inventory](state-inventory.md) for exact writers, readers, and lifecycle boundaries.

- Contracts: [tmux and process boundaries](architecture/tmux-connection.md),
  [Session identity](architecture/session-identity.md), [Worktrees](architecture/worktrees.md).
- Code: [tmux-client.ts](../src/tmux-client.ts), [spawn-broker.ts](../src/spawn-broker.ts),
  [session-archive.ts](../src/session-archive.ts), [machine-settings.ts](../src/machine-settings.ts),
  [worktree lifecycle](../src/desks/lifecycle-ledger.ts).
- Tests: [agents.test.ts](../tests/agents.test.ts), [stores.test.ts](../tests/stores.test.ts),
  [promotion.test.ts](../tests/promotion.test.ts).

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
- Tests: Services `bin/verify`.

## Agent composition

One Agent is told facts, behaviours and tools at a depth, from its work record. Scope
provides the input rules; this surface owns the resulting brief and birth receipt.

- Contract: [The brief](architecture/brief.md).
- Inputs: the foundations in [ronin_stock](../ronin_stock/stock_readme.md): [facts](../ronin_stock/facts/facts_readme.md),
  [behaviours](../ronin_stock/behaviours/behaviours_readme.md), [tools](../ronin_stock/tools/tools_readme.md),
  [playbooks](../ronin_stock/playbooks/playbooks_readme.md).
- Code: [launch.ts](../src/routes/launch.ts), [agent-defaults.ts](../src/agent-defaults.ts),
  [catalog.ts](../src/catalog.ts), [brief-record.ts](../src/brief-record.ts),
  [brief-settings.ts](../src/brief-settings.ts), [brief.ts](../src/brief.ts),
  [brief-build.ts](../src/brief-build.ts), [agent-configuration.ts](../src/agent-configuration.ts),
  [birth-brief.ts](../src/birth-brief.ts).
- Tests: [agents.test.ts](../tests/agents.test.ts) (the brief an Agent is started with).

## Tools

A tool owns executable authority; its file in `ronin_stock/tools/` says what the brief
tells about it. Composite tools reuse guarded operations. UI and provider-native skills call or teach
these contracts without creating another authority.

- Contract: [The brief](architecture/brief.md#boundaries).
- Inventory: [tool files](../ronin_stock/tools/), [executables](../ronin_bin/).
- Follow the executable to its actual implementation: [worktree-desk](../ronin_bin/worktree-desk)
  uses [cli-api.ts](../src/routes/cli-api.ts) and [commands/desk.ts](../src/commands/desk.ts);
  [work-record](../ronin_bin/work-record) dispatches to [work-record-write](../libexec/work-record-write).
  Tools do not all share one transport.
- Tests: [tools.test.ts](../tests/tools.test.ts).

## Work Record

The Work Record is the Agent-authored account of its work, documents, work items, and
completion evidence. Coordination mechanisms support this surface; they do not replace
its name or become another work-record store.

- Contract: [Work record](using-ronin/work-record.md).
- Code path: [tegami-read.ts](../src/tegami-read.ts) → the Agent's card (`tegami`,
  [launch.ts](../src/routes/launch.ts) `cardOf`, marked by its writers in
  [events.ts](../src/ws/events.ts)) → the tile's work record
  ([tile.js](../public/js/tile.js), drawn by [work-record.js](../public/js/work-record.js)). Writes enter through
  [work-record](../ronin_bin/work-record) → [work-record-write](../libexec/work-record-write),
  which updates the authored block atomically; work item writes go through `item`
  to [work-items-api.ts](../src/routes/work-items-api.ts). [work-items.ts](../src/work-items.ts)
  is the one door to the work item store; [work-items-read.ts](../src/work-items-read.ts)
  derives the Agent, Team and unassigned readings; [tegami.ts](../src/tegami.ts) seeds the
  record and keeps its holder list.
- Supporting trace: [coordination](coordination-trace.md) links Team custody, messages,
  wipeboards, schedules, desks, hand-in, and promotion. Work Items
  ([work-items-surface.js](../public/js/work-items-surface.js)) reads the work items a Team
  and its members hold.
- Tests: [tools.test.ts](../tests/tools.test.ts), [stores.test.ts](../tests/stores.test.ts).

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
