/* part of the ronin-cowork client — see js/README.md */
/**
 * WHAT MEMBERS SEE (KAN-955): the office setting on Settings that lists the workbenches a member is
 * shown, the first where they land. It applies to everyone whose role is member; the owner always
 * sees everything. None picked: members see everything. It decides what is shown, not a lock.
 * Saved to ~/ronin/config/members_see.json through PUT /api/workbenches/members-see
 * (src/routes/workbenches-api.ts); docs/architecture/workbench.md, Which workbenches members see.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { WorkspaceKit } from './workspace-kit.js';
import { ask } from './ask.js';
import { folderWorkbenches, savedMembersSee, setSavedMembersSee } from './folder-workbenches.js';

const el = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = String(text); return out; };

/** Every workbench a member could be shown: the built-in ones, then the office's own. */
function workbenches() {
  const builtIn = [['cowork', 'teams', 'Teams'], ['epics', 'epics', 'Epics'], ['workspaces', 'workspaces', 'Workspaces'], ['setup', 'setup', 'Setup'], ['help', 'help', 'Help'], ['settings2', 'settings', 'Settings']];
  return [
    ...builtIn.map(([v, key, word]) => ({ v, l: t(`campaign_home.${key}`, word) })),
    ...folderWorkbenches().map((one) => ({ v: one.name, l: one.title })),
  ];
}

export function createMembersSeeSurface() {
  const { createSurface, createNotice } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('settings2.members_see', 'What members see'), className: 'cv-surface' });
  const body = el('div', 'cv-body');
  surface.content.append(body);
  const paint = () => {
    const saved = savedMembersSee();
    let picked = { see: saved, land: saved[0] || '' };
    const notice = createNotice();
    const form = el('form', 'cv-defaults-form');
    const field = el('div', 'cv-default-field');
    const options = workbenches();
    const questions = ask([{ group: t('settings2.members', 'Members'), fields: [
      { key: 'see', label: t('settings2.members_see_which', 'Members see'), many: true, options },
      { key: 'land', label: t('settings2.members_land', 'Members land on'), options },
    ] }], { value: picked, trayHost: field, onChange: (value) => { picked = value; } });
    field.append(questions.el);
    const actions = el('div', 'cv-default-actions');
    const save = el('button', 'cv-save', t('panels.save', 'Save'));
    save.type = 'submit';
    actions.append(notice.el, save);
    form.append(field, actions);
    body.replaceChildren(
      el('p', 'cv-note', t('settings2.members_see_help', 'The workbenches everyone whose role is member is shown, and the one they land on. You, the owner, always see everything. With none picked, members see everything too.')),
      form,
    );
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const see = Array.isArray(picked.see) ? picked.see : [];
      const land = picked.land || see[0] || '';
      const list = see.length ? [land, ...see.filter((name) => name !== land)] : [];
      save.disabled = true;
      const result = await request('/api/workbenches/members-see', { method: 'PUT', json: { workbenches: list } });
      save.disabled = false;
      if (!result.ok) return notice.set('failed', result.message);
      setSavedMembersSee(list);
      notice.set('success',t('campaign.saved', 'Saved.'));
    });
  };
  return { el: surface.el, show: paint };
}
