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
 * disabled }`. A disabled pick is shown and not selectable: it says the option exists but is
 * not available on this machine, which is a different thing from not offering it at all. A pick is an erabi stone at the shared 140x40: one line of words, and if a
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
    // NOTHING TO SAY, NOTHING TO SHOW. Once a step is answered its card carries a checkmark
    // and the zone has no fact left that needs a decision, so it leaves rather than sit there
    // congratulating you (owner, 2026-09-21). Called with nothing, the zone hides; the slot
    // goes with it, so no empty band is left behind.
    zone.hidden = !reading && picks.length === 0;
    state.textContent = reading;
    options.replaceChildren(...picks.map((pick) => {
      const button = el('button', 'ask-opt ask-rect');
      button.type = 'button';
      // A pick is nameable as a pick. Its label can legitimately read like a control on the
      // surface below ('Add password', 'Register here'), so anything selecting by words alone
      // can pick the wrong one — a harness did exactly that and pressed real controls. This
      // says which button is the zone's, for tests, harnesses and anyone reading the DOM.
      button.dataset.setupZonePick = pick.key || (pick.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      // ask.css marks the chosen stone on aria-selected; aria-pressed is styled nowhere.
      button.setAttribute('aria-selected', String(pick.chosen === true));
      if (pick.disabled) { button.disabled = true; button.setAttribute('aria-disabled', 'true'); }
      if (pick.title) button.title = pick.title;
      button.append(el('span', 'ask-name', pick.label || ''));
      button.addEventListener('click', () => pick.action?.());
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
