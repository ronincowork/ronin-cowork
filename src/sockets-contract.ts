
import type { TrailLine, WorkItem } from './work-items.js';

export const CONTRACT_V = 16;

/** One row of HQ's Models table: `cli` + `id` exactly as that CLI lists the model. A fact HQ
 *  doesn't have is absent, never guessed. Prices are USD per million tokens. */
export interface CatalogModel {
  cli: string;
  id: string;
  name?: string;
  tier?: string;
  use_for?: string;
  context?: number;
  output?: number;
  price?: { input?: number; output?: number };
  released?: string;
  knowledge?: string;
  reasoning?: boolean;
  tools?: boolean;
}
/** The catalog in Glen's order, which is the picker's order within a tier. */
export interface ModelCatalog { at?: string; models: CatalogModel[] }

export interface LaunchIdentity {
  key: string;
  cli: string;
  strategy: 'minted' | 'isolated' | 'unbound';
  providerSession: string;
  home?: string;
  journalFile?: string;
  env: Record<string, string>;
  /** `idPath` names the session id in a segment file's first line. Absent, the journal is ONE
   *  store file the birth owns (`root`/`pattern`, e.g. Hermes's state.db), not a chain of segments. */
  journal?: { format: string; root: string; pattern: string; idPath?: string; childPath?: string;
    /** Where the header carries the segment's own time — the authority for ordering a
     *  continuation chain. Defaults to the top-level `timestamp` both CLIs already write. */
    tsPath?: string };
}

export interface BornInfo {
  identity?: LaunchIdentity;
  name: string;
  key?: string; // @ronin-key (<name>-<created-epoch>) — when the caller has it resolved
  team?: string; // the team it was born onto, when the launch named one; may be blank
  root?: string; // project_root dir, when known
  cmd?: string; // what was started in the pane
}

export interface ItemChange { item: WorkItem; line: TrailLine }

export type RowFields = Record<string, unknown>;

/** `dir` is the session folder: where a part keeps files of its own beside Core's. */
/**
 * `file` is the CURRENT segment — provenance, and what a watch routes on. `files` is the
 * ordered chain when one birth's journal spans several segments, oldest first, and `file`
 * is its last. Absent for every identity whose journal is a single pinned file.
 */
/** `root`: the folder a birth owns for its journal (an isolated CLI, e.g. Codex), which may file
 *  segments in subfolders; absent when the journal sits in a folder shared with other births.
 *  A CLI that keeps no log has a source too: `format` 'terminal' and an empty `file`, so its
 *  output lives in the same session folder, written by the terminal read alone. */
export interface TranscriptSource { file: string; format: string; provider: string; session: string; dir: string; files?: string[]; root?: string }

/**
 * WHY THERE IS NO SOURCE, when there is none. Core knows which of these it hit; before
 * this it returned null and the part had one sentence for four different situations, so
 * a session that simply is not running read the same as one whose CLI keeps no journal.
 * Core reports the state; the part chooses the words its surface shows.
 */
export type TranscriptGap =
  | 'not_live'        // no live pane for that name
  | 'no_key'          // the pane is live, but it carries no Ronin identity key at all
  | 'no_identity'     // the pane has a key, but no launch identity was persisted for it
  | 'journal_pending'; // bound and expected, but the CLI has not written the file yet

export type TranscriptLookup = { source: TranscriptSource } | { gap: TranscriptGap };

export interface Sockets {
  resolveTranscriptSource(name: string): Promise<TranscriptLookup>;
  /** `started` runs once every part's start() has finished and Ronin is listening, so it sees what
   *  they set up (Ronin models' rows); it is not awaited, so a long one never holds Ronin's start (KAN-721). */
  registerBoot(hook: { start(): void | Promise<void>; started?(): void | Promise<void>; stop?(): void }): void;
  onSessionWillBorn(cb: (name: string) => void | Promise<void>): void;
  onSessionBorn(cb: (info: BornInfo) => void | Promise<void>): void;
  addBirthLines(cb: (name: string, agent: boolean) => Promise<string> | string): void;
  onSessionEnd(cb: (name: string, key: string) => void | Promise<void>): void;
  /**
   * A reader registered interest in a session — the tab's own {t:'watch'}. A part may use it
   * to make sure it is watching that Agent's journal at all.
   *
   * It is not a read, and looking at an Agent already being watched changes nothing. But if
   * nothing is watching that birth, installing a watcher is what installing always is:
   * watch first, then catch up what was written while nobody was. The owner: "if you get a
   * new watcher because the old one died, it will then catch up the transcript to the
   * journal."
   */
  onTranscriptWatch(cb: (session: string) => void | Promise<void>): void;
  addRowFields(cb: (session: string) => Promise<RowFields> | RowFields): void;
  /** tmux reported output on this Agent's pane: the terminal read's one trigger. */
  onPaneActivity(cb: (session: string) => void): void;
  /** A part wrote something a home row shows: push the rows now, not on a clock. */
  rowChanged(session: string): void;

/**
 * WHO IS WATCHING A CONVERSATION, and how a part reaches them.
 *
 * Connections belong to Core: it owns the socket, the registration a browser sends, and
 * throwing that registration away when the socket closes. What a reading ADMITS belongs to
 * the transcript part, which owns the readings table. Neither can do the other's half.
 *
 * So Core offers this: for every connection watching `session`, ask the part to make the
 * message for the reading that connection named, and send it. `make` is called once per
 * distinct reading in play, not once per connection, and returning null sends that watcher
 * nothing at all — which is how a Chat watcher receives no tool record. The return is how
 * many connections were written to.
 */
  deliverToWatchers(session: string, make: (reading: string) => unknown | null): number;
  /**
   * THE ITEM SOCKET. Called after every saved work-item write, once per trail line, fire
   * and forget: the item as saved and the line that write appended. A throw is logged and
   * never fails the write.
   */
  onItemChanged(cb: (change: ItemChange) => void | Promise<void>): void;
  addRoutes(mount: (app: unknown) => void): void;
  /**
   * THE SEAT SOCKETS (KAN-734): a gecko drives the office from outside on a token. Sign-in
   * asks this for a Bearer that is not the CLI token; a seat answered makes the call that
   * seat's (every self-named caller field becomes its name), null is a 401. No cache.
   */
  addBearerCheck(cb: (token: string) => Promise<{ seat: string; status: string } | null>): void;
  /** The seats are this list: each is put in or has its status changed, every seat not listed
   *  goes with its inbox. A live Agent's name is skipped and logged. */
  setSeats(seats: Array<{ name: string; status: string }>): Promise<void>;
  /** Since the seat's last look, and the cursor moves. Nothing new: waits up to waitSeconds
   *  (at most 90) for the first entry. */
  readInbox(seat: string, waitSeconds?: number): Promise<Array<{ at: string; from: string; channel: string; text: string }>>;
  /** THE MODEL CATALOG (KAN-828): HQ's Models table, whole, as the unit's models.json has it.
   *  Cowork keeps it in its own store, so a restart or a stopped park still has the last one. */
  setModels(catalog: ModelCatalog): Promise<void>;
  setStreamHandler(h: (...args: unknown[]) => void): void;
}

export interface ServiceRegistration {
  name: string; // the service folder name: project_management | rireki | counting | koe
  register(sockets: Sockets): void;
}
