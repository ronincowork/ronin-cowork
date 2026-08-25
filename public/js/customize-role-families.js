/* Role-family membership — the one direct editor Customize is currently granted. */
import { addProvMark } from './provenance.js';
import { WorkspaceKit } from './workspace-kit.js';
import { familyMembership, saveFamilyMembership } from './customize-role-families-core.js';

export function buildRoleFamilyEditor(families, roles, onSaved) {
  const { createAction, createActionBar, createCard, createNotice } = WorkspaceKit.primitives;
  const root = document.createElement('div');
  root.className = 'cz-family-editor';
  root.append(createNotice({
    kind: 'warning',
    message: 'Changing a shipped family makes the whole definition yours; later improvements to Ronin’s copy stop reaching it.',
  }).el);

  for (const family of families) {
    const card = createCard({
      heading: family.label || family.name,
      summary: family.blurb || 'Choose which session roles this Family presents.',
      metadata: [family.name, family.default_lead_role ? `pinned first: ${family.default_lead_role}` : null].filter(Boolean),
    });
    addProvMark(card.heading, family);
    const notice = createNotice();
    const actions = [];
    for (const role of roles) {
      const action = createAction({ label: `${role.icon || ''} ${role.label || role.name}`.trim() });
      action.el.setAttribute('aria-pressed', String(familyMembership(family).includes(role.name)));
      action.el.addEventListener('click', async () => {
        actions.forEach((item) => item.setDisabled(true));
        notice.set('info', 'Saving membership…');
        const { result } = await saveFamilyMembership(family, role.name);
        if (!result.ok) {
          notice.set('failed', result.message);
          actions.forEach((item) => item.setDisabled(false));
          return;
        }
        notice.set('success', 'Membership saved.');
        await onSaved();
      });
      actions.push(action);
    }
    card.el.append(createActionBar({ label: `${family.label || family.name} membership`, actions }).el, notice.el);
    root.append(card.el);
  }
  return root;
}
