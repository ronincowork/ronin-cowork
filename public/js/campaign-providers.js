/* part of the ronin-cowork client — see js/README.md */
/**
 * MODEL PROVIDERS — the Campaign's catalog surface, and its selector card.
 *
 * One place to look at every model provider and every model Ronin offers, not only the
 * ones this machine is signed into: the provider catalog (`ronin_catalogs/MODEL_PROVIDERS.md`,
 * or the owner's shadow of it) with each model's tier, dated cost, what it is good at and
 * not good at, and, on the same rows, what this machine measured — installed, signed in,
 * activated — from the Campaign's recorded provider summary, dated once. Nothing here
 * probes, signs in or activates: that is Ronin Setup's Model providers surface. The stones
 * are the providers on the shared stone work surface; a stone's detail is that provider's
 * facts and its model table. The rows come from the one picker's catalog read
 * (form-steps.js), so this surface and every picker cannot disagree.
 */
import { t } from './lexicon.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { loadProviderCatalog, providerCatalog, tierWord } from './form-steps.js';

const el = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = String(text); return out; };

export const CAMPAIGN_PROVIDERS_TYPE = 'campaign.providers';

export function campaignProvidersDefinition() {
  return {
    type: CAMPAIGN_PROVIDERS_TYPE,
    header: 'surface',
    label: () => t('campaign_view.providers', 'Model providers'),
    summary: () => providersSummary(providerCatalog()),
    create: ({ environment: e }) => {
      const surface = createProvidersSurface(() => e?.workbench?.()?.refreshSelector?.());
      return { el: surface.el, show: () => surface.enter() };
    },
  };
}

/** The card's line: what the catalog holds and how many providers this machine can launch. */
export function providersSummary(catalog) {
  if (!catalog?.loaded) return t('campaign_view.providers_summary_unread', 'Every provider and model Ronin offers, and what this machine has.');
  const rows = catalog.rows;
  const providers = new Set(rows.map((row) => row.provider)).size;
  const activated = new Set(rows.filter((row) => row.operational).map((row) => row.provider)).size;
  return t('campaign_view.providers_summary', '{providers} providers · {models} models · {activated} activated here', { providers, models: rows.length, activated });
}

/** The measured word for a provider's stone, from the machine's row for its CLI. */
export function providerState(entry) {
  if (entry?.activated) return t('campaign_view.provider_activated', 'activated');
  if (entry?.signed_in) return t('campaign_view.provider_signed_in', 'signed in');
  if (entry?.installed) return t('campaign_view.provider_installed', 'installed');
  return t('campaign_view.provider_absent', 'not installed');
}

