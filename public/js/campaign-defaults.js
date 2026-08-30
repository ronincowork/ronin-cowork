/* part of the ronin-cowork client — see js/README.md */
/**
 * AGENT DEFAULTS — what a new Agent in this Campaign starts on when the launch does not
 * say (owner, 2026-08-30): a Campaign carries these so they can differ by Campaign, and
 * the Campaign's copy is a SUBSET of SETTEI — the same two keys `agents.sessions.default`
 * and `agents.sessions.by_provider.<provider>` hold, in the same shape, under
 * `campaign_config.config.agent_defaults`. A row the Campaign has not answered shows and
 * uses SETTEI's answer, marked as such; a row it has answered is its own.
 *
 * ONE TABLE, NOT A DROPDOWN GATING A DROPDOWN: provider on the left, that provider's
 * models on the right, one radio for which row is the default, one row per provider the
 * launch table carries (`/api/session-launch-specs` — data, never a list this file
 * spells), so a new provider appears without code.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { saveCampaign } from './campaigns.js';
import { WorkspaceKit } from './workspace-kit.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

const bucket = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** The Campaign's answer where it has one, else SETTEI's — the subset rule, read once. */
export function effectiveDefaults(campaign, settei) {
  const mine = bucket(campaign?.config?.agent_defaults);
  const house = bucket(settei?.set?.agents?.sessions);
  const def = bucket(mine.default);
  const houseDef = bucket(house.default);
  return {
    default: def.provider && def.model ? { ...def, own: true } : { provider: houseDef.provider || '', model: houseDef.model || '', own: false },
    by_provider: (provider) => {
      const own = bucket(mine.by_provider)[provider];
      if (own) return { model: String(own), own: true };
      const theirs = bucket(house.by_provider)[provider];
      return { model: theirs ? String(theirs) : '', own: false };
    },
  };
}

export function createAgentDefaultsSurface(campaign) {
  const { createSurface, createNotice } = WorkspaceKit.primitives;
  const label = t('campaign_view.agent_defaults', 'Agent defaults');
  const surface = createSurface({ label, className: 'cv-surface' });
  const body = el('div', 'cv-body');
  surface.content.append(body);
  let specs = [];
  let settei = null;

  const load = async () => {
    const [sp, st] = await Promise.all([request('/api/session-launch-specs'), request('/api/settei')]);
    specs = sp.ok && Array.isArray(sp.data) ? sp.data : [];
    settei = st.ok ? st.data : null;
  };

  const save = async (patch, notice) => {
    const row = campaign();
    if (!row) return;
    const cur = bucket(row.config?.agent_defaults);
    const next = {
      default: patch.default !== undefined ? patch.default : bucket(cur.default),
      by_provider: { ...bucket(cur.by_provider), ...(patch.by_provider || {}) },
    };
    notice.set('info', t('campaign.saving', 'saving…'));
    const r = await saveCampaign(row.id, { config: { agent_defaults: next } });
    notice.set(r.ok ? 'success' : 'failed', r.ok ? t('settei.saved', 'saved') : r.message);
    if (r.ok) paint();
  };

  function paint() {
    const row = campaign();
    body.replaceChildren();
    if (!row) return surface.setState('empty', t('campaign_view.none_selected', 'No Campaign selected.'));
    surface.setState(null, '');
    const providers = [...new Set(specs.map((s) => s.provider))];
    if (!providers.length) return surface.setState('empty', t('campaign_view.no_launch_table', 'No launch table on this install.'));
    const eff = effectiveDefaults(row, settei);
    const notice = createNotice();
    body.append(el('p', 'cv-note', t('campaign_view.defaults_help', 'What a new Agent here starts on when the launch does not say. A row this Campaign has not answered uses the machine’s SETTEI answer, marked as such.')));

    const table = el('table', 'cv-table');
    const head = el('tr');
    for (const word of [t('campaign_view.col_provider', 'Provider'), t('campaign_view.col_model', 'Preferred model'), t('campaign_view.col_default', 'Default')]) head.append(el('th', null, word));
    table.append(head);
    for (const provider of providers) {
      const tr = el('tr');
      const pref = eff.by_provider(provider);
      const models = specs.filter((s) => s.provider === provider);
      const sel = el('select', 'cv-input');
      sel.add(new Option(t('settei.none_set', '— none set —'), ''));
      for (const s of models) sel.add(new Option(s.model, s.model));
      sel.value = pref.model && models.some((s) => s.model === pref.model) ? pref.model : '';
      sel.addEventListener('change', () => void save({ by_provider: { [provider]: sel.value } }, notice));
      const radio = el('input');
      radio.type = 'radio'; radio.name = 'cv-default'; radio.value = provider;
      radio.checked = eff.default.provider === provider;
      radio.title = t('campaign_view.default_help', 'The row a launch that names nothing starts from.');
      radio.addEventListener('change', () => {
        const model = sel.value || models[0]?.model || '';
        void save({ default: { provider, model } }, notice);
      });
      const who = el('td');
      who.append(el('b', null, provider));
      if (!pref.own && pref.model) who.append(el('small', 'cv-from', t('campaign_view.from_settei', 'from SETTEI')));
      const pick = el('td'); pick.append(sel);
      const def = el('td'); def.append(radio);
      if (eff.default.provider === provider && !eff.default.own) def.append(el('small', 'cv-from', t('campaign_view.from_settei', 'from SETTEI')));
      tr.append(who, pick, def);
      table.append(tr);
    }
    body.append(table, notice.el);
    body.append(el('p', 'cv-note', t('campaign_view.defaults_scope', 'Role, reach and who may read an Agent are set when it is launched, not here.')));
  }

  return {
    el: surface.el,
    enter: () => { void load().then(paint); },
  };
}

/** The card's one line: the default row, and whose answer it is. */
export function defaultsSummary(campaign, settei) {
  const eff = effectiveDefaults(campaign, settei);
  if (!eff.default.provider) return t('campaign_view.defaults_none', 'None set — a launch must name a model.');
  const line = `${eff.default.provider} · ${eff.default.model}`;
  return eff.default.own ? line : t('campaign_view.defaults_from_settei', '{line} (from SETTEI)', { line });
}
