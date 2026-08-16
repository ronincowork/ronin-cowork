/* part of the tmux-ronin client — see js/README.md */
/**
 * UI PRIMITIVES — the shared behaviours every surface used to hand-roll.
 *
 * Extracted from what already worked, not invented: the note sheet, the tag sheet and
 * the session switcher each carried their own backdrop, their own Escape listener and
 * their own idea of focus (mostly: none); seven panes each had a say()/msg() spelling
 * of the same async status line. The behaviours that must be IDENTICAL live here once:
 *
 *   sheet()   a modal card over a dimmed backdrop — dialog semantics, focus entry,
 *             Tab containment, Escape/backdrop dismissal, focus restoration
 *   toast()   the one transient outcome chip (grew out of the pad's; now house-wide)
 *   popover() a button-anchored menu — aria-expanded, outside click, Escape,
 *             focus back on the button that opened it
 *   field()   a control with a REAL accessible name — display:contents, so it adds
 *             semantics to an existing layout without changing a pixel of it
 *   status()  the async outcome line — loading…/saved/not saved-and-why, announced
 *   button()  a semantically-complete <button> in one call
 *   tabs()    tablist semantics + roving tabindex + arrow keys over an existing strip
 *
 * Primitives know no Ronin vocabulary: nothing in this file may name a session, a
 * board or a feature, and nothing here fetches. The full contract each primitive
 * keeps (states, keyboard, focus) is written down in docs/ui.md.
 */

let uid = 0; // unique ids for label/control/tab wiring — four tiles build four of everything

/** Everything a Tab press can land on inside a card. */
const tabbable = (root) =>
  [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.disabled && el.offsetParent !== null,
  );

/**
 * A modal sheet: dimmed backdrop, centered card (full-bleed on phones is the
 * stylesheet's business). The caller builds the card's content and owns what it
 * means; this owns how it opens, traps, dismisses and gives focus back.
 *
 * @param {{id: string, cls?: string, label: string, onClose?: () => void}} spec
 * @returns {{el: HTMLElement, card: HTMLElement, open: () => void, close: () => void,
 *            isOpen: () => boolean}}
 */
export function sheet(spec) {
  const el = document.createElement('div');
  el.id = spec.id;
  el.className = 'ui-sheet';
  const card = document.createElement('div');
  card.className = 'ui-card' + (spec.cls ? ' ' + spec.cls : '');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', spec.label);
  card.tabIndex = -1; // focus lands ON the card when nothing inside asks for it
  el.appendChild(card);
  document.body.appendChild(el);

  let opener = null; // where focus goes back to — the control that opened the sheet

  const isOpen = () => el.classList.contains('open');

  const close = () => {
    if (!isOpen()) return;
    el.classList.remove('open');
    // Focus restoration is the half every hand-rolled sheet forgot: closing used to
    // drop keyboard focus on <body>, and the next Tab started the page over.
    if (opener && opener.isConnected && el.contains(document.activeElement)) opener.focus();
    opener = null;
    spec.onClose?.();
  };

  const open = () => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.classList.add('open');
    // Focus enters the dialog: the first field if there is one, else the card itself.
    // Touch is the exception — focusing an input summons the iOS keyboard before the
    // owner has read what opened, so there the card takes it without raising anything.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const first = coarse ? null : tabbable(card).find((n) => n.matches('input, textarea, select'));
    (first || card).focus();
  };

  // Backdrop tap = dismissal, exactly as every sheet already behaved.
  el.addEventListener('pointerdown', (e) => {
    if (e.target === el) close();
  });
  // Escape closes; Tab stays inside while the sheet is modal.
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const order = tabbable(card);
    if (!order.length) return;
    const first = order[0];
    const last = order[order.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  // A sheet opened by pointer never had focus inside it — the document listener is
  // what lets Escape still close it.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen() && !el.contains(document.activeElement)) close();
  });

  return { el, card, open, close, isOpen };
}

/* ---------- the outcome chip ---------- */

let toastEl = null;
let toastTimer = null;

/**
 * One transient chip, bottom-center: the result of an action that has no panel of its
 * own to say it in. Grew out of the pad's toast (macros must SHOW their result, not
 * just perform); tile-scoped errors that used to be `alert()` land here too, because
 * a browser alert steals the keyboard from a live terminal.
 */
export function toast(msg, ok = true) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    // A status line, not a dialog: announced by assistive tech without stealing focus.
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.toggle('err', !ok);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  // Errors hold longer: a failure you did not see is the defect this chip exists for.
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ok ? 2200 : 5000);
}

/* ---------- the button-anchored menu ---------- */

/**
 * Wire a button to the menu it drops. The menu element already exists and is styled
 * by its owner; this owns open/close truth: aria-expanded on the button, outside
 * click, Escape, and focus back on the button when the menu closes under keyboard.
 *
 * @param {HTMLElement} btn
 * @param {HTMLElement} menu  hidden via the `hidden` attribute when closed
 * @returns {{close: () => void, toggle: () => void}}
 */