export function createProvidersSurface(onLoaded = null) {
  const { createSurface } = WorkspaceKit.primitives;
  const yesNo = (on) => (on ? t('campaign_view.yes', 'yes') : t('campaign_view.no', 'no'));
  const when = (stamp) => { const date = new Date(stamp); return Number.isNaN(date.getTime()) ? String(stamp) : date.toLocaleString(); };
  const surface = createSurface({ label: t('campaign_view.providers', 'Model providers'), className: 'cv-surface cv-providers' });
  const intro = el('div', 'cv-providers-intro');
  const measured = el('p', 'cv-note cv-providers-measured');
  intro.append(el('p', 'cv-note', t('campaign_view.providers_help', 'Every model provider and model Ronin offers, from the catalog: tier, cost as read, what each is good at and not. Installed, signed in and activated are what this machine measured.')), measured);
  const stones = createStoneWorkSurface({ className: 'cv-provider-stones', renderDetail: (item, host) => paintProvider(item.id, host) });
  stones.mount(surface.content, { before: [intro] });

  const measuredLine = () => {
    const stamp = providerCatalog().measured_at;
    return stamp
      ? t('campaign_view.providers_measured', 'This machine was measured {when}. Ronin Setup → Model providers measures it again.', { when: when(stamp) })
      : t('campaign_view.providers_unmeasured', 'This machine has not been measured yet. Ronin Setup → Model providers measures it.');
  };
  const machineRow = (cli) => providerCatalog().machine.find((entry) => entry?.id === cli) || null;

  /** One provider's detail: its facts as measured, dated, then every model the catalog lists. */
  const paintProvider = (provider, host) => {
    const rows = providerCatalog().rows.filter((row) => row.provider === provider);
    if (!rows.length) { host.append(el('p', 'cv-note', t('campaign_view.provider_missing', 'This provider is no longer in the catalog.'))); return null; }
    const first = rows[0];
    const entry = machineRow(first.cli);
    const card = el('article', 'cv-provider');
    card.dataset.provider = provider;
    const head = el('header', 'cv-provider-head');
    head.append(el('h2', null, first.provider_label));
    head.append(el('p', 'cv-from', t('campaign_view.provider_served_by', 'Served by {cli} · {n} models in the catalog', { cli: first.cli_label || first.cli, n: rows.length })));
    card.append(head);
    const facts = el('dl', 'cv-provider-facts');
    for (const [label, on] of [
      [t('campaign_view.fact_installed', 'Installed'), entry?.installed === true],
      [t('campaign_view.fact_signed_in', 'Signed in'), entry?.signed_in === true],
      [t('campaign_view.fact_activated', 'Activated'), entry?.activated === true],
    ]) { const fact = el('div'); fact.dataset.on = String(on); fact.append(el('dt', null, label), el('dd', null, yesNo(on))); facts.append(fact); }
    card.append(facts, el('p', 'cv-note', measuredLine()));
    const table = el('table', 'cv-table cv-provider-models');
    const headRow = el('tr');
    for (const text of [t('campaign_view.col_model', 'Model'), t('campaign_view.col_tier', 'Tier'), t('campaign_view.col_cost', 'Cost'), t('campaign_view.col_good_at', 'Good at'), t('campaign_view.col_not_good_at', 'Not good at')]) headRow.append(el('th', null, text));
    const thead = el('thead'); thead.append(headRow);
    const body = el('tbody');
    for (const row of rows) {
      const line = el('tr');
      line.dataset.model = row.model;
      line.dataset.tier = row.tier;
      const name = el('td'); name.append(el('b', null, row.model));
      if (row.default) name.append(el('span', 'cv-from', t('campaign_view.model_default_mark', 'the default')));
      line.append(name, el('td', 'cv-tier', tierWord(row.tier)), el('td', null, row.cost || ''), el('td', null, row.good_at || ''), el('td', null, row.not_good_at || ''));
      body.append(line);
    }
    table.append(thead, body);
    const scroll = el('div', 'cv-provider-table');
    scroll.append(table);
    card.append(scroll);
    host.append(card);
    return null;
  };

  const paint = () => {
    const { rows } = providerCatalog();
    measured.textContent = measuredLine();
    const providers = rows.filter((row, index) => rows.findIndex((other) => other.provider === row.provider) === index);
    stones.setItems(providers.map((row) => {
      const entry = machineRow(row.cli);
      return {
        id: row.provider, label: row.provider_label,
        secondary: t('campaign_view.provider_models_n', '{n} models', { n: rows.filter((item) => item.provider === row.provider).length }),
        state: providerState(entry), className: 'cv-provider-stone',
        attrs: { 'data-provider': row.provider, 'data-activated': String(entry?.activated === true) },
      };
    }));
    surface.setState(providers.length ? null : 'empty', providers.length ? '' : t('campaign_view.providers_none', 'No model providers are in the catalog on this machine.'));
  };

  return {
    el: surface.el,
    enter: async () => {
      if (!providerCatalog().loaded) surface.setState('loading', t('campaign_view.providers_loading', 'Reading the catalog…'));
      await loadProviderCatalog();
      paint();
      onLoaded?.();
    },
    destroy: () => stones.destroy(),
  };
}
