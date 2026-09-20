/* part of the ronin-cowork client — see js/README.md */
/**
 * ERABI — how a form asks a question. THE ONE SELECTOR UTILITY (ronin-lab SELECTORS.md,
 * owner's ruling 2026-09-12). A consumer writes a spec; this module draws it. Nothing spatial
 * is the consumer's: not the width, not the wrapping, not the shape, not what opens.
 *
 *   ask([{ group, fields: [{ key, label, options, blank?, many?, switch?, shape?, after?, row?, word?, then? }] }],
 *       { value, onChange, density, trayHost, exposed })  →  { el, value(), set(key, v) | set({...}), options(key, rows), disable(key, reason), show(keys|null), open(key), close(), destroy() }
 *
 * A field is a READING STONE (140 × 48: label over answer). Click it and a TRAY opens under
 * its group, holding option stones in one of two fixed shapes — the SQUARE (85, a glyph and
 * a ruled word) or the RECTANGLE (140 × 48, a name and one short word). A stone carries a
 * name, never a sentence: the CAPTION line under the tray carries the sentence, the facts,
 * and the reason a stone is greyed. A SWITCH is the reading stone with a track; it flips and
 * opens nothing. GROUPS keep together and stack as a group. Names break at their joints.
 *
 * An option row is `{ v, l, sub?, off?, glyph?, word? }`: `sub` reads in the caption, `off`
 * is the reason the stone is greyed (disabled, never hidden), `glyph` sits on a square,
 * `word` is the rectangle's short second line (tier, worktree, checkout). `read` is a
 * document path; ERABI draws its separate read glyph and emits `ronin:read-document`.
 * `after` names the
 * field this one depends on: when that one changes, this answer clears and its options are
 * asked again. `row(option, value)` draws a control that belongs to a chosen option — a branch
 * name, a new team's name — under the group's stones, open or closed, so an answer's own field
 * never vanishes with the tray. `show([...keys])` limits which fields are drawn (a session type
 * decides which questions exist); `show(null)` draws them all. `then` is A SECOND LAYER: a
 * list of nested questions, each with `when` naming the parent answer that reveals it —
 * `then: [{ when: 'current', key: 'teamName', label: 'Which team', options: () => teamRows() }]`.
 * Opening a tray shows layer one only, whatever the saved answer; the second layer appears
 * only after an explicit click during that open interaction — clicking `current` keeps the
 * tray open and draws the nested question's stones in the slot beneath layer one; answering
 * it closes the tray, and the reading says the nested answer. Any other parent answer clears
 * the nested one. A GROUP HOLDS STONES AND NOTHING ELSE, so its geometry never changes: every
 * control that belongs to an answer (`row` on an option or on the field — a team's name, a
 * branch) is a full-width LINE in the tray beneath the stones. For a one-of question the line
 * appears after the click that chose its option, in the same slot as a second layer, and the
 * tray stays open; for a many question the lines of every chosen option show while the tray is
 * open. Closing the tray hides them; the consumer keeps the typed value and rebinds it when
 * `row()` is asked again. A REQUIRED LINE — an option with `required: true` beside its `row`,
 * and optionally `invalid: (option, value) → '' | message` — refuses every dismissal of its
 * tray (the stone, a press outside, Escape, `close()`) while its control is blank or the
 * consumer's validator returns a message: the tray stays open, the control is focused and
 * marked `aria-invalid`, and the message (default `t('forms.required')`) is announced in the
 * line's live text. Choosing another layer-one answer still dismisses, because the requirement
 * belongs to the answer, not the tray. Typing clears the mark. A nested question is a field like any other in `value()`,
 * `set()` and `onChange`, but it is never a stone of its own in the group. `trayHost` names a
 * wrapping row the consumer owns (a flex-wrap or grid container holding this instance beside
 * other controls): the open tray is placed at the end of that row instead of inside this
 * instance, so it spans the row's full width — a Team question on the right of a Name field
 * still opens across the whole workspace. `density: 'tight'` is the launch
 * forms' setting — less line spacing inside a group, the same paragraph spacing between groups,
 * a 40 px stone — for questions that are optional and must not be in the owner's face; 'loose'
 * (the default) is the commons' setting where a question is the page's subject. `exposed: true`
 * keeps a one-question selector's option stones visible without drawing the summary stone or a
 * disclosure interaction; selection, captions and dependent rows remain ERABI's.
 */
import { t } from './lexicon.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = String(text);
  return node;
};

