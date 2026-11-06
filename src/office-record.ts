/**
 * THE OFFICE RECORD — hosted is a fact, not an inference.
 *
 * One file, `office.json` in the `office` store, written once by whoever provisions the
 * office (cloud-init on an office_host; a hand step on the test office) and never by Ronin.
 * Present: this Ronin is an office running on an office_host. Absent: it is self-hosted.
 * There is no third hosting state; a present file that cannot be read is a provisioning
 * fault and is reported as such, never as self-hosted.
 *
 * Everything that behaves differently in a hosted office asks here and nowhere else: the
 * Services account part, the Tomodachi sender, the Hermes house-gateway seed, the Setup
 * posture. `office_id` is an identifier, not authority (owner, 3 Nov 2026): HQ and the
 * gateway go on authorizing by their own credentials. The record only stops three parties
 * guessing the same string. Credentials never live in this file; they stay in
 * `services_secrets`.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { storeDir } from './resources.js';

export interface OfficeRecord {
  /** This office, as the office_registry and HQ name it. */
  office_id: string;
  /** The office_host this office runs on, as the fleet names it. */
  office_host: string;
  /** The gateway_office this office's house calls go to, reachable from inside the office. */
  gateway_office: string;
  provisioned_at: string;
}

export type OfficeView =
  | { hosting: 'self_hosted'; host: string }
  | { hosting: 'office_host'; record: OfficeRecord }
  | { hosting: 'unreadable'; error: string };

export const officeRecordFile = (): string => path.join(storeDir('office'), 'office.json');

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const name = (raw: Record<string, unknown>, key: keyof OfficeRecord): string => {
  const v = raw[key];
  if (typeof v !== 'string' || !NAME.test(v)) throw new Error(`${key} must be letters, digits, _ . - (up to 64)`);
  return v;
};

/** The record's shape, checked; throws with the field at fault. */
export function parseOfficeRecord(raw: unknown): OfficeRecord {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('office.json must be one object');
  const r = raw as Record<string, unknown>;
  const gateway = r.gateway_office;
  if (typeof gateway !== 'string') throw new Error('gateway_office must be a URL');
  let url: URL;
  try { url = new URL(gateway); } catch { throw new Error('gateway_office must be a URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('gateway_office must be an http(s) URL without credentials, query or fragment');
  }
  const provisioned_at = r.provisioned_at;
  if (typeof provisioned_at !== 'string' || Number.isNaN(Date.parse(provisioned_at))) throw new Error('provisioned_at must be a date');
  return { office_id: name(r, 'office_id'), office_host: name(r, 'office_host'), gateway_office: url.href.replace(/\/$/, ''), provisioned_at };
}

export async function readOfficeRecord(): Promise<OfficeView> {
  let text: string;
  try {
    text = await fs.readFile(officeRecordFile(), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { hosting: 'self_hosted', host: os.hostname() };
    return { hosting: 'unreadable', error: (e as Error).message };
  }
  try {
    return { hosting: 'office_host', record: parseOfficeRecord(JSON.parse(text)) };
  } catch (e) {
    return { hosting: 'unreadable', error: (e as Error).message };
  }
}

/** The one question most callers have. */
export async function isOfficeHost(): Promise<boolean> {
  return (await readOfficeRecord()).hosting === 'office_host';
}
