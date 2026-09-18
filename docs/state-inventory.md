# Durable-state inventory

The [Runtime and state surface](contributor-map.md#runtime-and-state) starts here. One fact
has one authority. An API aggregate, browser cache, or Kanban view is a projection.

Store identifiers resolve through [resources.ts](../src/resources.ts) / `ronin-store`;
never substitute an assumed home-directory path. This is an ownership map, not a backup
manifest. Live tmux facts are listed separately because they are not durable file stores.

## Durable authorities

| Truth | Authority and writer | Reader / projection | Lifecycle boundary |
|---|---|---|---|
| Machine and Campaign settings, installation choices, provider facts, defaults | [machine-settings.ts](../src/machine-settings.ts); [campaigns.ts](../src/campaigns.ts) uses its Campaign section | [machine-settings-api.ts](../src/routes/machine-settings-api.ts), [campaigns-api.ts](../src/routes/campaigns-api.ts) | Schema and migration belong with the settings writer; provider observations are measured facts |
| Registration / Services activation | `config` store: [registration.ts](../src/activation/registration.ts), [state.ts](../src/activation/state.ts); protected credentials in [secrets.ts](../src/activation/secrets.ts) | [services-activation-api.ts](../src/routes/services-activation-api.ts) | Explicit registration deletion and entitlement recovery; browser projections exclude secrets |
| Workspace Folders | Resolved catalog, [project-roots.ts](../src/project-roots.ts) | [catalogs.ts](../src/routes/catalogs.ts), launch and desk resolution | Catalog operations own update/removal; a path alone does not declare repository ownership |
| Repository arrangement | Each root's `RONIN_REPO`, read by [arrangement.ts](../src/desks/arrangement.ts) | Launch and managed-worktree tools | Repository-owned declaration; no branch-name inference |
| Archived sessions | `archived_sessions` manifests, [session-archive.ts](../src/session-archive.ts) | [sessions-api.ts](../src/routes/sessions-api.ts), [archives.js](../public/js/archives.js) | Explicit archive/restore/remove; a manifest is not a live session |
| Team identity, defaults, and Team-held Projects | `team_rosters`, [team-rosters.ts](../src/team-rosters.ts); custody operations in [team-projects.ts](../src/team-projects.ts) | [teams-api.ts](../src/routes/teams-api.ts), Team UI, launch | Team retirement and explicit Project assignment/return; **no membership or leads in this store** |
| Agent-authored work, documents, and held Projects | `session/<key>/tegami.md`; [work-record-write](../libexec/work-record-write) updates authored fields; [tegami.ts](../src/tegami.ts) seeds and supports custody/derived-field changes | [tegami-read.ts](../src/tegami-read.ts), [sessions-api.ts](../src/routes/sessions-api.ts), Services Kanban | One file with explicit field ownership; Team references and positioning are derived fields, not Agent-authored truth |
| Pending messages | `message_queue`, [message-queue.ts](../src/message-queue.ts) | [messages-api.ts](../src/routes/messages-api.ts), [message-queue.js](../public/js/message-queue.js) | Queue delivery, retry, force, and dismissal retain distinct outcomes |
| Wipeboards | `wipeboards`, [wipeboards.ts](../src/wipeboards.ts) | [wipeboards-api.ts](../src/routes/wipeboards-api.ts), [team-wipeboard.js](../public/js/team-wipeboard.js) | Domain owns expiry, unread state, and delivery; reads are not durable task evidence |
| Cron jobs | `jikan`, [jikan.ts](../src/jikan.ts) | [jikan-api.ts](../src/routes/jikan-api.ts), [team-jikan.js](../public/js/team-jikan.js) | Explicit schedule update/remove and delivery state |
| Managed worktrees and assignments | [registry.ts](../src/desks/registry.ts), [lifecycle-ledger.ts](../src/desks/lifecycle-ledger.ts), [settlement.ts](../src/desks/settlement.ts) | [desk.ts](../src/desks/desk.ts), [desks-api.ts](../src/routes/desks-api.ts) | Managed lifecycle owns custody and cleanup; ledger events provide recovery evidence |
| Hand-in and promotion evidence | [desk receipts](../src/desks/receipts.ts), [promotion receipts](../src/promotion/receipts.ts) | Desk/promotion tools and Services Kanban | Preserve receipts and Git containment evidence; review state is not inferred from phase prose |
| Ronin HQ request history | [egress.ts](../src/activation/egress.ts), appended by [transport.ts](../src/activation/transport.ts) | [services-activation-api.ts](../src/routes/services-activation-api.ts) | Request metadata only, including failures; not a log of model-provider traffic or every network request |
| Connector credentials | `services_secrets`, [credential-store.ts](../src/credential-store.ts) and activation secret writer | Server-side connectors | Protected writes/removal; never return credential values through settings/home APIs |
| Services-owned data | Each part's store and writer in [services.json](https://github.com/ronincowork/ronin-services/blob/dev/services.json) | Canonical part implementation; Cowork UI reads its API | The owning service's install/uninstall contract specifies what is retained and removed |
| Browser preferences and drafts | Relevant client module's browser storage, e.g. [state.js](../public/js/state.js) | UI only | Presentation persistence; never authority for server operations |

## Live and derived facts

**Membership and Team lead are session facts.** [tmux.ts](../src/tmux.ts) reads and writes
session tags and lead designations through [tmux-client.ts](../src/tmux-client.ts).
[sessions-api.ts](../src/routes/sessions-api.ts) exposes their operations and live Team
projection. [teams-api.ts](../src/routes/teams-api.ts) rejects `members`, `sessions`, and
lead fields in roster writes. Archive manifests preserve a restoration snapshot; they do
not compete with the current live session.

Live runtime identity also includes the session key resolved by
[session-dir.ts](../src/session-dir.ts). Process existence and runtime options belong to
the session lifecycle, not a new JSON roster. Tests use the managed test-server helper.

The [Work Record surface](contributor-map.md#work-record) owns the authored account.
[Coordination](coordination-trace.md) and [Team Kanban](using-ronin/team-kanban.md) connect it
to other authorities without becoming another writer.

When adding durable state, update this inventory and the nearest implementation contract.
Name schema, permissions, writer, readers, migration, backup/retention expectations, and
removal behavior there. After changing an installed box or owner stores, use `npm run byoin`
to inspect customization surfaces; source-only edits use the repository verification route.
