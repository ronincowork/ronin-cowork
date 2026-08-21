/**
 * THE ACTIVATION FLOW — the operator's half of loop one.
 *
 * THIS IS CORE, NOT A SERVICE, and KYOKAI is right to insist on it. `src/services/` is the
 * paid layer that leaves with its side at the split. Activation is the door a FREE install
 * uses to ask for the paid one, so it cannot live behind that door — free Cowork must be
 * able to request Services without Services being present.
 *
 * The browser talks only to the local operator. The operator talks to HQ. That shape is not
 * decoration: the operator holds the claim secret, and a browser that could see it could
 * hand someone else's tab the ability to claim this install's entitlement.
 *
 * A STATUS CHECK IS HOW THE LOOP CLOSES. The email link is opened wherever the person happens to
 * be — a phone, another laptop, a machine on a different network — and never contacts this
 * install. So the install asks HQ, on its own schedule, whether the thing it started has
 * finished. That crosses NAT, survives a closed tab, and survives this process restarting.
 */
import { callHq, EgressRefused } from './transport.js';
import {
  getClaimSecret, putClaimSecret, putEntitlementToken, clearClaimSecret, getEntitlementToken,
} from './secrets.js';
import { maskEmail, readState, writeState, type ActivationState } from './state.js';

const TERMS_VERSION = '2026-08-01';

/** A refusal we can explain, as opposed to a fault we cannot. */
export class FlowError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/**
 * REQUEST. The consent action — "Send confirmation email", never merely "Save".
 *
 * The claim secret is persisted BEFORE success is reported. HQ returns it exactly once, so
 * a crash between receiving and storing it would strand an activation that can never be
 * claimed: the email would arrive, the person would click it, and this install would have
 * no way to prove it was the one that asked.
 */
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

    // Secret first, state second. If this order is ever swapped the activation becomes
    // unclaimable on a crash, which is the failure nobody would think to test for.
    await putClaimSecret(res.body.claim_secret);

    return await writeState({
      stage: 'awaiting_email',
      activation_id: res.body.activation_id,
      expires_at: res.body.expires_at,
      requested_at: new Date().toISOString(),
    });
  } catch (e) {
    // HQ UNREACHABLE IS NOT A SETUP FAILURE. Free Cowork setup must finish either way; the
    // person sees "waiting to send" and a Retry, and nothing about their install is broken.
    const message = e instanceof EgressRefused
      ? 'this install refused to contact an unexpected host'
      : e instanceof FlowError ? e.message
      : 'Ronin HQ could not be reached — this will retry';
    await writeState({ stage: 'error', error_at_stage: 'requesting', error_message: message });
    throw e instanceof FlowError ? e : new FlowError(503, message);
  }
}

/**
 * CHECK / RESUME. Called once for each explicit Check status action. It is deliberately not
 * run on a timer: an unanswered email must not make this install ping HQ forever.
 */
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
    // The stored claim secret no longer matches anything. Say so rather than looping.
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

  if (res.body.stage !== 'verified' || !res.body.entitlement_token) {
    return writeState({
      stage: 'awaiting_email',
      expires_at: res.body.expires_at,
      resend_available_at: res.body.resend_available_at,
    });
  }

  // CONFIRMED. Store the token before announcing verification, for the same reason as the
  // claim secret — and because every poll mints a fresh token that retires the last one, so
  // losing this write means the install is holding a credential that no longer works.
  await putEntitlementToken(res.body.entitlement_token);
  await clearClaimSecret(); // it has done its job; keeping it is keeping a live credential

  return writeState({
    stage: 'verified',
    entitlement_id: res.body.entitlement_id,
    verified_at: new Date().toISOString(),
    error_at_stage: null, error_message: null,
  });
}

/** RESEND. The server owns the cooldown; we surface it rather than second-guessing it. */
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

/** CANCEL a pending request. Never touches a verified one — that is an entitlement now. */
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

/** CHANGE ADDRESS — cancel, then request again. Two steps, so neither is implicit. */
export async function changeAddress(email: string): Promise<ActivationState> {
  await cancel().catch(() => { /* a cancelled or absent request is fine to replace */ });
  await writeState({ stage: 'address_changed' });
  return request(email);
}

/** Whether this install currently holds a usable entitlement token. */
export async function isEntitled(): Promise<boolean> {
  return (await getEntitlementToken()) !== null;
}
