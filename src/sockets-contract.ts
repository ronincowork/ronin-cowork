
export const CONTRACT_V = 9;

export interface LaunchIdentity {
  key: string;
  cli: string;
  strategy: 'minted' | 'isolated' | 'unbound';
  providerSession: string;
  home?: string;
  journalFile?: string;
  env: Record<string, string>;
  journal?: { format: string; root: string; pattern: string; idPath: string; childPath?: string;
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

export type RowFields = Record<string, unknown>;

/** `dir` is the session folder: where a part keeps files of its own beside Core's. */
/**
 * `file` is the CURRENT segment — provenance, and what a watch routes on. `files` is the
 * ordered chain when one birth's journal spans several segments, oldest first, and `file`
 * is its last. Absent for every identity whose journal is a single pinned file.
 */
export interface TranscriptSource { file: string; format: string; provider: string; session: string; dir: string; files?: string[] }

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
  | 'unbound'         // identity exists; this CLI writes no journal Ronin can read
  | 'journal_ambiguous' // two parent segments the source gives no strict order for — see launch-journal.ts
  | 'journal_pending'; // bound and expected, but the CLI has not written the file yet

/** `reason` names the thing that caused the gap — a file, a clash — when there is one to name. */
export type TranscriptLookup = { source: TranscriptSource } | { gap: TranscriptGap; reason?: string };

export interface Sockets {
  resolveTranscriptSource(name: string): Promise<TranscriptLookup>;
  registerBoot(hook: { start(): void | Promise<void>; stop?(): void }): void;
  onSessionWillBorn(cb: (name: string) => void | Promise<void>): void;
  onSessionBorn(cb: (info: BornInfo) => void | Promise<void>): void;
  addBirthLines(cb: (name: string, agent: boolean) => Promise<string> | string): void;
  onSessionEnd(cb: (name: string, key: string) => void | Promise<void>): void;
  addRowFields(cb: (session: string) => Promise<RowFields> | RowFields): void;

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
  addRoutes(mount: (app: unknown) => void): void;
  setStreamHandler(h: (...args: unknown[]) => void): void;
}

export interface ServiceRegistration {
  name: string; // the service folder name: michi | koshi | rireki | counting | koe | gbrain
  register(sockets: Sockets): void;
}
