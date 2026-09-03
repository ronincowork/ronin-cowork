
export const CONTRACT_V = 2;

export interface BornInfo {
  name: string;
  key?: string; // @ronin-key (<name>-<created-epoch>) — when the caller has it resolved
  role?: string; // session_role token — WHAT it is doing at birth; may be blank
  team?: string; // the team it was born onto, when the launch named one; may be blank
  root?: string; // project_root dir, when known
  cmd?: string; // what was started in the pane
}

export type RowFields = Record<string, unknown>;

export interface Sockets {
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
