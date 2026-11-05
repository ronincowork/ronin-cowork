/* part of the ronin-cowork client — see js/README.md */
/**
 * THE CLOUD ACCOUNT CARD — read-only: which account and office this is, its subscription
 * status as Ronin HQ records it, and the house-model usage the gateway counted for it.
 *
 * The view and its states belong to the Services `account` part (ronin-services
 * account/read.ts, GET /api/account); HQ is the account authority. This file only says what
 * the operator said. A 404 means the part is absent, and only that hides the card. Every
 * other answer is shown in its own words: missing information is never drawn as an active
 * subscription or as zero usage. No action here changes anything at HQ.
 */
import { request } from './request.js';
import { t } from './lexicon.js';

const STATUS_WORDS = () => ({
  none: t('account.status_none', 'No subscription'),
  trial: t('account.status_trial', 'Trial'),
  active: t('account.status_active', 'Active'),
  paused: t('account.status_paused', 'Paused'),
  cancelled: t('account.status_cancelled', 'Cancelled'),
  unknown: t('account.status_unknown', 'Unknown'),
});

const USAGE_REASONS = () => ({
  no_account: t('account.usage_no_account', 'Unknown: no Cloud account to count against.'),
  no_usage_ids: t('account.usage_no_ids', 'Unknown: Ronin HQ gave no usage identifiers.'),
  ids_differ: t('account.usage_ids_differ', 'Unknown: the house gateway is stamping a different office or user.'),
  base_unavailable: t('account.usage_base', 'Unknown: the house gateway could not be asked.'),
  ids_unset: t('account.usage_ids_unset', 'Unknown: the house gateway has no office set.'),
  gateway_unavailable: t('account.usage_gateway', 'Unknown: the house gateway could not be reached.'),
});

/**
 * Pure: the operator's answer → { hidden } or { title, blurb, rows: [[label, value]], usage }.
 * `result` is request.js's { ok, status, data }.
 */
export function accountModel(result) {
  if (!result?.ok && result?.status === 404) return { hidden: true };
  const v = result?.ok ? result.data : null;
  if (!v || typeof v.state !== 'string') {
    return { title: t('account.unreadable', 'Could not be read'), blurb: result?.message || t('account.unreadable_blurb', 'Ronin could not read the account view.'), rows: [], usage: null };
  }
  const when = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '—');
  const factRows = (f) => [
    [t('account.account', 'account'), f.account.display_name ? `${f.account.display_name} (${f.account.user_id})` : f.account.user_id],
    [t('account.office', 'office'), f.office.office_id],
    [t('account.subscription', 'subscription'), (STATUS_WORDS()[f.subscription.status] ?? STATUS_WORDS().unknown) + (f.subscription.plan ? ` · ${f.subscription.plan}` : '')],
    [t('account.changed', 'last changed'), when(f.subscription.changed_at)],
  ];
  const usageOf = (u) => {
    if (u?.state !== 'current') return { known: false, text: USAGE_REASONS()[u?.reason] ?? t('account.usage_unknown', 'Unknown.') };
    if (!u.calls) return { known: true, text: t('account.usage_none', 'No house-model calls counted yet.'), models: [] };
    return { known: true, text: t('account.usage_since', '{n} calls since {since}.', { n: u.calls, since: when(u.tracked_since) }), models: u.by_model };
  };
  switch (v.state) {
    case 'current':
      return { title: t('account.current', 'Connected'), blurb: t('account.current_blurb', 'As Ronin HQ records it, read {at}.', { at: when(v.read_at) }), rows: factRows(v.facts), usage: usageOf(v.usage) };
    case 'not_activated':
      return { title: t('account.not_activated', 'Not connected'), blurb: t('account.not_activated_blurb', 'This Ronin is not linked to Ronin HQ. Everything here keeps working without a Cloud account.'), rows: [], usage: null };
    case 'not_mapped':
      return { title: t('account.not_mapped', 'No Cloud account'), blurb: t('account.not_mapped_blurb', 'Ronin HQ knows this install but has not linked it to an account.'), rows: [], usage: null };
    case 'refused':
      return { title: t('account.refused', 'Refused by Ronin HQ'), blurb: t('account.refused_blurb', 'Ronin HQ did not accept this install ({code}).', { code: v.code ?? '—' }), rows: [], usage: null };
    case 'hq_unavailable': {
      const last = v.last_known;
      return {
        title: t('account.hq_unavailable', 'Ronin HQ unavailable'),
        blurb: last ? t('account.hq_unavailable_last', 'Showing what HQ said at {at}; it may have changed.', { at: when(last.read_at) })
          : t('account.hq_unavailable_blurb', 'The account cannot be shown until Ronin HQ answers.'),
        rows: last ? factRows(last.facts) : [],
        usage: null,
      };
    }
    default:
      return { title: STATUS_WORDS().unknown, blurb: '', rows: [], usage: null };
  }
}

export function accountCard(container) {
  const wrap = document.createElement('div');
  wrap.className = 'st-account';
  container.appendChild(wrap);
  const row = (label, value, cls = 'st-row st-obs') => {
    const r = document.createElement('div');
    r.className = cls;
    const l = document.createElement('div');
    l.className = 'st-lab';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'st-val';
    v.textContent = value;
    r.append(l, v);
    return r;
  };
  function render(model) {
    wrap.replaceChildren();
    if (model.hidden) return;
    wrap.appendChild(row(t('account.title', 'Cloud account'), model.title));
    if (model.blurb) {
      const say = document.createElement('div');
      say.className = 'st-row st-obs';
      say.textContent = model.blurb;
      wrap.appendChild(say);
    }
    for (const [label, value] of model.rows) wrap.appendChild(row(label, value));
    if (model.usage) {
      wrap.appendChild(row(t('account.usage', 'house models'), model.usage.text));
      for (const m of model.usage.models ?? []) {
        const unknown = m.usage_unknown_calls ? t('account.usage_unknown_calls', ', {n} without a count', { n: m.usage_unknown_calls }) : '';
        wrap.appendChild(row(m.model, t('account.usage_model', '{calls} calls · {input} in · {output} out{unknown}',
          { calls: m.calls, input: m.input_tokens, output: m.output_tokens, unknown })));
      }
    }
  }
  async function load() { render(accountModel(await request('/api/account', { cache: 'no-store' }))); }
  void load();
  return { load, stop() { wrap.remove(); } };
}