export function popover(btn, menu) {
  const close = () => {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (menu.contains(document.activeElement)) btn.focus();
  };
  const toggle = () => {
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  };
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) close();
  });
  return { close, toggle };
}

/* ---------- the labelled control ---------- */

/**
 * Give a control a real name and a message line, without touching the layout it sits
 * in: the wrapper is `display: contents`, so flex/grid parents see the control and
 * the message exactly as before — this primitive adds SEMANTICS, not boxes. The
 * label is visually hidden by default (`sr: true` is the norm in a dense cockpit
 * where placeholders carry the visual); pass `sr: false` to render it.
 *
 * @param {HTMLElement} control  the input/textarea/select being named
 * @param {{label: string, sr?: boolean}} spec
 * @returns {{el: HTMLElement, control: HTMLElement, say: (text?: string, bad?: boolean) => void}}
 */
export function field(control, spec) {
  const el = document.createElement('div');
  el.className = 'ui-field';
  const lab = document.createElement('label');
  lab.textContent = spec.label;
  if (spec.sr !== false) lab.className = 'ui-sr';
  control.id = control.id || `uif-${++uid}`;
  lab.htmlFor = control.id;
  const msg = document.createElement('div');
  msg.className = 'ui-status';
  msg.id = `uifm-${uid}`;
  msg.setAttribute('role', 'status');
  el.append(lab, control, msg);
  const say = (text, bad) => {
    msg.textContent = text || '';
    msg.dataset.kind = bad ? 'bad' : '';
    // The message is the field's own description while it has one; invalid state
    // rides with a bad message and leaves with it.
    if (text) control.setAttribute('aria-describedby', msg.id);
    else control.removeAttribute('aria-describedby');
    if (bad) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
  };
  return { el, control, say };
}

/* ---------- the async status line ---------- */

/**
 * The one spelling of "loading… / saved / not saved — why". A `role=status` line the
 * pane places where its own layout wants it (extra classes ride along for that);
 * `say(text, kind)` with kind '' | 'busy' | 'ok' | 'bad'. Empty text hides it.
 */
export function status(cls) {
  const el = document.createElement('div');
  el.className = 'ui-status' + (cls ? ' ' + cls : '');
  el.setAttribute('role', 'status');
  const say = (text, kind = '') => {
    el.textContent = text || '';
    el.dataset.kind = kind;
  };
  return { el, say };
}

/* ---------- the button ---------- */

/**
 * A semantically-complete <button> in one call: `type=button` (a bare <button> in a
 * form is a submit, which is never what a cockpit control means), label, help text,
 * class. Sugar with a guarantee, not a component.
 */
export function button(label, opts = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (opts.cls) b.className = opts.cls;
  if (opts.title) b.title = opts.title;
  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}

/* ---------- tab semantics over an existing strip ---------- */

/**
 * Retrofit real tablist behaviour onto a strip of buttons that already exists and is
 * already styled: `role=tablist`/`tab`, `aria-selected`, roving tabindex, and
 * ArrowLeft/Right + Home/End moving focus (activation stays a click/Enter — panes
 * load work on entry, so focus must not activate). The owner calls `select(btn)`
 * whenever it changes which tab is on, from whatever route (click, keyboard, code).
 *
 * @param {HTMLElement} strip  the container holding the tab buttons
 * @param {HTMLElement[]} list  the tab buttons, in order
 * @param {(btn: HTMLElement) => HTMLElement | null} [panelFor]  the pane a tab labels
 * @returns {{select: (btn: HTMLElement) => void}}
 */
export function tabs(strip, list, panelFor) {
  strip.setAttribute('role', 'tablist');
  for (const b of list) {
    b.setAttribute('role', 'tab');
    b.id = b.id || `uit-${++uid}`;
    b.setAttribute('aria-selected', 'false');
    b.tabIndex = -1;
    const panel = panelFor?.(b);
    if (panel) {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', b.id);
    }
  }
  const usable = () => list.filter((b) => !b.disabled);
  strip.addEventListener('keydown', (e) => {
    const order = usable();
    const at = order.indexOf(document.activeElement);
    if (at === -1) return;
    let to = null;
    if (e.key === 'ArrowRight') to = order[(at + 1) % order.length];
    else if (e.key === 'ArrowLeft') to = order[(at - 1 + order.length) % order.length];
    else if (e.key === 'Home') to = order[0];
    else if (e.key === 'End') to = order[order.length - 1];
    if (!to) return;
    e.preventDefault();
    to.focus();
  });
  const select = (btn) => {
    for (const b of list) {
      const on = b === btn;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  };
  return { select };
}
