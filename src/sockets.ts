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
export async function emitSessionWillBorn(name: string): Promise<void> {
  for (const cb of willBornHooks) {
    try {
      await cb(name);
    } catch (e) {
      console.error('[sockets] will-born hook:', e);
    }
  }
}
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
const serviceNames: string[] = [];
export function noteService(name: string): void {
  serviceNames.push(name);
}
export function listServices(): string[] {
  return [...serviceNames];
}
const parkedServices = new Map<string, { routine?: string; reason?: string }>();
/** A part on disk that this server did not load: self-parked, or its Routine was off at start. */
export function noteServiceParked(name: string, routine?: string, reason?: string): void {
  parkedServices.set(name, { ...(routine ? { routine } : {}), ...(reason ? { reason } : {}) });
}
export function listParkedServices(): { name: string; routine?: string; reason?: string }[] {
  return [...parkedServices].map(([name, detail]) => ({ name, ...detail }));
}
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
