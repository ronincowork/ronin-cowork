import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';

/** Where the Services install stands. The email-confirmation stages are gone: a stored
 * record still carrying one reads as not_requested, so its Install action is offered again. */
export type Stage = 'not_requested' | 'installing' | 'installed' | 'error';
const STAGES: readonly Stage[] = ['not_requested', 'installing', 'installed', 'error'];

export interface ActivationState {
  stage: Stage;
  email_masked: string | null;
  entitlement_id: string | null;
  verified_at: string | null;
  error_at_stage: Stage | null;
  error_message: string | null;
  updated_at: string;
}

const EMPTY: ActivationState = {
  stage: 'not_requested',
  email_masked: null, entitlement_id: null, verified_at: null,
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
    const raw = JSON.parse(await fs.readFile(file(), 'utf8')) as Record<string, unknown>;
    const s: ActivationState = { ...EMPTY };
    for (const key of Object.keys(EMPTY) as (keyof ActivationState)[]) if (key in raw) (s as any)[key] = raw[key];
    return normalize(s);
  } catch {
    return { ...EMPTY };
  }
}

/** An obsolete email-loop stage (or an error raised in one) becomes not_requested. Nothing
 * else is touched: the entitlement identifier and the token file stay as they are. */
function normalize(s: ActivationState): ActivationState {
  const obsoleteError = s.stage === 'error' && s.error_at_stage !== 'installing';
  if (STAGES.includes(s.stage) && !obsoleteError) return s;
  return { ...s, stage: 'not_requested', error_at_stage: null, error_message: null };
}

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

export function publicState(s: ActivationState) {
  return {
    stage: s.stage,
    email_masked: s.email_masked,
    entitlement_id: s.entitlement_id,        // an identifier, not a credential
    verified_at: s.verified_at,
    error_at_stage: s.error_at_stage,
    error_message: s.error_message,
  };
}
