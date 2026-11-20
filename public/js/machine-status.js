/* part of the ronin-cowork client — see js/README.md */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { button } from './ui.js';
import { t } from './lexicon.js';

/**
 * MACHINE STATUS (owner, 2026-11-20; KAN-759): the one complete truth of what this office has set
 * up, what it hasn't and what is available, as `office read` prints it (src/office-read.ts). Write
 * it now saves it to ~/ronin/library/MACHINE_STATUS.md, where the owner, the Helpful Assistant, a
 * lead or the daimyo read it; the surface shows what was last written and when. Any Ronin's
 * Settings has it.
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
    said.classList.remove('bad');
    said.textContent = data.written_at
      ? t('machine_status.where', 'Written to {path}. Agents read it there, or live with office read.', { path: data.path })
      : t('machine_status.never', 'Not written yet on this machine. Write it now saves what is set up, what isn’t and what is available.');
    stamp.textContent = data.written_at ? t('machine_status.stamp', 'Written {when}', { when: new Date(data.written_at).toLocaleString() }) : '';
    text.textContent = data.text || '';
  };
  const write = button(t('machine_status.write', 'Write it now'), { cls: 'btn', onClick: async () => {
    write.disabled = true;
    const result = await request('/api/office/status', { method: 'POST', json: {} });
    write.disabled = false;
    if (result.ok && result.data?.ok) return paint(result.data);
    said.textContent = result.data?.error || result.message || t('machine_status.failed', 'Ronin could not write it.');
    said.classList.add('bad');
  } });
  head.append(stamp, write);
  el.append(head, said, text);
  surface.content.append(el);
  const load = async () => {
    const result = await request('/api/office/status');
    if (result.ok && result.data?.ok) paint(result.data);
  };
  return { el: surface.el, show: () => { void load(); } };
}
