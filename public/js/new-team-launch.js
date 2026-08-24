/* Ordered New Team orchestration. No DOM, no second resolver, no rollback. */
import { request } from './request.js';
import { bodyOf, rosterBody } from './new-team-draft.js';
import { preflight } from './new-team-preflight.js';

const now = () => new Date().toISOString();
const outcomeFor = (draft, seatId) => draft.seats.find((seat) => seat.seat_id === seatId)?.outcome;
const writeOutcome = (draft, seatId, outcome) => {
  draft.seats = draft.seats.map((seat) => seat.seat_id === seatId ? { ...seat, outcome } : seat);
};

export async function ensureRoster(draft) {
  if (draft.roster_created) return { ok: true, existing: true };
  const result = await request('/api/team-rosters', { method: 'POST', json: rosterBody(draft.team) });
  if (!result.ok) return result;
  draft.roster_created = true;
  return result;
}

/** Launch pending/refused/skipped seats in draft order. Born seats are immutable receipts. */
export async function launchDraft(draft, { persist = () => {}, seatIds = null } = {}) {
  const wanted = seatIds ? new Set(seatIds) : null;
  const candidates = draft.seats.filter((seat) => !outcomeFor(draft, seat.seat_id)?.session_name && (!wanted || wanted.has(seat.seat_id)));
  const transaction = draft.transaction = {
    ...(draft.transaction ?? {}), team: draft.team.name, started_at: now(), completed_at: null,
    lead: draft.transaction?.lead ?? null, error: null,
  };
  persist(draft);

  const roster = await ensureRoster(draft);
  if (!roster.ok) {
    transaction.roster = { status: 'refused', http: roster.status, error: roster.message };
    transaction.completed_at = now();
    persist(draft);
    return draft;
  }
  transaction.roster = { status: 'created' };
  persist(draft);

  const checked = await preflight({ ...draft, seats: candidates });
  if (checked.broken) {
    transaction.error = checked.message;
    transaction.completed_at = now();
    persist(draft);
    return draft;
  }
  const verdicts = new Map(checked.seats.map((seat) => [seat.seat_id, seat]));
  let halted = '';
  for (const seat of candidates) {
    if (halted) {
      writeOutcome(draft, seat.seat_id, { status: 'skipped', error: halted, attempted_at: null });
      persist(draft);
      continue;
    }
    const verdict = verdicts.get(seat.seat_id);
    if (!verdict || verdict.verdict === 'refuse') {
      writeOutcome(draft, seat.seat_id, {
        status: 'refused', http: 400,
        error: verdict?.reasons?.map((reason) => reason.message).join(' ') || 'Preflight refused this seat.',
        attempted_at: now(),
      });
      persist(draft);
      continue;
    }
    const result = await request('/api/launch', { method: 'POST', json: bodyOf(seat, draft.team.name) });
    if (result.ok) {
      writeOutcome(draft, seat.seat_id, {
        status: 'born', session_name: result.data.name, receipt: result.data.receipt, attempted_at: now(),
      });
    } else {
      writeOutcome(draft, seat.seat_id, {
        status: 'refused', http: result.status, error: result.message, attempted_at: now(),
      });
      if (result.status === 429) halted = result.message;
      else if (![400, 409].includes(result.status)) halted = `Not attempted after Ronin could not complete the previous launch: ${result.message}`;
    }
    persist(draft);
  }

  const leadSeat = draft.lead_seat_id && draft.seats.find((seat) => seat.seat_id === draft.lead_seat_id);
  if (leadSeat) {
    const born = leadSeat.outcome?.status === 'born' ? leadSeat.outcome.session_name : '';
    if (!born) transaction.lead = { status: 'skipped', error: 'The designated lead seat was not born.' };
    else {
      const result = await request(`/api/sessions/${encodeURIComponent(born)}/team_lead`, {
        method: 'POST', json: { teams: [draft.team.name] },
      });
      transaction.lead = result.ok
        ? { status: 'designated', session_name: born, delivery: result.data.delivery }
        : { status: 'refused', session_name: born, http: result.status, error: result.message };
    }
  } else transaction.lead = { status: 'not-designated' };
  transaction.completed_at = now();
  persist(draft);
  return draft;
}
