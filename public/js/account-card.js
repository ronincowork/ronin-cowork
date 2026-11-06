/* part of the ronin-cowork client — see js/README.md */
/**
 * THE OFFICE AND ACCOUNT CARD — read-only, two sections that must agree on one value.
 *
 * OFFICE is where this Ronin lives: the office record (GET /api/office, src/office-record.ts)
 * says self-hosted, or an office on an office_park with its office_id, office_park and house
 * gateway. It is this machine's own fact and shows for everyone, Services or not.
 *
 * ACCOUNT is the user's standing with Ronin HQ: which account, its subscription status as HQ
 * records it, and the house-model usage the gateway counted. The view and its states belong
 * to the Services `account` part (ronin-services account/read.ts, GET /api/account); HQ is
 * the account authority. A 404 means the part is absent, and only that leaves the account
 * section at one line. Every other answer is shown in its own words: missing information is
 * never drawn as an active subscription or as zero usage. No action here changes anything.
 *
 * The one value both sections carry is the office_id; a disagreement is said, never hidden.
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

const when = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '—');

/**
 * Pure: GET /api/office → { title, blurb, rows: [[label, value]], office_id }.
 * `result` is request.js's { ok, status, data }.
 */
export function officeModel(result) {
  const v = result?.ok ? result.data : null;
  if (!v || typeof v.hosting !== 'string') {
    return { title: t('office.unreadable', 'Could not be read'), blurb: result?.message || t('office.unreadable_blurb', 'Ronin could not read the office record.'), rows: [], office_id: null };
  }
  switch (v.hosting) {
    case 'self_hosted':
      return { title: t('office.self_hosted', 'Self-hosted'), blurb: t('office.self_hosted_blurb', 'This Ronin runs on its own machine. There is no office record.'), rows: [[t('office.host', 'machine'), v.host || '—']], office_id: null };
    case 'office_unit': {
      const r = v.record || {};
      return {
        title: t('office.office_park', 'Hosted office'),
        blurb: t('office.office_park_blurb', 'An office on an office_park, as its office record says.'),
        rows: [
          [t('office.office_id', 'office'), r.office_id || '—'],
          [t('office.office_park_name', 'office park'), r.office_park || '—'],
          [t('office.gateway', 'house gateway'), r.gateway_office || '—'],
          [t('office.provisioned', 'provisioned'), when(r.provisioned_at)],
        ],
        office_id: r.office_id || null,
      };
    }
    case 'unreadable':
      return { title: t('office.record_unreadable', 'Office record unreadable'), blurb: t('office.record_unreadable_blurb', 'office.json is present but wrong: {error}. This is a provisioning fault; nothing here is self-hosted.', { error: v.error || '—' }), rows: [], office_id: null };
    default:
      return { title: STATUS_WORDS().unknown, blurb: '', rows: [], office_id: null };
  }
}

/** Pure: the one value both sections carry. A sentence when they disagree, else null. */
export function officeAgreement(office, account) {
  const mine = office?.office_id, theirs = account?.office_id;
  if (!mine || !theirs || mine === theirs) return null;
  return t('account.office_differs', 'Ronin HQ has this install mapped to office {theirs}; the office record says {mine}. One of them is wrong.', { theirs, mine });
}

const USAGE_REASONS = () => ({
  no_account: t('account.usage_no_account', 'Unknown: no Cloud account to count against.'),
  no_house_token: t('account.usage_no_house_token', 'Unknown: this office holds no house token to ask the gateway with.'),
  gateway_refused: t('account.usage_gateway_refused', 'Unknown: the house gateway refused this office\'s token.'),
  no_usage_ids: t('account.usage_no_ids', 'Unknown: Ronin HQ gave no usage identifiers.'),
  ids_differ: t('account.usage_ids_differ', 'Unknown: the house gateway is stamping a different office or user.'),
  base_unavailable: t('account.usage_base', 'Unknown: the house gateway could not be asked.'),
  ids_unset: t('account.usage_ids_unset', 'Unknown: the house gateway has no office set.'),
  gateway_unavailable: t('account.usage_gateway', 'Unknown: the house gateway could not be reached.'),
});

/**
 * Pure: the operator's answer → { hidden } or { title, blurb, rows: [[label, value]], usage, office_id }.
 * `result` is request.js's { ok, status, data }.
 */
export function accountModel(result) {
  if (!result?.ok && result?.status === 404) return { hidden: true };
  const v = result?.ok ? result.data : null;
  if (!v || typeof v.state !== 'string') {
    return { title: t('account.unreadable', 'Could not be read'), blurb: result?.message || t('account.unreadable_blurb', 'Ronin could not read the account view.'), rows: [], usage: null };
  }
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
      return { title: t('account.current', 'Connected'), blurb: t('account.current_blurb', 'As Ronin HQ records it, read {at}.', { at: when(v.read_at) }), rows: factRows(v.facts), usage: usageOf(v.usage), office_id: v.facts.office.office_id };
    case 'not_hosted':
      return { title: t('account.not_hosted', 'No Ronin HQ account'), blurb: t('account.not_hosted_blurb', 'Self-hosted: there is no Cloud account to show. Everything here keeps working without one.'), rows: [], usage: null };
    case 'office_unreadable':
      return { title: t('account.office_unreadable', 'Office record unreadable'), blurb: t('account.office_unreadable_blurb', 'Ronin HQ is not asked until the office record reads.'), rows: [], usage: null };
    case 'not_activated':
      return { title: t('account.not_activated', 'Not connected'), blurb: t('account.not_activated_blurb', 'This office holds no Ronin HQ credential yet; its provisioning is incomplete.'), rows: [], usage: null };
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

/**
 * `absent`: what to say when the part is not installed. Inside Configuration the card simply
 * disappears; the Cloud Account worksurface (campaign-view.js) is the card alone, so it says so.
 */
export function accountCard(container, { absent = null } = {}) {
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
  const blurb = (text) => {
    const say = document.createElement('div');
    say.className = 'st-row st-obs';
    say.textContent = text;
    return say;
  };
  function render(office, model) {
    wrap.replaceChildren();
    // OFFICE first: this machine's own fact, shown whether or not Services is here.
    wrap.appendChild(row(t('office.title', 'Office'), office.title));
    if (office.blurb) wrap.appendChild(blurb(office.blurb));
    for (const [label, value] of office.rows) wrap.appendChild(row(label, value));
    // ACCOUNT: one line when the part is absent, else HQ's answer in its own words.
    if (model.hidden) {
      wrap.appendChild(row(t('account.title', 'Cloud account'), absent || t('account.absent', 'No Ronin HQ account.')));
      return;
    }
    wrap.appendChild(row(t('account.title', 'Cloud account'), model.title));
    if (model.blurb) wrap.appendChild(blurb(model.blurb));
    const differs = officeAgreement(office, model);
    if (differs) wrap.appendChild(row(t('account.office_differs_label', 'office differs'), differs, 'st-row st-obs bad'));
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
  async function load() {
    const [office, account] = await Promise.all([request('/api/office', { cache: 'no-store' }), request('/api/account', { cache: 'no-store' })]);
    render(officeModel(office), accountModel(account));
  }
  void load();
  return { load, stop() { wrap.remove(); } };
}
