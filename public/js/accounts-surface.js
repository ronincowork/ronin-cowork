/* part of the ronin-cowork client — see js/README.md */
/**
 * THE ACCOUNTS TILESPACE (KAN-236, the Agent Harness workbench; owner, 2026-11-03): every account that is not
 * a harness's own sign-in — Personal API and Ronin API — each with the harnesses it works with, Discover, Edit and Remove; Add Personal API and Add Ronin API below. Harnesses and
 * accounts are two views on one list: an account added here is the connection the Hermes page shows, and the
 * one New Agent reads. The Ronin API is seeded greyed until a token arrives: disabled, never hidden.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { el, harnessCatalog } from './form-steps.js';
import { t } from './lexicon.js';
import { accountAction, accountForm, accountSummary, button } from './account-editors.js';

/** The harnesses a model service works with, by name: a fact it reports, never a tick (KAN-896). */
export function worksWithLine(account) {
  const known = new Map((harnessCatalog().harnesses || []).map((p) => [p.cli, p.cli_label || p.label || p.cli]));
  return t('accounts.works_with', 'Works with {harnesses}', { harnesses: account.bound.map((id) => known.get(id) || id).join(', ') });
}

export function createAccountsSurface(context) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('accounts.title', 'Accounts'), className: 'setup-surface accounts-surface' });
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  const list = el('div', 'accounts-list');
  const editor = el('div', 'accounts-editor');
  const adders = el('div', 'accounts-adders');
  const body = el('div', 'accounts-body');
  out.content.append(body);
  body.append(el('p', 'setup-fine', t('accounts.lede', 'Accounts a harness can launch on, apart from its own sign-in. A key added here, or on a harness page, is one record. Each harness chooses in its own settings which of these it shows in New Agent.')), notice, list, adders, editor);
  let state = { accounts: [], presets: [] };
  let disposed = false;
  const took = (answer) => { if (!answer || disposed) return; state = answer; editor.replaceChildren(); paint(); context.workbench?.refreshSelector?.(); };
  const card = (a) => {
    const row = el('div', 'hermes-card accounts-card');
    row.dataset.kind = a.kind; if (a.seeded) row.dataset.seeded = 'true';
    row.append(accountSummary(a));
    const controls = [];
    if (a.seeded) controls.push(button(t('accounts.add_token', 'Add token'), () => open(accountForm(a, { kind: 'ronin_api', onSaved: took, onCancel: () => editor.replaceChildren(), say }))));
    else {
      controls.push(button(t('accounts.discover', 'Discover'), async () => took(await accountAction('discover', { id: a.id }, say))));
      controls.push(button(t('accounts.edit', 'Edit'), () => open(accountForm(a, { kind: a.kind, onSaved: took, onCancel: () => editor.replaceChildren(), say }))));
      if (!a.credentialEnv) controls.push(button(t('accounts.remove', 'Remove'), async () => took(await accountAction('delete', { id: a.id }, say))));
    }
    row.append(WorkspaceKit.primitives.createActionBar({ actions: controls }).el);
    row.append(el('p', 'setup-fine', worksWithLine(a)));
    return row;
  };
  const open = (form) => { editor.replaceChildren(form); form.scrollIntoView?.({ block: 'nearest' }); };
  const paint = () => {
    if (disposed) return;
    list.replaceChildren(...state.accounts.map(card));
    adders.replaceChildren(WorkspaceKit.primitives.createActionBar({ actions: [
      button(t('accounts.add_personal_api', 'Add private API'), () => open(accountForm({}, { kind: 'personal_api', onSaved: took, onCancel: () => editor.replaceChildren(), say }))),
      button(t('accounts.add_ronin_api', 'Add Ronin Gateway'), () => open(accountForm({}, { kind: 'ronin_api', onSaved: took, onCancel: () => editor.replaceChildren(), say }))),
    ] }).el);
  };
  return {
    el: out.el,
    show: async () => {
      const result = await request('/api/accounts', { cache: 'no-store' });
      if (disposed) return;
      if (result.ok) { state = result.data; paint(); } else say(result.message, true);
    },
    destroy: () => { disposed = true; },
  };
}
