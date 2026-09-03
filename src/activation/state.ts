/**
 * THE LOCAL ACTIVATION STATE MACHINE — durable, and persisted BEFORE anything is reported.
 *
 *   not_requested → requesting → awaiting_email → verified → installing → installed
 *
 *   awaiting_email → expired | cancelled | address_changed
 *   any active stage → error, and a retry resumes the SAME stage
 *
 * WHY THE ORDER MATTERS. Every transition is written to disk before the browser is told it
 * succeeded. Report-then-persist would mean a crash in that gap leaves a person looking at
 * "check your email" while the install has no memory of having asked — so they ask again,
 * and a second email goes out for an activation that already exists.
 *
 * The non-secret half lives in Ronin configuration where the owner can read it. The claim
 * secret and entitlement token live in the secret store and are never in this record.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';

export type Stage =
  | 'not_requested' | 'requesting' | 'awaiting_email' | 'verified'
  | 'installing' | 'installed'
  | 'expired' | 'cancelled' | 'address_changed' | 'error';

export interface ActivationState {
  stage: Stage;
  /** Masked for display. The full address is only ever sent to HQ, never shown back. */
  email_masked: string | null;
  activation_id: string | null;
  entitlement_id: string | null;
  terms_version: string | null;
  requested_at: string | null;
  verified_at: string | null;
  expires_at: string | null;
  resend_available_at: string | null;
  /** The last stage an error interrupted, so a retry resumes rather than restarts. */
  error_at_stage: Stage | null;
  error_message: string | null;
  updated_at: string;
}

const EMPTY: ActivationState = {
  stage: 'not_requested',
  email_masked: null, activation_id: null, entitlement_id: null, terms_version: null,
  requested_at: null, verified_at: null, expires_at: null, resend_available_at: null,
  error_at_stage: null, error_message: null, updated_at: new Date(0).toISOString(),
};

const file = () => path.join(storeDir('config'), 'services-activation.json');

export function maskEmail(value: string): string {
  const at = value.lastIndexOf('@');
  if (at <= 0) return '***';
  const user = value.slice(0, at);
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(2, user.length - 1))}@${value.slice(at + 1)}`;
}

export async function readState(): Promise<ActivationState> {
  try {
    const raw = await fs.readFile(file(), 'utf8');
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<ActivationState>) };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * PERSIST, THEN RETURN. Callers must await this before answering the browser — that is the
 * entire durability guarantee, and it only holds if nobody skips it.
 */
export async function writeState(patch: Partial<ActivationState>): Promise<ActivationState> {
  const next: ActivationState = {
    ...(await readState()), ...patch, updated_at: new Date().toISOString(),
  };
  const f = file();
  await fs.mkdir(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, f);
  return next;
}

/** What the browser is allowed to see. No secret has ever been in this record anyway. */
export function publicState(s: ActivationState) {
  return {
    stage: s.stage,
    email_masked: s.email_masked,
    entitlement_id: s.entitlement_id,        // an identifier, not a credential
    terms_version: s.terms_version,
    requested_at: s.requested_at,
    verified_at: s.verified_at,
    expires_at: s.expires_at,
    resend_available_at: s.resend_available_at,
    error_at_stage: s.error_at_stage,
    error_message: s.error_message,
  };
}
