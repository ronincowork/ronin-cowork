/**
 * SECRETS — one step to hand an Agent a secret (w385). One file per secret in the
 * services_secrets store, mode 0600, written atomically. A value goes in and never comes
 * back out: nothing here reads one, and no answer carries one. An Agent uses a secret by its
 * path (`secret path <name>`).
 *
 * An Agent asks with `secret ask`: the ask rides its home row (`secret_ask`), its tile opens a
 * paste field, and the owner saves or cancels. The asking request is held until then and is
 * answered "saved" or "cancelled" only.
 *
 * A secret may carry an expiry date (KAN-417), so a key is noticed before it lapses. The dates
 * live beside the values in one file, `secrets-expiry.json` ({ name: "YYYY-MM-DD" }), never in a
 * value file, which tools read as-is. Its dot keeps it out of the names.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';
import { sockets } from './sockets.js';

export class SecretBadInput extends Error {}

const NAME = /^[a-z0-9_-]+$/;
export const secretsDir = (): string => storeDir('services_secrets');
const dir = secretsDir;

export function secretFile(name: string): string {
  if (!NAME.test(name)) throw new SecretBadInput(`"${name}" is not a secret name: use a-z, 0-9, _ and -.`);
  return path.join(dir(), name);
}

async function writePrivate(file: string, body: string): Promise<void> {
  await fs.mkdir(dir(), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, body, { mode: 0o600 });
  await fs.rename(tmp, file);
}

const expiryFile = (): string => path.join(dir(), 'secrets-expiry.json');

/** Every expiry date, by name. */
export async function secretExpiries(): Promise<Record<string, string>> {
  try {
    const all = JSON.parse(await fs.readFile(expiryFile(), 'utf8'));
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch { return {}; }
}

/** A date as YYYY-MM-DD; empty (or "none") means no expiry. */
export function expiryDate(date: string): string {
  const day = date.trim();
  if (!day || day === 'none') return '';
  const real = /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T00:00:00Z`).toISOString().startsWith(day);
  if (!real) throw new SecretBadInput(`"${day}" is not a date: use YYYY-MM-DD, or none.`);
  return day;
}

/** Set or clear one secret's expiry; the value is not touched. */
export async function setSecretExpiry(name: string, date: string): Promise<string> {
  secretFile(name);
  const day = expiryDate(date);
  const all = await secretExpiries();
  if (day) all[name] = day; else delete all[name];
  await writePrivate(expiryFile(), `${JSON.stringify(all, null, 2)}\n`);
  return day;
}

export async function saveSecret(name: string, value: string, expires = ''): Promise<string> {
  const file = secretFile(name);
  if (!value) throw new SecretBadInput('An empty secret is not saved.');
  expiryDate(expires);
  await writePrivate(file, value);
  await setSecretExpiry(name, expires);
  return file;
}

/** The names in the store, never a value. */
export async function secretNames(): Promise<string[]> {
  try {
    return (await fs.readdir(dir(), { withFileTypes: true }))
      .filter((entry) => entry.isFile() && NAME.test(entry.name)).map((entry) => entry.name).sort();
  } catch { return []; }
}

// ── The asks: one open per Agent, on its home row ──
type Answer = 'saved' | 'cancelled';
interface Ask { name: string; for: string; done: (answer: Answer) => void }
const asks = new Map<string, Ask>();

sockets.addRowFields((session) => {
  const ask = asks.get(session);
  return { secret_ask: ask ? { name: ask.name, for: ask.for } : null };
});

/** Open a paste field on the Agent's tile; resolves when the owner saves or cancels. A newer ask replaces it. */
export function askSecret(session: string, name: string, what = ''): Promise<Answer> {
  secretFile(name);
  asks.get(session)?.done('cancelled');
  return new Promise((resolve) => {
    const ask: Ask = {
      name, for: what.slice(0, 200),
      done: (answer) => {
        if (asks.get(session) === ask) asks.delete(session);
        sockets.rowChanged(session);
        resolve(answer);
      },
    };
    asks.set(session, ask);
    sockets.rowChanged(session);
  });
}

/** The owner's answer on a tile: a value saves it, none cancels. Without an ask, a value is just saved. */
export async function answerSecret(name: string, value: string | null, session = '', expires = ''): Promise<Answer> {
  const ask = session ? asks.get(session) : undefined;
  if (ask && ask.name !== name) throw new SecretBadInput(`${session} asked for ${ask.name}, not ${name}.`);
  if (value == null) { ask?.done('cancelled'); return 'cancelled'; }
  await saveSecret(name, value, expires);
  ask?.done('saved');
  return 'saved';
}

/** The asking Agent went away (its command stopped): close its field. */
export function dropAsk(session: string, name: string): void {
  const ask = asks.get(session);
  if (ask?.name === name) ask.done('cancelled');
}
