/* Ronin owns the gesture; the server's CLI registry owns the command. */
import { request } from './request.js';
import { sheet, toast } from './ui.js';
import { S, SELECT_MOD, IS_MAC } from './state.js';

const actions = ['copy', 'clear', 'close', 'stop'];
const shortcutActions = ['clear', 'close', 'stop'];
const selectionHint = `${SELECT_MOD}-drag to select`;
const labels = { copy: 'Copy', clear: 'Clear', close: 'Close', stop: 'Stop' };
const meanings = { clear: 'Clear browser input or send the CLI’s native Clear key.', close: 'Retire this Agent through confirmation.', stop: 'Interrupt the Agent now; keep its session.' };
let config = null;
let loading = null;
const preference = (key, value) => {
  try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch {}
};
function describeAction(node) {
  const action = node.dataset.terminalAction;
  if (action === 'copy') { node.title = 'Copy terminal text'; return; }
  if (!config) return;
  node.title = `${labels[action]} — ${config.bindings[action]}. ${meanings[action]}`;
  node.setAttribute('aria-keyshortcuts', config.bindings[action].replace('Ctrl', 'Control'));
}
function setHintText(node, text) {
  node.replaceChildren();
  for (const chunk of text.split(/(?<=[+-])/)) {
    node.append(document.createTextNode(chunk));
    if (/[+-]$/.test(chunk)) node.append(document.createElement('wbr'));
  }
}
function publish(data) {
  config = data;
  for (const node of document.querySelectorAll('[data-control-key]')) setHintText(node, config.bindings[node.dataset.controlKey]);
  for (const node of document.querySelectorAll('[data-terminal-action]')) {
    describeAction(node);
  }
}
export function loadTerminalControls() {
  if (!loading) loading = request('/api/terminal-controls').then((r) => { if (r.ok) publish(r.data); return r; }).finally(() => { loading = null; });
  return loading;
}
function initialize() {
  if (!config) void loadTerminalControls();

}
export function controlChord(e) {
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return `${e.ctrlKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.metaKey ? 'Meta+' : ''}${key}`;
}
export function matchedControl(e, bindings) {
  if (e.isComposing || e.altGraphKey || e.getModifierState?.('AltGraph')) return null;
  return shortcutActions.find((action) => bindings?.[action] === controlChord(e)) || null;
}
export function installTileControls(tile) {
  initialize();
  tile.el.addEventListener('focusin', (e) => {
    if (e.target === tile.composerTa) tile.inputTarget = 'composer';
    else if (e.target.closest?.('.xterm')) tile.inputTarget = 'terminal';
  });
  tile.el.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    // Preserve native Copy with a selection; prevent xterm from sending Ctrl+C.
    if (e.key.toLowerCase() === 'c' && (IS_MAC ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey
        && e.target.closest?.('.xterm')
        && (tile.term.getSelection() || tile.lastSelection)) {
      e.stopImmediatePropagation(); return;
    }
    // Ctrl+C must never reach an Agent, including before settings load or inside menus.
    if (e.key.toLowerCase() === 'c' && e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey
        && (e.target.closest?.('.xterm') || e.target === tile.body)) {
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    const overlay = document.querySelector('.ui-sheet.open .ui-card');
    const drop = document.querySelector('.tdrop.open');
    if (overlay || drop) {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (overlay) overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        else drop.classList.remove('open');
      } else if (matchedControl(e, config?.bindings)) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
      return;
    }
    const target = e.target;
    const composer = target === tile.composerTa;
    const terminal = !!target.closest?.('.xterm') || target === tile.body;
    if (!composer && !terminal) return;
    // Native browser clipboard/editing stays native in the Ronin textarea.
    if (composer && (e.ctrlKey || e.metaKey) && ['c', 'x', 'v', 'z', 'y', 'a'].includes(e.key.toLowerCase()) && !e.shiftKey && !e.altKey) return;
    const action = matchedControl(e, config?.bindings);
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) void tile.controlAction(action, composer ? 'composer' : 'terminal');
  }, true);
}
export function buildMobileControlButtons(tile) {
  return ['copy', 'clear', 'stop'].map((action) =>
    actionButton(action, () => { tile.activate?.(); return tile.controlAction(action); }));
}

