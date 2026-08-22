/* THE CONNECTOR CONTRACT — types only, no runtime code, no imports.
 *
 * This file crosses the repo boundary: cowork owns the original, ronin-services
 * carries a versioned copy. A service compiles against these shapes; a mismatch
 * fails tsc in the services repo, never at a tenant. The human half of this
 * contract — what each socket means and promises — is docs/connector-contract.md,
 * and that doc wins any argument this file's names start.
 * Bump CONTRACT_V on any breaking change to these shapes. */

export const CONTRACT_V = 1;

/** What a session birth looks like to a LAUNCH hook. */
export interface BornInfo {
  name: string;
  key?: string; // @ronin-key (<name>-<created-epoch>) — when the caller has it resolved
  role?: string; // job_role token — WHO the session is, fixed at birth
  task?: string; // session_task token — WHAT it is doing at birth; either may be blank
  root?: string; // project_root dir, when known
  cmd?: string; // what was started in the pane
}

/** Extra fields a service contributes to one session's roster row. */
export type RowFields = Record<string, unknown>;

/** The four sockets, as a service sees them at registration time. */
export interface Sockets {
  /** Boot socket: run your timers/janitors; stop() is called at shutdown. */
  registerBoot(hook: { start(): void | Promise<void>; stop?(): void }): void;
  /** LAUNCH socket, pre-create: the name is claimed but the session does not exist
   * yet (rireki resets a reused name's stale tape here). Awaited, in order. */
  onSessionWillBorn(cb: (name: string) => void | Promise<void>): void;
  /** LAUNCH socket: called at every session birth path, after the session exists. */
  onSessionBorn(cb: (info: BornInfo) => void | Promise<void>): void;
  /** LAUNCH socket, brief lines: strings appended to the opening brief (michi seeds
   * the letter and returns the line naming it). Empty string = silent. */
  addBirthLines(cb: (name: string, agent: boolean) => Promise<string> | string): void;
  /** END socket: a session is being deleted; key was resolved before the kill. */
  onSessionEnd(cb: (name: string, key: string) => void | Promise<void>): void;
  /** ROW socket: contribute fields to /api/home rows; return {} when silent. */
  addRowFields(cb: (session: string) => Promise<RowFields> | RowFields): void;
  /** ROUTES socket: mount your HTTP routes; called once with the express app. */
  addRoutes(mount: (app: unknown) => void): void;
  /** The 🔓 stream (tape) ws handler — one owner (rireki). Absent = the client is
   * told the unlocked view is off, and falls back to 🔒 locked. */
  setStreamHandler(h: (...args: unknown[]) => void): void;
}

/** What a service ships: one register() entry point. */
export interface ServiceRegistration {
  name: string; // the service folder name: michi | koshi | rireki | counting | koe | gbrain
  register(sockets: Sockets): void;
}
