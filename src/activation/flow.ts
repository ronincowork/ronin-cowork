import { callHq, EgressRefused } from './transport.js';
import {
  getClaimSecret, putClaimSecret, putEntitlementToken, clearClaimSecret, getEntitlementToken,
} from './secrets.js';
import { maskEmail, readState, writeState, type ActivationState } from './state.js';

const TERMS_VERSION = '2026-08-01';

export class FlowError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function request(email: string): Promise<ActivationState> {
  const current = await readState();
  if (current.stage === 'awaiting_email' || current.stage === 'requesting') {
    throw new FlowError(409, 'a request is already waiting for confirmation');
  }
  if (current.stage === 'installed' || current.stage === 'verified') {
    throw new FlowError(409, 'Services are already active on this machine');
  }

  await writeState({
    stage: 'requesting', email_masked: maskEmail(email), terms_version: TERMS_VERSION,
    error_at_stage: null, error_message: null,
  });

  try {
    const res = await callHq<{
      activation_id: string; claim_secret: string; expires_at: string;
    }>('POST', '/v1/services/activations', {
      body: { email, terms_version: TERMS_VERSION },
    });

    if (!res.body) {
      throw new FlowError(res.status || 502, res.error?.message ?? 'Ronin HQ refused the request');
    }

    await putClaimSecret(res.body.claim_secret);

    return await writeState({
      stage: 'awaiting_email',
      activation_id: res.body.activation_id,
      expires_at: res.body.expires_at,
      requested_at: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof EgressRefused
      ? 'this install refused to contact an unexpected host'
      : e instanceof FlowError ? e.message
      : 'Ronin HQ could not be reached — this will retry';
    await writeState({ stage: 'error', error_at_stage: 'requesting', error_message: message });
    throw e instanceof FlowError ? e : new FlowError(503, message);
  }
}

export async function poll(): Promise<ActivationState> {
  const state = await readState();
  const claim = await getClaimSecret();

  if (!state.activation_id || !claim) return state;
  if (['installed', 'cancelled', 'address_changed'].includes(state.stage)) return state;

  const res = await callHq<{
    stage: string; entitlement_id: string | null; entitlement_token?: string;
    expires_at: string; resend_available_at: string | null; entitlement_disabled?: boolean;
  }>('GET', `/v1/services/activations/${state.activation_id}`, { token: claim });

  if (res.status === 410) {
    return writeState({ stage: 'expired', error_message: 'this confirmation link expired' });
  }
  if (res.status === 401) {
    return writeState({
      stage: 'error', error_at_stage: 'awaiting_email',
      error_message: 'this request could not be matched at Ronin HQ — start again',
    });
  }
  if (!res.body) {
    return writeState({
      stage: 'error', error_at_stage: state.stage,
      error_message: res.error?.message ?? 'Ronin HQ could not be reached',
    });
  }

  if (res.body.entitlement_disabled) {
    return writeState({
      stage: 'error', error_at_stage: 'verified',
      error_message: 'this entitlement has been disabled — Services will not update or send',
    });
  }

  if (res.body.stage !== 'verified') {
    return writeState({
      stage: 'awaiting_email',
      expires_at: res.body.expires_at,
      resend_available_at: res.body.resend_available_at,
    });
  }
  if (!res.body.entitlement_token || !res.body.entitlement_id) {
    return writeState({
      stage: 'error', error_at_stage: 'awaiting_email',
      error_message: 'Ronin HQ confirmed the email but returned an incomplete entitlement',
    });
  }

  await putEntitlementToken(res.body.entitlement_token);
  const verified = await writeState({
    stage: 'verified',
    entitlement_id: res.body.entitlement_id,
    verified_at: new Date().toISOString(),
    error_at_stage: null, error_message: null,
  });
  await clearClaimSecret();
  return verified;
}

export async function resend(): Promise<ActivationState> {
  const state = await readState();
  const claim = await getClaimSecret();
  if (!state.activation_id || !claim) throw new FlowError(409, 'there is no pending request');

  const res = await callHq<{ resend_available_at: string | null }>(
    'POST', `/v1/services/activations/${state.activation_id}/resend`, { token: claim });

  if (res.status === 409) {
    throw new FlowError(409, res.error?.message ?? 'too soon — wait before resending');
  }
  if (!res.body) throw new FlowError(res.status || 502, res.error?.message ?? 'could not resend');

  return writeState({
    stage: 'awaiting_email', resend_available_at: res.body.resend_available_at,
    error_at_stage: null, error_message: null,
  });
}

export async function cancel(): Promise<ActivationState> {
  const state = await readState();
  const claim = await getClaimSecret();
  if (state.stage === 'verified' || state.stage === 'installed') {
    throw new FlowError(409, 'Services are already active — cancelling does not apply');
  }
  if (state.activation_id && claim) {
    await callHq('DELETE', `/v1/services/activations/${state.activation_id}`, { token: claim })
      .catch(() => { /* cancelling locally must succeed even if HQ is unreachable */ });
  }
  await clearClaimSecret();
  return writeState({
    stage: 'cancelled', activation_id: null, expires_at: null, resend_available_at: null,
    error_at_stage: null, error_message: null,
  });
}

export async function changeAddress(email: string): Promise<ActivationState> {
  await cancel().catch(() => { /* a cancelled or absent request is fine to replace */ });
  await writeState({ stage: 'address_changed' });
  return request(email);
}

export async function isEntitled(): Promise<boolean> {
  return (await getEntitlementToken()) !== null;
}
