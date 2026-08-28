import { request } from './request.js';
import { t } from './lexicon.js';

const node = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

export function createTeamTemplatesSurface({ draft, use }) {
  const el = node('div', 'team-templates'), controls = node('form', 'team-template-add'), list = node('div', 'team-template-list'), note = node('p', 'team-template-note');
  const name = node('input'); name.placeholder = t('league.template_name', 'template-name'); name.required = true;
  const save = node('button', null, t('league.template_save', 'Save current New Team draft')); save.type = 'submit';
  controls.append(name, save); el.append(controls, note, list);
  let rows = [];
  const render = () => {
    list.replaceChildren();
    for (const row of rows) {
      const card = node('article', 'team-template-card'), title = node('b', null, row.name), actions = node('div', 'team-template-actions');
      const open = node('button', null, t('league.template_use', 'Use template')), remove = node('button', null, t('league.template_delete', 'Delete'));
      open.type = remove.type = 'button'; open.addEventListener('click', () => use(structuredClone(row.draft)));
      remove.addEventListener('click', async () => { if (!window.confirm(t('league.template_delete_confirm', 'Delete template {name}?', { name: row.name }))) return; const result = await request(`/api/team-templates/${encodeURIComponent(row.name)}`, { method: 'DELETE' }); note.textContent = result.ok ? '' : result.message; if (result.ok) await refresh(); });
      actions.append(open, remove); card.append(title, actions); list.append(card);
    }
    if (!rows.length) list.append(node('p', 'team-template-empty', t('league.templates_empty', 'No Team templates yet.')));
  };
  const refresh = async () => { const result = await request('/api/team-templates', { cache: 'no-store' }); if (!result.ok) { note.textContent = result.message; return; } rows = result.data; note.textContent = ''; render(); };
  controls.addEventListener('submit', async (event) => { event.preventDefault(); const current = draft(); if (!current) return; const result = await request('/api/team-templates', { method: 'POST', json: { name: name.value, draft: current } }); note.textContent = result.ok ? '' : result.message; if (result.ok) { name.value = ''; await refresh(); } });
  return { el, enter: refresh };
}