function actionButton(action, run) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = labels[action];
  button.dataset.terminalAction = action;
  button.setAttribute('aria-label', labels[action]);
  describeAction(button);
  button.addEventListener('pointerdown', (e) => e.preventDefault());
  button.addEventListener('click', () => void run());
  return button;
}
export async function runTerminalAction(tile, action, target) {
  if (action === 'copy') return copyTerminal(tile);
  if (!tile.session) return toast('Choose an Agent first.', false);
  if (action === 'close') return tile.kill();
  if (action === 'clear') {
    target ||= tile.inputTarget;
    const composer = tile.composerTa;
    if (target === 'composer' || (target !== 'terminal' && composer && (document.activeElement === composer || composer.value))) {
      tile.composer.clear();
      return;
    }
    if (tile.pending) { tile.pending = ''; tile.renderPending(); return; }
  }
  const session = S.sessions.find((row) => row.name === tile.session);
  const r = await request(`/api/sessions/${encodeURIComponent(tile.session)}/control-action`, { method: 'POST', json: { intent: action, key: tile.sessionKey || session?.key } });
  if (!r.ok) toast(r.message, false);
}
export function terminalSnapshot(tile) {
  if (tile.tapeMode) return tile.tape?.el?.innerText || tile.body.innerText || '';
  const buffer = tile.term.term.buffer.active;
  const lines = [];
  for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) || '');
  return lines.join('\n').trimEnd();
}
async function writeClipboard(text) {
  if (!navigator.clipboard?.writeText) return false;
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
async function copyTerminal(tile) {
  const native = window.getSelection?.();
  const local = native && tile.el.contains(native.anchorNode) ? native.toString() : '';
  const selected = local || tile.term.getSelection() || tile.lastSelection || '';
  if (selected && await writeClipboard(selected)) return;
  const dlg = sheet({ id: `terminal-copy-${tile.retirementId}`, label: `Copy terminal text — ${tile.session || 'Tile'}`, onClose: () => dlg.el.remove() });
  const text = document.createElement('textarea');
  text.readOnly = true;
  text.className = 'terminal-copy-text';
  text.setAttribute('aria-label', 'Select terminal text to copy');
  text.value = selected || terminalSnapshot(tile);
  const note = document.createElement('p');
  note.textContent = 'Select text below. This snapshot stays still while the Agent continues.';
  const copy = actionButton('copy', async () => {
    const value = text.value.slice(text.selectionStart, text.selectionEnd) || text.value;
    if (!await writeClipboard(value)) { text.focus(); if (text.selectionStart === text.selectionEnd) text.select(); toast('Use your browser’s Copy command on the selected text.'); }
  });
  const done = document.createElement('button'); done.type = 'button'; done.textContent = 'Done'; done.onclick = () => dlg.close();
  dlg.card.append(note, text, copy, done); dlg.open();
}
export function flashControlHints() {
  for (const card of document.querySelectorAll('.session-control-hints')) {
    if (!card.getClientRects().length) continue;
    card.open = true;
    card.scrollIntoView({ block: 'nearest' });
    for (const animation of card.getAnimations()) if (animation.id === 'selection-hint') animation.cancel();
    const backgroundColor = getComputedStyle(card).backgroundColor;
    const orange = {
      backgroundColor: 'var(--kaki)',
      outline: '2px solid var(--kaki)',
      boxShadow: '0 0 0 4px var(--kaki)',
    };
    const quiet = {
      backgroundColor,
      outline: '2px solid transparent',
      boxShadow: '0 0 0 0 transparent',
    };
    const frames = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? [orange, orange] : [orange, quiet, orange, quiet];
    card.animate(frames, { duration: 2500, easing: 'ease-out', id: 'selection-hint' });
  }
}
export function buildHints({ collapsedByDefault = false, preferenceScope = '' } = {}) {
  initialize();
  const hints = document.createElement('section');
  hints.className = 'terminal-hints';
  hints.setAttribute('aria-label', 'Hints');
  const title = document.createElement('h3'); title.textContent = 'Hints';
  hints.append(title);
  const scopedPreference = (name, fallback) => preferenceScope
    ? `ronin.hints.${preferenceScope}.${name}.collapsed`
    : fallback;
  const section = (label, className, preferenceKey) => {
    const card = document.createElement('details');
    card.className = `${className} wk-card`;
    const saved = preference(preferenceKey);
    card.open = saved === 'no' || (!collapsedByDefault && saved !== 'yes');
    const summary = document.createElement('summary'); summary.textContent = label;
    card.append(summary);
    card.addEventListener('toggle', () => preference(preferenceKey, card.open ? 'no' : 'yes'));
    hints.append(card);
    return card;
  };
  const vocabulary = section('Agent vocabulary', 'agent-vocabulary-hints', scopedPreference('vocabulary', 'ronin.hints.vocabulary.collapsed'));
  for (const [term, description] of [
    ['Create new session (Agent)', 'Start another visible Ronin Agent session.'],
    ['Tell', 'Message another Agent.'],
    ['Wipeboard', 'Share a note with the Team.'],
    ['Show docs', 'Open a document to read.'],
    ['Update work record', 'Record progress and next steps.'],
    ['New Team', 'Group Agents around shared work.'],
    ['Hand in', 'Submit code for Team review.'],
    ['Promote', 'Move reviewed code to global dev.'],
    ['Close session', 'End the Agent safely.'],
  ]) {
    const row = document.createElement('div'); row.className = 'terminal-hint-row';
    if (term === 'Create new session (Agent)') row.classList.add('session-create');
    const label = document.createElement('strong'); label.textContent = term;
    const meaning = document.createElement('span'); meaning.textContent = description;
    row.append(label, meaning); vocabulary.append(row);
  }
  const controls = section('Session controls', 'session-control-hints', scopedPreference('controls', 'ronin.hints.collapsed'));
  for (const action of actions) {
    const row = document.createElement('div'); row.className = 'terminal-hint-row';
    const label = document.createElement('strong'); label.textContent = labels[action];
    const key = document.createElement('span');
    if (action !== 'copy') key.dataset.controlKey = action;
    setHintText(key, action === 'copy' ? selectionHint : config?.bindings[action] || '…');
    row.append(label, key); controls.append(row);
  }
  return hints;
}
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('focus', () => { if (config) void loadTerminalControls(); });
