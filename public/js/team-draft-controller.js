/* One page-lifetime owner for New Team's canonical draft and selected seat. */
let draft = null;
let seatId = '';
const listeners = new Set();
const publish = () => { for (const listener of listeners) listener(draft); };

export function registerTeamDraft(next) {
  draft = next ?? null;
  if (seatId && !draft?.seats?.some((seat) => seat.seat_id === seatId)) seatId = '';
  return draft;
}
export function selectDraftSeat(nextDraft, nextSeatId) {
  registerTeamDraft(nextDraft);
  seatId = String(nextSeatId ?? '');
  if (!draft?.seats?.some((seat) => seat.seat_id === seatId)) seatId = '';
  return { draft, seatId };
}
export function selectedDraftSeat() { return { draft, seatId }; }
export function changedTeamDraft() { publish(); }
export function subscribeTeamDraft(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
