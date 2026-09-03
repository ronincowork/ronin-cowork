/* THE SOCKETS — core-owned, empty by default, and empty is the free build.
 *
 * A service plugs in by calling these at registration (src/sockets-contract.ts is
 * the shape; docs/connector-contract.md is the meaning). Nothing here imports a
 * service, ever — check-kyokai holds that line. The counting sink (counts.ts) is
 * this same pattern's first instance and stays where it is; these four generalize it.
 *
 * Absence semantics, per slot: no boot hooks -> nothing starts; no born hooks ->
 * emit is a loop over nothing; no row contributors -> rows carry core fields only;
 * no routes -> the surface 404s and the client draws it opaque-and-inert. */
import type { BornInfo, RowFields, Sockets } from './sockets-contract.js';

type BootHook = { start(): void | Promise<void>; stop?(): void };
const bootHooks: BootHook[] = [];
const willBornHooks: Array<(name: string) => void | Promise<void>> = [];
const bornHooks: Array<(info: BornInfo) => void | Promise<void>> = [];
const birthLineHooks: Array<(name: string, agent: boolean) => Promise<string> | string> = [];
const endHooks: Array<(name: string, key: string) => void | Promise<void>> = [];
const rowContribs: Array<(session: string) => Promise<RowFields> | RowFields> = [];
const routeMounts: Array<(app: unknown) => void> = [];
let streamHandler: ((...args: unknown[]) => void) | undefined;

export const sockets: Sockets = {
  registerBoot: (h) => void bootHooks.push(h),
  onSessionWillBorn: (cb) => void willBornHooks.push(cb),
  onSessionBorn: (cb) => void bornHooks.push(cb),
  addBirthLines: (cb) => void birthLineHooks.push(cb),
  onSessionEnd: (cb) => void endHooks.push(cb),
  addRowFields: (cb) => void rowContribs.push(cb),
  addRoutes: (m) => void routeMounts.push(m),
  setStreamHandler: (h) => void (streamHandler = h),
};

/** Core calls these; a hook that throws costs its service one beat, never the caller. */
export async function startBootHooks(): Promise<void> {
  for (const h of bootHooks) {
    try {
      await h.start();
    } catch (e) {
      console.error('[sockets] boot hook failed:', e);
    }
  }
}
export function stopBootHooks(): void {
  for (const h of bootHooks) {
    try {
      h.stop?.();
    } catch {}
  }
}
export function emitSessionBorn(info: BornInfo): void {
  for (const cb of bornHooks) void Promise.resolve(cb(info)).catch((e) => console.error('[sockets] born hook:', e));
}
/** Awaited in order — a reused name's stale state must be gone BEFORE the create. */
export async function emitSessionWillBorn(name: string): Promise<void> {
  for (const cb of willBornHooks) {
    try {
      await cb(name);
    } catch (e) {
      console.error('[sockets] will-born hook:', e);
    }
  }
}
/** The brief lines services add at birth, concatenated in registration order. */
export async function collectBirthLines(name: string, agent: boolean): Promise<string> {
  let out = '';
  for (const cb of birthLineHooks) {
    try {
      out += await cb(name, agent);
    } catch (e) {
      console.error('[sockets] birth line:', e);
    }
  }
  return out;
}
export function emitSessionEnd(name: string, key: string): void {
  for (const cb of endHooks) void Promise.resolve(cb(name, key)).catch((e) => console.error('[sockets] end hook:', e));
}
export function getStreamHandler(): ((...args: unknown[]) => void) | undefined {
  return streamHandler;
}
/** Which services registered, by name (michi | koshi | rireki | counting | koe | gbrain).
 * Reported on /api/version so the client can draw an absent service's surfaces
 * opaque-and-inert instead of fetching into a 404 (the SWITCH, service half). */
const serviceNames: string[] = [];
export function noteService(name: string): void {
  serviceNames.push(name);
}
export function listServices(): string[] {
  return [...serviceNames];
}
/** Services that were THERE but did not load — a directory carrying a register entry whose
 * import threw. The assembler logs each one and carries on, which is right for the grid and
 * wrong for anyone asking "did the install work?": a short roster is indistinguishable from
 * a small one unless the shortfall is recorded. It is recorded here, by name and reason. */
const serviceFailures = new Map<string, string>();
export function noteServiceFailure(name: string, reason: string): void {
  serviceFailures.set(name, reason);
}
export function listServiceFailures(): { name: string; reason: string }[] {
  return [...serviceFailures].map(([name, reason]) => ({ name, reason }));
}
export async function collectRowFields(session: string): Promise<RowFields> {
  const out: RowFields = {};
  for (const cb of rowContribs) {
    try {
      Object.assign(out, await cb(session));
    } catch {}
  }
  return out;
}
export function mountServiceRoutes(app: unknown): void {
  for (const m of routeMounts) {
    try {
      m(app);
    } catch (e) {
      console.error('[sockets] route mount failed:', e);
    }
  }
}
