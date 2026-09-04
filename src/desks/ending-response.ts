import type { EndingDispositionResult } from './ending-disposition.js';
import type { EndingPreflight } from './ending.js';

export interface EndingWarningResponse {
  ok: true;
  ending_pending: true;
  acknowledgement_required: true;
  warning: string;
  ending: EndingPreflight;
  actions: ['prompt', 'ignore'];
  prompted?: EndingDispositionResult;
}

export function endingWarningResponse(
  ending: EndingPreflight,
  prompted?: EndingDispositionResult,
): EndingWarningResponse {
  return {
    ok: true,
    ending_pending: true,
    acknowledgement_required: true,
    warning: `Unresolved managed work is still owned by ${ending.scope} ${ending.subject}. Choose Prompt Agent${ending.scope === 'team' ? 's' : ''} or Ignore.`,
    ending,
    actions: ['prompt', 'ignore'],
    ...(prompted ? { prompted } : {}),
  };
}

export function endingAcknowledgement(
  ending: EndingPreflight,
  disposition: EndingDispositionResult,
): Record<string, unknown> {
  return {
    warning: `The requested ${ending.requested_action.replace('_', ' ')} proceeded. Ronin took explicit quarantine custody of unresolved managed work.`,
    acknowledged: true,
    automatic_prompt: false,
    disposition,
    next_tools: ['tejun-desk status', 'ronin-desk-settle --dry-run'],
  };
}

export async function resolveEndingRequest(
  ending: EndingPreflight,
  disposition: string,
  actions: {
    prompt: () => Promise<EndingDispositionResult>;
    quarantine: () => Promise<EndingDispositionResult>;
  },
): Promise<{ proceed: boolean; response?: EndingWarningResponse; acknowledgement?: Record<string, unknown> }> {
  if (!ending.unresolved.length) return { proceed: true };
  if (disposition === 'prompt') {
    return { proceed: false, response: endingWarningResponse(ending, await actions.prompt()) };
  }
  const custody = await actions.quarantine(); // omission and explicit Ignore share the safe fallback
  return { proceed: true, acknowledgement: endingAcknowledgement(ending, custody) };
}
