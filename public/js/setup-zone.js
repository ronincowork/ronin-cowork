/* part of the ronin-cowork client — see js/README.md */
/**
 * THE SETUP HEADER ZONE — the top window of a Setup step.
 *
 * Two things, always, in the same two places: a STATE line saying what is true on this
 * machine right now, and the PICKS that answer it. It states a fact and never explains —
 * Assist owns the "why" — and it carries no title, because the surface header already
 * has one.
 *
 * THE ZONE IS THE STEP'S, NEVER A STONE'S. A stone's own condition belongs on the stone,
 * where `.status-marker` and `.sws-state` already put it. The zone never names one stone.
 *
 * THE ZONE IS THE TOP WINDOW AND NOTHING ELSE. It does not know what is below it and must
 * never lay it out: the phalanx is the work surface's, identical whether a zone sits above
 * it or not (owner, 2026-09-20). The slot reserves two lines for the state whether it needs
 * them or not, so a state that wraps grows into its own space and the picks never move.
 *
 * STATELESS. Call `paint` again with a newer reading; there is nothing to update in place,
 * nothing to subscribe to and nothing to destroy.
 */
const el = (tag, cls = '', text = '') => {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = text;
  return node;
};

/**
 * One zone, as an element to seat wherever the step's surface keeps its header.
 *
 * `paint({ state, picks })` — `state` is the sentence; `picks` are `{ label, chosen, action,
 * disabled }`. A pick is an erabi stone at the shared 140x40: one line of words, and if a
 * label does not fit, shorten the label rather than stretch the stone. `chosen` marks an
 * answer already given and leaves every other pick in place so it can still be changed.
 */
export function createSetupZone({ className = '' } = {}) {
  const zone = el('div', `setup-zone ${className}`.trim());
  const state = el('p', 'setup-zone-state');
  state.setAttribute('role', 'status');
  const options = el('div', 'ask setup-zone-options');
  options.dataset.density = 'tight';
  zone.append(state, options);

  const paint = ({ state: reading = '', picks = [] } = {}) => {
    state.textContent = reading;
    options.replaceChildren(...picks.map((pick) => {
      const button = el('button', 'ask-opt ask-rect');
      button.type = 'button';
      // ask.css marks the chosen stone on aria-selected; aria-pressed is styled nowhere.
      button.setAttribute('aria-selected', String(pick.chosen === true));
      if (pick.disabled) button.setAttribute('aria-disabled', 'true');
      button.disabled = pick.disabled === true;
      button.append(el('span', 'ask-name', pick.label || ''));
      if (pick.title) button.title = pick.title;
      button.addEventListener('click', () => { if (!pick.disabled) pick.action?.(); });
      return button;
    }));
  };

  paint();
  return { el: zone, paint };
}

/**
 * The same zone for a step whose surface is a document rather than a stone work surface.
 * A stone surface already has `.sws-header` to seat it in; this is that slot, at the same
 * height, so the two kinds of step keep one rhythm.
 */
export function createSetupZoneSlot(options) {
  const zone = createSetupZone(options);
  const slot = document.createElement('div');
  slot.className = 'setup-zone-slot';
  slot.append(zone.el);
  return { el: slot, paint: zone.paint };
}

/**
 * The pick every answered step ends on: one stone that moves to the next step. The step
 * says what it is good to go *from* in its own state line, so the words here never change.
 */
export const goodToGo = (advance) => ({ label: 'Good to go', action: advance });
