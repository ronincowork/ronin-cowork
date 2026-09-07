import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { storeDir } from '../resources.js';
import { isEntitled } from './flow.js';
import { clearClaimSecret, clearEntitlementToken } from './secrets.js';
import { maskEmail, readState as readActivation, writeState as writeActivation } from './state.js';

export type RegistrationStatus = 'optional' | 'anonymous' | 'pending' | 'registered';

export interface CommunicationPreferences {
  newsletter: boolean;
  release_updates: boolean;
  follow_up: string[];
  no_communication: boolean;
}

export interface RegistrationRecord {
  identity_mode: 'email' | 'anonymous';
  email_masked: string | null;
  purpose: string;
  kind: string;
  user_type: string;
  goals: string[];
  preferred_feature: string;
  reasons: string[];
  run_location: string;
  intended_use: string[];
  theme_preference: string;
  own_words: string;
  anonymous_packet_id: string;
  communication: CommunicationPreferences;
  submitted_at: string | null;
  updated_at: string;
}

const EMPTY: RegistrationRecord = {
  identity_mode: 'email',
  email_masked: null,
  purpose: '',
  kind: '',
  user_type: '',
  goals: [],
  preferred_feature: '',
  reasons: [],
  run_location: '',
  intended_use: [],
  theme_preference: '',
  own_words: '',
  anonymous_packet_id: '',
  communication: {
    newsletter: false,
    release_updates: false,
    follow_up: [],
    no_communication: true,
  },
  submitted_at: null,
  updated_at: new Date(0).toISOString(),
};

const file = () => path.join(storeDir('config'), 'registration.json');
const text = (value: unknown, max = 240) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const list = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.map((item) => text(item, 48)).filter(Boolean))].slice(0, 8)
  : [];
const packetId = () => {
  const alphabet = 'abcdefghjkmnpqrstvwxyz23456789';
  return `pkt_${[...randomBytes(26)].map((byte) => alphabet[byte % alphabet.length]).join('')}`;
};

export async function readRegistration(): Promise<RegistrationRecord> {
  try {
    const stored = JSON.parse(await fs.readFile(file(), 'utf8')) as Partial<RegistrationRecord>;
    return {
      ...EMPTY,
      ...stored,
      communication: { ...EMPTY.communication, ...(stored.communication ?? {}) },
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function writeRegistration(next: RegistrationRecord): Promise<RegistrationRecord> {
  const target = file();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, target);
  return next;
}

export async function deleteRegistration(): Promise<void> {
  await Promise.all([
    fs.rm(file(), { force: true }),
    clearClaimSecret(),
    clearEntitlementToken(),
  ]);
  await writeActivation({
    stage: 'not_requested', email_masked: null, activation_id: null,
    entitlement_id: null, terms_version: null, requested_at: null, verified_at: null,
    expires_at: null, resend_available_at: null, error_at_stage: null,
    error_message: null,
  });
}

export async function submitRegistration(input: Record<string, unknown>): Promise<RegistrationRecord> {
  const identityMode = input.identity_mode === 'anonymous' ? 'anonymous' : 'email';
  const email = text(input.email, 320);
  if (identityMode === 'email' && (!email || !/^\S+@\S+\.\S+$/.test(email))) throw new Error('Enter a valid email address or choose Anonymous.');
  const current = await readRegistration();
  return writeRegistration({
    ...current,
    identity_mode: identityMode,
    email_masked: identityMode === 'email' ? maskEmail(email) : null,
    purpose: text(input.purpose, 80),
    kind: text(input.kind, 80),
    user_type: text(input.user_type, 80),
    goals: list(input.goals),
    preferred_feature: text(input.preferred_feature, 80),
    reasons: list(input.reasons),
    run_location: text(input.run_location, 80),
    intended_use: list(input.intended_use),
    theme_preference: text(input.theme_preference, 24),
    own_words: text(input.own_words, 500),
    anonymous_packet_id: identityMode === 'anonymous' ? current.anonymous_packet_id || packetId() : '',
    submitted_at: current.submitted_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function updateCommunication(input: Record<string, unknown>): Promise<RegistrationRecord> {
  const current = await readRegistration();
  if (!current.submitted_at) throw new Error('Register before updating communication preferences.');
  const none = input.no_communication === true;
  return writeRegistration({
    ...current,
    communication: {
      newsletter: none ? false : input.newsletter === true,
      release_updates: none ? false : input.release_updates === true,
      follow_up: none ? [] : list(input.follow_up),
      no_communication: none,
    },
    updated_at: new Date().toISOString(),
  });
}

export async function registrationAnswer() {
  const [record, activation, entitled] = await Promise.all([
    readRegistration(), readActivation(), isEntitled().catch(() => false),
  ]);
  const status: RegistrationStatus = entitled ? 'registered' : record.submitted_at
    ? record.identity_mode === 'anonymous' ? 'anonymous' : 'pending'
    : 'optional';
  return {
    status,
    registered: status === 'registered',
    services_entitled: entitled,
    services_activation: activation.stage,
    identity_mode: record.identity_mode,
    email_masked: record.email_masked,
    purpose: record.purpose,
    kind: record.kind,
    user_type: record.user_type,
    goals: record.goals,
    preferred_feature: record.preferred_feature,
    reasons: record.reasons,
    run_location: record.run_location,
    intended_use: record.intended_use,
    theme_preference: record.theme_preference,
    own_words: record.own_words,
    communication: record.communication,
    submitted_at: record.submitted_at,
    updated_at: record.updated_at,
  };
}
