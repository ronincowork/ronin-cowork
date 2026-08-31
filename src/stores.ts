/**
 * STORES — every place Ronin writes outside a repo, declared exactly once.
 *
 * A ronin_machine is fungible: any box, any username, any home directory. Nothing
 * shipped may name a machine, a person or a place, so no module spells its own path.
 * It asks here, and this file is the only place in `src/` allowed to join a home
 * directory onto anything.
 *
 * THE TWO ROOTS, and the one sentence that decides which:
 *
 *   ronin_user_root   ~/ronin    the user's own — their choices, and what they told us
 *                                to keep. UNINSTALL LEAVES IT.
 *   ronin_data_root   ~/.ronin   ours — working state we can regenerate or lose.
 *                                UNINSTALL DELETES IT, and nothing of theirs goes too.
 *
 *   > If deleting it would lose the user's own work or their choices, it is user.
 *   > Everything else is ours.
 *
 * That is what makes DAIKUSAN's promise — "uninstall Ronin and what remains is the
 * work, with no trace of the tool" — true by construction instead of by care.
 *
 * WHY A TABLE AND NOT SIX DEFAULTS. Six subsystems each invented their own location,
 * spelling and override, and `RIREKI_DIR` ended up honoured in eight places and
 * hardcoded in two more — so setting it sent the letters one way and the tape the
 * other, silently. A default written twice is a divergence with a start date.
 *
 * BASH GETS THE SAME ANSWERS from `bin/ronin-store`, which carries the same table
 * because bin/ tooling stays zero-dependency. Two bindings is a drift risk, so it is
 * gated rather than trusted: `scripts/check-stores.mjs` resolves every store both ways
 * under several environments and fails `npm run verify` on any disagreement.
 *
 * ONE LAYOUT, NO FALLBACKS. There is no legacy path, no legacy variable and no migration
 * branch: a resolver that knows two answers is the two-sources-of-truth defect wearing a
 * compatibility badge. Data that predates this table is MOVED, once, by hand, and then the
 * old name never appears again — `check-place` fails the build if it does.
 */
import os from 'node:os';
import path from 'node:path';

export type RootId = 'user' | 'data';

/** How a resolved path was arrived at — reported by the doctor, never guessed at. */
export type StoreSource = 'env' | 'default';

export interface Store {
  /** Stable id. The env override is `RONIN_<ID>_DIR`, mechanically. */
  readonly id: string;
  readonly root: RootId;
  /** Path under the root. */
  readonly rel: string;
  readonly what: string;
  /**
   * Who makes the directory, and when. A repo holds code and never data, so no store
   * ships — each is created by the code that needs it, the first time it needs it
   * (DAIKUSAN). These two fields exist because that fact was kept by hand in three
   * separate places in DAIKUSAN.md, all of which had gone stale; the map is generated
   * from here now (`scripts/stores-map.mjs`). Not mirrored in `bin/ronin-store`: that
   * resolves paths, and prose is not a path.
   */
  readonly createdBy: string;
  readonly when: string;
}

/**
 * The roots, as they sit under the home directory. Exported because documentation must
 * show the DEFAULT layout, never this machine's resolved answer — a map that renders
 * differently per box is the thing JUSHO exists to stop. `scripts/stores-map.mjs` builds
 * DAIKUSAN's map from these rather than typing them.
 */
export const ROOT_REL: Record<RootId, string> = { user: 'ronin', data: '.ronin' };

/** The roots. `RONIN_USER_ROOT` / `RONIN_DATA_ROOT` move everything under them at once. */
export function rootDir(root: RootId): string {
  const home = os.homedir();
  const env = root === 'user' ? process.env.RONIN_USER_ROOT : process.env.RONIN_DATA_ROOT;
  return env?.trim() || path.join(home, ROOT_REL[root]);
}

/**
 * THE TABLE. Adding a store is adding a row — and answering the one sentence above
 * out loud, because `root` is the whole decision and it is not reversible for a user
 * who has already trusted us with the directory.
 */
