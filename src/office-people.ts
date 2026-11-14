/**
 * WHO IS IN THE OFFICE — the person behind a browser request, on an office_unit (KAN-478).
 *
 * In a hosted office every browser request arrives through the office's guard, which sets
 * `X-Forwarded-Email` (the verified sign-in email, lower-case) and replaces any copy the
 * browser sent; the unit's Ronin port is reachable only from the guard, so the header is
 * trusted. No header is a local caller inside the unit: an Agent or a shell.
 *
 * Roles come from `members.json` in the `office_unit` store, beside office_record.json, which
 * the kohai writes on assignment and on every membership change:
 *   {"members":[{"email":"a@x.com","role":"owner"},{"email":"b@y.com","role":"member"}],"at":"…"}
 * A role is a string (owner, member; later ones are new values). An email not in the file has
 * no role. The file is re-read when it changes (a watch on the store, never a timer).
 * Self-hosted (no office record) there is never a person: the header is not ours to trust.
 */
import type { IncomingMessage } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';
import { readOfficeRecord } from './office-record.js';
import { watchStore } from './ws/events.js';

export interface Person { email: string; role: string | null }

export const membersFile = (): string => path.join(storeDir('office_unit'), 'members.json');

let hosted = false;
let roles = new Map<string, string>();

/** members.json's roles by email; a file that is absent or will not read is no roles. */
export async function loadMembers(): Promise<void> {
  const next = new Map<string, string>();
  try {
    const raw = JSON.parse(await fs.readFile(membersFile(), 'utf8')) as { members?: unknown };
    for (const m of Array.isArray(raw?.members) ? raw.members : []) {
      const { email, role } = (m ?? {}) as { email?: unknown; role?: unknown };
      if (typeof email === 'string' && typeof role === 'string') next.set(email.trim().toLowerCase(), role);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`[office-people] members.json: ${(e as Error).message}`);
  }
  roles = next;
}

/** At start: in an office_unit, read the members and follow the file. Returns the unwatch. */
export async function startOfficePeople(): Promise<() => void> {
  hosted = (await readOfficeRecord()).hosting === 'office_unit';
  if (!hosted) return () => {};
  await loadMembers();
  return watchStore(storeDir('office_unit'), (file) => { if (path.basename(file) === 'members.json') void loadMembers(); });
}

/** The person a browser request or socket upgrade belongs to, or null for a local caller. */
export function person(req: IncomingMessage): Person | null {
  if (!hosted) return null;
  const header = req.headers['x-forwarded-email'];
  const email = (Array.isArray(header) ? header[0] : header)?.trim().toLowerCase();
  return email ? { email, role: roles.get(email) ?? null } : null;
}

/** The role an email holds now, after any change to members.json. */
export const roleOf = (email: string): string | null => roles.get(email) ?? null;
