/* part of the ronin-cowork client — see js/README.md */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { t } from './lexicon.js';

/**
 * MACHINE STATUS (owner, 2026-11-20; KAN-759): the one complete truth of what this office has set
 * up, what it hasn't and what is available: the office's facts in one, as `office read` prints them
 * (src/facts.ts, KAN-768). ~/ronin/library/MACHINE_STATUS.md is kept current as the facts change,
 * and each opening reads it as it is now. Any Ronin's Settings has it.
 */
export function createMachineStatusSurface() {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('machine_status.title', 'Machine status'), className: 'cv-surface' });
  const el = document.createElement('div');
  el.className = 'st-surface';
  const head = document.createElement('div');
  head.className = 'st-head';
  const said = document.createElement('p');
  said.className = 'st-blurb';
  const stamp = document.createElement('span');
  stamp.className = 'st-stamp';
  const text = document.createElement('pre');
  text.className = 'st-status-text';
  const paint = (data) => {
    said.textContent = t('machine_status.where', 'Kept at {path}. Agents read it there, or with office read.', { path: data.path });
    stamp.textContent = data.written_at ? t('machine_status.stamp', 'Written {when}', { when: new Date(data.written_at).toLocaleString() }) : '';
    text.textContent = data.text || '';
  };
  head.append(stamp);
  el.append(head, said, text);
  surface.content.append(el);
  const load = async () => {
    const result = await request('/api/office/status');
    if (result.ok && result.data?.ok) paint(result.data);
  };
  return { el: surface.el, show: () => { void load(); } };
}