/** THE SNAKE RULE: a name breaks after its joints — `_` `-` `.` — never mid-word. */
export function snake(text) {
  const frag = document.createDocumentFragment();
  const parts = String(text ?? '').split(/(?<=[_\-.])/);
  parts.forEach((part, index) => {
    frag.append(part);
    if (index < parts.length - 1) frag.append(document.createElement('wbr'));
  });
  return frag;
}

const FILTER_FROM = 12;
let trayIds = 0;

export function ask(groups = [], { value = {}, onChange = null, className = '', density = 'loose', trayHost = null, exposed = false } = {}) {
  const spec = (Array.isArray(groups) ? groups : []).map((group) => {
    const label = group.group || group.label || '';
    // The consumer owns the stone's noun. An equal group heading does not turn it into the
    // generic "Answer" — Team stays Team and Model stays Model.
    return { label, fields: (group.fields || []).map((field) => ({ ...field, shape: ['square', 'tall'].includes(field.shape) ? field.shape : 'rect' })) };
  });
  const nested = (field) => (Array.isArray(field.then) ? field.then : []).map((child) => ({ ...child, parent: field.key, when: child.when, shape: child.shape === 'square' ? 'square' : 'rect' }));
  const fields = spec.flatMap((group) => [...group.fields.flatMap((field) => [field, ...nested(field)])]);
  const childrenOf = (field) => fields.filter((child) => child.parent === field.key);
  const activeChild = (field) => childrenOf(field).find((child) => String(child.when) === String(state[field.key])) || null;
  const answered = (field) => (field.many ? state[field.key].length > 0 : state[field.key] !== '' && state[field.key] != null);
  const byKey = (key) => fields.find((field) => field.key === key) || null;
  const state = {};
  for (const field of fields) state[field.key] = field.switch ? Boolean(value[field.key]) : field.many ? [...(value[field.key] || [])] : (value[field.key] ?? '');
  let open = exposed ? fields.find((field) => !field.switch)?.key || '' : '';
  let filter = '';
  let outside = null;
  let shown = null;
  let trayNode = null;
  let revealed = null; // the layer-one answer clicked during this open interaction, if any
  let lines = []; // the line controls drawn in the open tray: { field, row, node, line, note }
  const visible = (field) => !shown || shown.has(field.key) || (field.parent != null && shown.has(field.parent));

  const root = el('section', `ask ${className}`.trim());
  root.dataset.density = density === 'tight' ? 'tight' : 'loose';
  root.dataset.exposed = String(exposed);
  const trayId = `ask-tray-${++trayIds}`;

  const rowsOf = (field) => {
    const rows = typeof field.options === 'function' ? field.options(snapshot()) : field.options;
    return (Array.isArray(rows) ? rows : []).map((row) => (typeof row === 'string' ? { v: row, l: row } : row)).filter((row) => row && row.v != null);
  };
  const rowFor = (field, v) => rowsOf(field).find((row) => String(row.v) === String(v)) || null;
  const snapshot = () => {
    const out = {};
    for (const field of fields) out[field.key] = field.many ? [...state[field.key]] : state[field.key];
    return out;
  };

  const clear = (field) => { state[field.key] = field.switch ? false : field.many ? [] : ''; };
  const changed = (key) => {
    for (const field of fields) {
      if (field.after === key || (field.parent === key && String(field.when) !== String(state[key]))) {
        if (!answered(field)) continue;
        clear(field);
        changed(field.key);
      }
    }
    onChange?.(snapshot(), key);
  };
  const choose = (field, row, source = null) => {
    if (field.many) {
      const cur = state[field.key];
      state[field.key] = cur.includes(row.v) ? cur.filter((v) => v !== row.v) : [...cur, row.v];
    } else {
      state[field.key] = row.v;
      const reveals = childrenOf(field).some((child) => String(child.when) === String(row.v)) || typeof row.row === 'function' || typeof field.row === 'function';
      revealed = reveals ? row.v : null;
      if (!reveals && !exposed) open = '';
    }
    changed(field.key);
    const restoreOptionFocus = !document.activeElement || document.activeElement === source;
    paint();
    if (exposed && restoreOptionFocus) optionNodes.find((entry) => entry.field === field && String(entry.row.v) === String(row.v))?.node.focus();
  };

  let optionNodes = [];

  const optionStone = (field, row, say = () => {}) => {
    const opt = el('button', `ask-opt ask-${field.shape}`);
    opt.type = 'button';
    opt.setAttribute('role', 'option');
    opt.dataset.askValue = String(row.v);
    const on = field.many ? state[field.key].includes(row.v) : String(state[field.key]) === String(row.v);
    opt.setAttribute('aria-selected', String(on));
    if (row.off) { opt.setAttribute('aria-disabled', 'true'); opt.title = row.off; }
    if (field.shape === 'square' && (row.glyph || row.blank)) opt.append(el('i', 'ask-glyph', row.glyph || '○'));
    const name = el('b', 'ask-name');
    name.append(snake(row.l));
    opt.append(name);
    if (field.shape === 'rect' && row.word) opt.append(el('small', 'ask-word', row.word));
    opt.addEventListener('mouseenter', () => say(row));
    opt.addEventListener('focus', () => say(row));
    opt.addEventListener('click', () => { if (row.off) { say(row); return; } choose(field, row, opt); });
    optionNodes.push({ field, row, node: opt });
    return opt;
  };

  /* ---- the reading: what the closed stone says ---- */
  const reading = (field) => {
    const cur = state[field.key];
    const b = el('b', 'ask-reading');
    if (field.switch) { b.textContent = field.switch[cur ? 0 : 1]; if (field.word) b.append(el('i', 'ask-fact', field.word)); return b; }
    if (field.many) {
      if (!cur.length) { b.className += ' ask-blank'; b.textContent = t('ask.none', 'None'); }
      else if (cur.length <= 2) b.textContent = cur.map((v) => rowFor(field, v)?.l ?? v).join(', ');
      else b.textContent = t('ask.chosen', '{n} chosen', { n: cur.length });
      return b;
    }
    if (cur === '' || cur == null) { b.className += ' ask-blank'; b.textContent = field.blank ?? t('ask.none', 'None'); return b; }
    const child = activeChild(field);
    if (child && answered(child)) return reading(child);
    // The reading is the answer and nothing else; a row's short word lives on its rectangle.
    b.textContent = rowFor(field, cur)?.l ?? cur;
    return b;
  };

  // Switches use the same plain disabled reason as option rows.
  const switchAvailability = (button, field) => {
    button.disabled = Boolean(field.off);
    button.setAttribute('aria-disabled', String(button.disabled));
    button.title = field.off || '';
  };

  // A switch has no tray to redraw. Keep its node and keyboard focus on changes.
  const refreshSwitch = (button, field) => {
    button.setAttribute('aria-checked', String(Boolean(state[field.key])));
    button.querySelector('.ask-reading').replaceWith(reading(field));
  };

  const stone = (field) => {
    const button = el('button', 'ask-stone');
    button.type = 'button';
    button.dataset.askKey = field.key;
    if (field.switch) {
      const on = Boolean(state[field.key]);
      button.className += ' ask-switch';
      button.setAttribute('role', 'switch');
      switchAvailability(button, field);
      button.setAttribute('aria-checked', String(on));
      const words = el('span', 'ask-words');
      words.append(el('small', 'ask-label', field.label), reading(field));
      button.append(words, el('span', 'ask-track'));
      button.addEventListener('click', () => {
        state[field.key] = !state[field.key];
        changed(field.key);
        if (fields.length === 1) refreshSwitch(button, field);
        else paint();
      });
      return button;
    }
    button.setAttribute('aria-expanded', String(open === field.key));
    button.setAttribute('aria-controls', trayId);
    button.append(el('small', 'ask-label', field.label), reading(field));
    button.addEventListener('click', () => { dismiss(open === field.key ? '' : field.key); });
    return button;
  };

  /* ---- the tray: the option stones, the caption, the rows ---- */
  const tray = (field) => {
    const box = el('div', 'ask-tray');
    box.id = trayId;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', field.label);
    const all = rowsOf(field);
    lines = [];
    // The caption speaks only when a stone has more to say than its name — a sentence, or the
    // reason it is greyed — and then says only that. A tray of plain words has no caption at all.
    const wordy = (f) => rowsOf(f).some((row) => row.sub || row.off);
    const caption = el('p', 'ask-caption');
    const say = (row) => { caption.textContent = row ? (row.off || row.sub || '') : ''; };
    // One layer of stones for one question; the second layer, when revealed by a click in this
    // open interaction, is the same thing again — or the clicked option's own line.
    const shown = revealed != null && String(state[field.key]) === String(revealed);
    const child = shown ? activeChild(field) : null;
    const drawFor = (row) => (typeof row.row === 'function' ? row.row : typeof field.row === 'function' ? field.row : null);
    const lineRows = field.many
      ? all.filter((row) => state[field.key].includes(row.v) && drawFor(row))
      : shown && !child ? all.filter((row) => String(row.v) === String(revealed) && drawFor(row)) : [];
    const target = child && rowsOf(child).length > FILTER_FROM ? child : all.length > FILTER_FROM ? field : null;
    const layerOf = (f) => {
      const options = el('div', 'ask-options');
      options.setAttribute('role', 'listbox');
      if (f.many) options.setAttribute('aria-multiselectable', 'true');
      const rows = f === field ? all : rowsOf(f);
      const fill = () => {
        options.replaceChildren();
        if (!rows.length) {
          const parent = f.after ? byKey(f.after) : null;
          options.append(el('span', 'ask-empty', parent ? t('ask.after', 'Choose {field} first.', { field: parent.label }) : t('ask.nothing', 'Nothing to choose.')));
          return;
        }
        const shown = rows.filter((row) => f !== target || !filter || `${row.l} ${row.sub || ''} ${row.word || ''}`.toLowerCase().includes(filter));
        const items = [...(!f.many && f.blank != null ? [{ v: '', l: f.blank, blank: true }] : []), ...shown];
        for (const row of items) {
          const opt = optionStone(f, row, say);
          if (row.read || row.edit) {
            const wrap = el('span', 'ask-opt-wrap');
            const read = el('button', 'ask-read', row.edit ? t('ask.view_edit', 'View/Edit') : t('ask.read', 'Read'));
            read.type = 'button';
            read.title = row.edit ? t('ask.view_edit_behaviour', 'View or edit this Behavior') : t('ask.read_behaviour', 'Read this behaviour');
            read.setAttribute('aria-label', `${row.edit ? t('ask.view_edit', 'View/Edit') : t('ask.read', 'Read')} ${row.l}`);
            read.addEventListener('click', (event) => {
              event.stopPropagation();
              window.dispatchEvent(new CustomEvent(row.edit ? 'ronin:edit-behaviour' : 'ronin:read-document', {
                detail: row.edit ? { ...row.edit, source: root } : { path: row.read, source: root },
              }));
            });
            wrap.append(opt, read); options.append(wrap);
          } else options.append(opt);
        }
      };
      fill();
      return { options, fill };
    };
    const first = layerOf(field);
    let second = null;
    if (child) {
      second = layerOf(child);
      const layer = el('div', 'ask-layer');
      layer.setAttribute('role', 'group');
      layer.setAttribute('aria-label', child.label);
      if (child.label) layer.append(el('small', 'ask-layer-head', child.label));
      layer.append(second.options);
      second.el = layer;
    }
    if (target) {
      const find = el('input', 'ask-filter');
      find.type = 'search';
      find.placeholder = t('ask.find', 'type to find');
      find.value = filter;
      find.addEventListener('input', () => { filter = find.value.trim().toLowerCase(); (target === field ? first : second).fill(); });
      box.append(find);
    }
    const pressedIn = (f) => (f.many ? null : rowsOf(f).find((row) => String(row.v) === String(state[f.key])));
    say((child && pressedIn(child)) || pressedIn(field) || null);
    box.append(first.options);
    if (second) box.append(second.el);
    const captioned = wordy(field) || (child && wordy(child));
    if (lineRows.length) {
      const line = el('div', 'ask-layer ask-line');
      line.setAttribute('role', 'group');
      line.setAttribute('aria-label', field.label);
      for (const row of lineRows) {
        const node = drawFor(row)(row, snapshot());
        if (!node) continue;
        const label = el('label', 'ask-extra');
        const note = el('small', 'ask-validation');
        note.id = `${trayId}-note-${lines.length}`;
        note.setAttribute('role', 'status');
        note.setAttribute('aria-live', 'polite');
        if (row.required) { label.dataset.required = 'true'; node.setAttribute?.('aria-required', 'true'); node.setAttribute?.('aria-describedby', note.id); }
        node.addEventListener?.('input', () => { node.setAttribute?.('aria-invalid', 'false'); note.textContent = ''; line.dataset.invalid = 'false'; });
        label.append(el('span', 'ask-extra-name', row.l), node, note);
        line.append(label);
        lines.push({ field, row, node, line, note });
      }
      if (line.children.length) box.append(line);
    }
    if (captioned) box.append(caption);
    return box;
  };

  /* ---- paint: groups, their stones, and the one open tray ---- */
  function paint() {
    root.replaceChildren();
    optionNodes = [];
    if (trayNode) { trayNode.remove?.(); trayNode = null; }
    if (open && !fields.some((field) => field.key === open && visible(field))) open = '';
    root.dataset.open = open;
    for (const group of spec) {
      const drawn = group.fields.filter(visible);
      if (!drawn.length) continue;
      const box = el('div', 'ask-group');
      if (group.label) box.append(el('h4', 'ask-group-head', group.label));
      const row = el('div', 'ask-fields');
      for (const field of drawn) if (!exposed || field.switch) row.append(stone(field));
      if (row.children.length) box.append(row);
      root.append(box);
      const opened = exposed
        ? drawn.find((field) => !field.switch)
        : drawn.find((field) => field.key === open && !field.switch);
      if (opened) {
        open = opened.key;
        trayNode = tray(opened);
        if (exposed) trayNode.className += ' ask-exposed';
        trayNode.dataset.density = root.dataset.density;
        trayNode.addEventListener('keydown', onEscape);
        (trayHost || root).append(trayNode);
      }
    }
    bindOutside();
  }

  /* ---- a required line refuses dismissal while blank or invalid ---- */
  const blank = (node) => typeof node?.value === 'string' && node.value.trim() === '';
  const objection = ({ row, node }) => {
    if (!row.required) return '';
    const message = typeof row.invalid === 'function' ? String(row.invalid(row, snapshot()) || '') : '';
    return message || (blank(node) ? t('forms.required', 'Required') : '');
  };
  const refuse = () => {
    for (const entry of lines) {
      const message = objection(entry);
      if (!message) continue;
      entry.node.setAttribute?.('aria-invalid', 'true');
      entry.note.textContent = message;
      entry.line.dataset.invalid = 'false';
      if (typeof entry.line.offsetWidth === 'number') void entry.line.offsetWidth; // restart the flash
      entry.line.dataset.invalid = 'true';
      entry.node.focus?.();
      return true;
    }
    return false;
  };
  /** Try to close the open tray (or move to `next`); a required line may say no. */
  const dismiss = (next = '') => {
    if (exposed) return true;
    if (open && refuse()) return false;
    open = next;
    filter = '';
    revealed = null;
    paint();
    return true;
  };

  /* ---- dismissal: Escape, and a press outside the utility ---- */
  const onEscape = (event) => {
    if (!exposed && event.key === 'Escape' && open) { event.preventDefault(); const key = open; if (dismiss()) focusStone(key); }
  };
  root.addEventListener('keydown', onEscape);
  const focusStone = (key) => { for (const node of root.children) { /* groups */ for (const inner of node.children || []) { for (const button of inner.children || []) if (button.dataset?.askKey === key) button.focus?.(); } } };
  let anyKey = null;
  function bindOutside() {
    if (typeof document.addEventListener !== 'function') return;
    if (exposed) return;
    if (open && !outside) {
      outside = (event) => { if (typeof root.contains === 'function' && (root.contains(event.target) || trayNode?.contains?.(event.target))) return; dismiss(); };
      anyKey = (event) => { if (event.key === 'Escape' && open && !(typeof root.contains === 'function' && (root.contains(event.target) || trayNode?.contains?.(event.target)))) onEscape(event); };
      document.addEventListener('pointerdown', outside);
      document.addEventListener('keydown', anyKey);
    } else if (!open && outside) {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', anyKey);
      outside = null;
      anyKey = null;
    }
  }

  paint();
  return {
    el: root,
    value: snapshot,
    set(key, v) {
      const patch = key && typeof key === 'object' ? key : { [key]: v };
      for (const [name, next] of Object.entries(patch)) { const field = byKey(name); if (field) state[name] = field.switch ? Boolean(next) : field.many ? [...(next || [])] : (next ?? ''); }
      if (fields.length === 1 && Object.keys(patch).every((name) => byKey(name)?.switch)) {
        for (const button of root.querySelectorAll('.ask-switch')) {
          const field = byKey(button.dataset.askKey);
          if (Object.hasOwn(patch, field.key)) refreshSwitch(button, field);
        }
      } else paint();
    },
    /** Set a switch's disabled reason without replacing its node. Empty means enabled. */
    disable(key, reason = '') {
      const field = byKey(key);
      if (!field?.switch) return;
      field.off = reason;
      for (const button of root.querySelectorAll('.ask-switch')) {
        if (button.dataset.askKey === key) switchAvailability(button, field);
      }
    },
    show(keys) { shown = Array.isArray(keys) ? new Set(keys) : null; paint(); },
    options(key, rows) { const field = byKey(key); if (!field) return; field.options = rows; paint(); },
    open(key) { return dismiss(byKey(key) && !byKey(key).switch ? key : ''); },
    close() { return dismiss(); },
    paint,
    destroy() { open = ''; lines = []; bindOutside(); trayNode?.remove?.(); trayNode = null; root.remove?.(); },
  };
}
