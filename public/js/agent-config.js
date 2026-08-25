/* part of the ronin-cowork client — see js/README.md */

/**
 * AGENT CONFIGURATION — the compact editor for ONE proposed seat of a Team draft.
 *
 * TWO SURFACES, NO TILE, NO CHANNEL SERVICE (the owner's taxonomy, 2026-08-23). The left
 * Surface edits the seat; the right previews what it will be born with. Nothing here is a
 * pane — a pane is only the tmux object inside the tmux server — and no terminal is
 * mounted, because a proposed seat has no session to attach to.
 *
 * IT OWNS NO SCHEMA. The seat, its defaults and its unset markers are New Team's canonical
 * draft (Gate E); the resolution is the server's real resolver reached through New Team's
 * preflight. This destination edits a seat and hands it back — it constructs no seat
 * literal, restates no default, and re-derives no part of the cascade.
 *
 * WHAT IT MAY NOT WRITE, and does not: `seat_id`, `presented_family`, `resolved`,
 * `outcome`, any `TeamDefinition` field, the seats' ordering, or `lead_seat_id`.
 *
 * APPLY AND REVERT TOUCH THE DRAFT AND NOTHING ELSE. No saved launch, no roster write, no
 * session, no file — that is the whole durable effect of this Surface. Revert restores the
 * last applied seat rather than the defaults, because reverting into defaults would
 * materialise inheritance and break the round trip the field layer is built to protect.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createSeatFields } from './agent-config-fields.js';
import { createSeatPreview } from './agent-config-preview.js';
import { preflight } from './new-team-preflight.js';
import { changedTeamDraft, selectedDraftSeat } from './team-draft-controller.js';

export function createAgentConfigurationView(kit = WorkspaceKit) {
  const { createSurface, createAction, createActionBar } = kit.primitives;

  const configuration = createSurface({ className: 'ac-configuration', label: 'Seat configuration' });
  const preview = createSeatPreview();

  /** The draft and the seat under edit. Both are handed in; this view invents neither. */
  let draft = null;
  let seatId = null;
  /** What was last applied — revert's target, and never the defaults. */
  let applied = null;

  const fields = createSeatFields({
    seat: undefined,
    onChange: () => {
      // Typing does not launch a dry run per keystroke; the run is asked for, so a
      // half-typed prompt is never reported to the owner as a refusal.
      actions.dirty(true);
    },
  });

  const actions = (() => {
    const check = createAction({
      label: 'Check',
      title: 'Run the real resolver against this seat without creating anything',
    });
    const apply = createAction({
      label: 'Apply',
      title: "Write this seat into the Team draft — the only durable effect this Surface has",
    });
    const revert = createAction({
      label: 'Revert',
      title: 'Restore the last applied seat. Not the defaults — reverting into defaults would materialise inheritance',
    });
    const bar = createActionBar({
      className: 'ac-actions',
      label: 'Seat configuration actions',
      actions: [check, apply, revert],
    });
    const dirty = (on) => { bar.el.dataset.dirty = on ? 'true' : 'false'; };
    return { el: bar.el, check: check.el, apply: apply.el, revert: revert.el, dirty };
  })();

  // The form owns the action slot and therefore the keyboard order: all eleven controls,
  // then Check, Apply and Revert. The Surface contains one complete form rather than a
  // feature-local action sibling beside it.
  fields.form.actions.append(actions.el);
  configuration.content.append(fields.el);

  /** One dry run, and the seat's own verdict out of it. Batch-level `team` and `capacity`
   *  are New Team's to show and are deliberately untouched here. */
  const run = async () => {
    if (!draft) return;
    configuration.setState('loading', 'Resolving…');
    const answer = await preflight(draft);
    configuration.setState('', '');
    if (answer.broken) {
      // The tool failed, which is not the same as the draft being wrong. Saying so keeps
      // the owner from editing a seat that was never refused.
      configuration.setState('failed', answer.message);
      return;
    }
    const verdict = (answer.seats ?? []).find((s) => s.seat_id === seatId) ?? null;
    fields.showVerdict(verdict);
    if (verdict?.resolved) fields.applyResolved(verdict.resolved);
    preview.show(verdict);
  };

  actions.check.addEventListener('click', () => void run());

  actions.apply.addEventListener('click', () => {
    if (!draft || !seatId) return;
    const next = fields.seat;
    draft.seats = draft.seats.map((s) => (s.seat_id === seatId ? { ...next, seat_id: seatId } : s));
    changedTeamDraft();
    applied = { ...next };
    actions.dirty(false);
  });

  actions.revert.addEventListener('click', () => {
    if (!applied) return;
    fields.setSeat({ ...applied });
    actions.dirty(false);
  });

  const el = kit.layouts.createAgentConfigurationLayout(configuration.el, preview.el);

  /**
   * Open one seat of one draft. Handed in rather than fetched: New Team owns the draft's
   * lifetime, and a second loader here would be a second source of truth.
   */
  const open = (nextDraft, nextSeatId) => {
    draft = nextDraft ?? null;
    seatId = nextSeatId ?? null;
    const seat = draft?.seats?.find((s) => s.seat_id === seatId) ?? null;
    if (!seat) {
      configuration.setState('empty', 'No seat selected. Open one from the Team roster.');
      preview.clear();
      return;
    }
    configuration.setState('', '');
    fields.setSeat(seat);
    applied = { ...seat };
    actions.dirty(false);
    preview.clear('Not resolved yet — press Check.');
  };

  return {
    el,
    open,
    title: () => 'Agent Configuration · ronin',
    enter: () => {
      const selected = selectedDraftSeat();
      if (selected.draft && selected.seatId) open(selected.draft, selected.seatId);
      else configuration.setState('empty', 'No seat selected. Open one from the Team roster.');
    },
    leave: () => {},
  };
}