export const STORES: readonly Store[] = [
  {
    id: 'session',
    root: 'data',
    rel: 'sessions',
    what: "one session's record — RIREKI's tape, the scroll, TEGAMI, koshi.json",
    createdBy: "RIREKI's recorder / MICHI",
    when: 'first taped byte, first letter',
  },
  {
    id: 'archived_sessions',
    root: 'data',
    rel: 'archived-sessions',
    what: 'manifests for resumable sessions whose tmux runtimes are stopped',
    createdBy: "cowork's session archive routes",
    when: 'a live session is archived',
  },
  {
    id: 'session_boot_cache',
    root: 'data',
    rel: 'session-boot',
    what: 'generated birth readings derived from live catalogs',
    createdBy: "cowork's `src/session-boot.ts`",
    when: 'an assisted session is launched',
  },
  {
    id: 'session_commands',
    root: 'data',
    rel: 'session-commands',
    what: 'per-session command projections for Cowork Agent births',
    createdBy: "cowork's `src/routine-tools.ts`",
    when: 'a Cowork Agent is launched',
  },
  {
    id: 'bench',
    root: 'data',
    rel: 'bench',
    what: "Koshi's bench datasets and results",
    createdBy: "Koshi's bench",
    when: 'first bench run',
  },
  {
    id: 'telemetry',
    root: 'data',
    rel: 'telemetry',
    what: 'what a TOMODACHI collector receives, one directory per install id',
    createdBy: 'a TOMODACHI collector',
    when: 'first day file received',
  },
  {
    id: 'ledger',
    root: 'data',
    rel: 'ledger',
    what: 'the spawn ledger — one line per session launched',
    createdBy: "cowork's spawn ledger",
    when: 'first session launched',
  },
  {
    id: 'sops',
    root: 'user',
    rel: 'sops',
    what: "the user's own standard operating procedures — files here shadow ronin_sops/ file-for-file",
    createdBy: 'the owner defining a procedure',
    when: 'first SOP written',
  },
  {
    id: 'library',
    root: 'user',
    rel: 'library',
    what: "the user's own reference shelf — files here shadow ronin_library/ file-for-file",
    createdBy: 'the owner adding a reference',
    when: 'first file added',
  },
  {
    id: 'session_boot',
    root: 'user',
    rel: 'session_boot',
    what: "what a NEW SESSION reads before anything else — all/, root/<name>/, job/<name>/; files here shadow ronin_session_boot/ file-for-file",
    createdBy: "cowork's `src/session-boot.ts`",
    when: 'the first session launched after this shipped, and again whenever a project_root is included',
  },
  {
    id: 'wipeboards',
    root: 'user',
    rel: 'wipeboards',
    what: 'the shared boards a set of sessions read and write — one .md per board',
    createdBy: "cowork's `src/wipeboards.ts`",
    when: 'first boot (the house board) or first board made',
  },
  {
    id: 'campaigns',
    root: 'user',
    rel: 'campaigns',
    what: "one campaign_config per file — the durable record of a body of work: its title, description, desk_profile and state. It owns no lists; the records that belong to it point back with campaign_id",
    createdBy: "cowork's `src/campaign-config.ts`",
    when: 'first boot after this shipped — the initial Campaign is seeded from the install',
  },
  {
    id: 'team_rosters',
    root: 'user',
    rel: 'team_rosters',
    what: "the durable record of each team — its team_role, objective and defaults; membership is never stored here (it lives on the sessions)",
    createdBy: "cowork's `src/team-rosters.ts`",
    when: 'first team roster written',
  },
  {
    id: 'desks',
    root: 'user',
    rel: 'desks',
    what: "the desk registry and its receipts — every open or parked desk, every hand-in receipt, one line per attempt; recovery state, so it outlives the install",
    createdBy: "cowork's `src/desks/registry.ts`",
    when: 'first desk opened',
  },
  {
    id: 'worktrees',
    root: 'user',
    rel: 'worktrees',
    what: "managed desks — one git worktree per repo desk under <repo>/<branch>, team lines under <repo>/team/<team>/dev, candidates under .candidates/; the owner's work, never ours to delete",
    createdBy: "cowork's `src/desks/desk.ts`",
    when: 'first desk opened',
  },
  {
    id: 'catalogs',
    root: 'user',
    rel: 'catalogs',
    what: "the user's own catalogs — PROJECT_ROOTS.md (the inclusion_list) and HOTWORDS.md",
    createdBy: "cowork's `src/project-roots.ts`",
    when: 'first project_root included',
  },
  {
    id: 'memory',
    root: 'user',
    rel: 'memory',
    what: 'OBOERU — what survives a session',
    createdBy: 'OBOERU',
    when: 'first thing remembered',
  },
  {
    id: 'config',
    root: 'user',
    rel: 'config',
    what: "the user's own settings — ronin.json, starting with the concurrency cap",
    createdBy: 'the owner saving a setting',
    when: 'first setting written',
  },
  {
    id: 'koshi_weights',
    root: 'user',
    rel: 'koshi_weights',
    what: 'local model weights and the pinned llama.cpp that serves them — data, re-downloadable, never in a repo',
    createdBy: "the koshi_weights service's setup.sh",
    when: 'the koshi_weights service installed',
  },
  {
    id: 'koshi_weights_service',
    root: 'user',
    rel: 'koshi_weights_service',
    what: "the koshi_weights service's own state — the install runner's state and log",
    createdBy: "the koshi_weights service's api (install-contract.md)",
    when: 'first standalone install pressed',
  },
  {
    id: 'gbrain_brain',
    root: 'user',
    rel: 'gbrain_brain',
    what: "the cabinet — the owner's gbrain brain repo of markdown; the one thing an uninstall never touches",
    createdBy: "the gbrain service's setup.sh",
    when: 'the gbrain service installed',
  },
  {
    id: 'gbrain_service',
    root: 'user',
    rel: 'gbrain_service',
    what: 'the gbrain service\'s own state — admin bootstrap env (0600), minted CLI tokens, the installed-by-ronin stamp',
    createdBy: "the gbrain service's setup.sh",
    when: 'the gbrain service installed',
  },
  {
    id: 'promotion_ledger',
    root: 'data',
    rel: 'promotion-ledger',
    what: 'team promotion receipts — one JSON per attempt to move a repository dev ref: exact SHAs, BYOIN proof, which refs advanced; recovery state and failure attribution',
    createdBy: "cowork's `src/promotion/receipts.ts`",
    when: 'first team promotion attempted',
  },
  {
    id: 'services_secrets',
    root: 'user',
    rel: 'services_secrets',
    what: "the install's own Ronin Services credentials — the pending claim secret and the durable entitlement token, one file each at 0600",
    createdBy: 'the Services activation flow, on first request',
    when: 'Ronin Services was requested',
  },
] as const;

const byId = new Map(STORES.map((s) => [s.id, s]));

/** The canonical override for a store, e.g. `RONIN_SESSION_DIR`. */
export const envName = (id: string): string => `RONIN_${id.toUpperCase()}_DIR`;

/** Resolve one store, and say how — the doctor prints the `source`, so it cannot lie. */
export function resolveStore(id: string): { dir: string; source: StoreSource } {
  const s = byId.get(id);
  if (!s) throw new Error(`unknown store '${id}' — the table is src/stores.ts`);

  const canonical = process.env[envName(id)]?.trim();
  if (canonical) return { dir: canonical, source: 'env' };

  return { dir: path.join(rootDir(s.root), s.rel), source: 'default' };
}

/** The path only. What almost every caller wants. */
export const storeDir = (id: string): string => resolveStore(id).dir;

// The whole-table readout an operator wants — every store, resolved, with the source and
// whether it exists yet — is `bin/ronin-store --all`, which `bin/ronin-doctor` prints. It
// is not duplicated here: a second implementation of the same readout is the very habit
// this file exists to end.
