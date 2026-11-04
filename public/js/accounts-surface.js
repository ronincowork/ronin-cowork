/* part of the ronin-cowork client — see js/README.md */
/**
 * THE ACCOUNTS TILESPACE (KAN-236, the Agent Harness workbench; owner, 2026-11-03): every account that is not
 * a harness's own sign-in — Personal API and Ronin API — each with the harnesses it serves and the models it
 * offers as tick lists, Discover, Edit and Remove; Add Personal API and Add Ronin API below. Harnesses and
 * accounts are two views on one list: an account added here is the connection the Hermes page shows, and the
 * one New Agent reads. The Ronin API is seeded greyed until a token arrives: disabled, never hidden.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { el, dayTime, providerCatalog } from './form-steps.js';
import { t } from './lexicon.js';
import { accountAction, accountForm, accountSummary, button, tickList } from './account-editors.js';

/** The harness rows a tick list offers: every harness the catalog knows, labelled, with "no binding yet" where a launch cannot run on an account. */
export function harnessRows(account) {
  const known = new Map((providerCatalog().providers || []).map((p) => [p.cli, p.cli_label || p.label || p.cli]));
  const ids = [...new Set([...account.harnesses, ...known.keys()])].filter((id) => id && (account.kind !== 'ronin_api' || id !== 'claude'));
  return ids.map((id) => [id, known.get(id) || id, account.bound.includes(id) || !account.harnesses.includes(id) ? '' : t('accounts.no_binding', 'no binding yet')]);
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
  body.append(el('p', 'setup-fine', t('accounts.lede', 'Accounts a harness can launch on, apart from its own sign-in. A key added here, or on a harness page, is one record; the harnesses it serves and the models it offers are yours to tick.')), notice, list, adders, editor);
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
    if (!a.seeded) {
      const lists = el('div', 'accounts-lists');
      const harnesses = el('div', 'accounts-list-block');
      harnesses.append(el('p', 'setup-provider-note', t('accounts.serves', 'Serves')), tickList(harnessRows(a), a.harnesses, (ids) => accountAction('lists', { id: a.id, harnesses: ids }, say).then(took)));
      const models = el('div', 'accounts-list-block');
      models.append(el('p', 'setup-provider-note', a.discoveredAt ? t('accounts.offers_dated', 'Offers · discovered {date}', { date: dayTime(a.discoveredAt) }) : t('accounts.offers', 'Offers')));
      models.append(a.models.length ? tickList(a.models.map((id) => [id, id]), a.offered, (ids) => accountAction('lists', { id: a.id, offered: ids }, say).then(took)) : el('p', 'setup-fine', t('accounts.discover_first', 'Press Discover to read this endpoint’s model list.')));
      lists.append(harnesses, models);
      row.append(lists);
    }
    return row;
  };
  const open = (form) => { editor.replaceChildren(form); form.scrollIntoView?.({ block: 'nearest' }); };
  const paint = () => {
    if (disposed) return;
    list.replaceChildren(...state.accounts.map(card));
    adders.replaceChildren(WorkspaceKit.primitives.createActionBar({ actions: [
      button(t('accounts.add_personal_api', 'Add Personal API'), () => open(accountForm({}, { kind: 'personal_api', onSaved: took, onCancel: () => editor.replaceChildren(), say }))),
      button(t('accounts.add_ronin_api', 'Add Ronin API'), () => open(accountForm({}, { kind: 'ronin_api', onSaved: took, onCancel: () => editor.replaceChildren(), say }))),
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
