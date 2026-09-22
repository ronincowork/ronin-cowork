
export const CONTRACT_V = 4;

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

export interface TranscriptSource { file: string; format: string; provider: string; session: string }

export interface Sockets {
  resolveTranscriptSource(name: string): Promise<TranscriptSource | null>;
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
