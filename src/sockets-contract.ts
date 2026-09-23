
export const CONTRACT_V = 7;

export interface LaunchIdentity {
  key: string;
  cli: string;
  strategy: 'minted' | 'isolated' | 'unbound';
  providerSession: string;
  home?: string;
  journalFile?: string;
  env: Record<string, string>;
  journal?: { format: string; root: string; pattern: string; idPath: string; childPath?: string };
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
export interface TranscriptSource { file: string; format: string; provider: string; session: string; dir: string }

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
  | 'journal_pending'; // bound and expected, but the CLI has not written the file yet

export type TranscriptLookup = { source: TranscriptSource } | { gap: TranscriptGap };

export interface Sockets {
  resolveTranscriptSource(name: string): Promise<TranscriptLookup>;
  registerBoot(hook: { start(): void | Promise<void>; stop?(): void }): void;
  onSessionWillBorn(cb: (name: string) => void | Promise<void>): void;
  onSessionBorn(cb: (info: BornInfo) => void | Promise<void>): void;
  addBirthLines(cb: (name: string, agent: boolean) => Promise<string> | string): void;
  onSessionEnd(cb: (name: string, key: string) => void | Promise<void>): void;
  addRowFields(cb: (session: string) => Promise<RowFields> | RowFields): void;
  addRoutes(mount: (app: unknown) => void): void;
  setStreamHandler(h: (...args: unknown[]) => void): void;
}

export interface ServiceRegistration {
  name: string; // the service folder name: michi | koshi | rireki | counting | koe | gbrain
  register(sockets: Sockets): void;
}
