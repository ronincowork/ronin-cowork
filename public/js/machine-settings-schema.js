/* part of the ronin-cowork client — see js/README.md */

/* THE SCHEMA VOCABULARY — the interpreter both settei surfaces share.
 *
 * The record's `schema` block (src/machine-settings.ts MACHINE_SETTINGS_SCHEMA) declares every askable
 * leaf as data; this module knows how to READ that vocabulary — paths, seeds, option
 * sources, value shapes, the omission rule — and deliberately knows NO field. A field
 * name appearing in this file would be the second declaration the registry exists to
 * end. The renderers (js/cowork-setup.js, js/machine-settings.js) own furniture and layout; this
 * owns meaning.
 *
 * `ctx` is what a surface already fetched and chose: { record, home, rows }, where
 * `rows` is the provider catalog as the one picker orders it (form-steps.js
 * `orderedCatalog`): every row carries its tier and whether this machine can launch it.
 */

/** A provider·model value is one string so it survives a plain <option> and a text field. */
export const pm = (s) => s.provider + '\t' + s.model;
export const splitPm = (v) => String(v || '').split('\t');

/**
 * THE ROW A SEED NAMES, from the catalog alone. `models:first` is the catalog default of
 * the first provider this machine can launch; `models:light` is the first launchable row
 * in the light tier — the cheap seat Mika should take — else the first. Null when the
 * machine can launch nothing: a seed never names a model the box cannot run.
 */
export function seedRow(seed, rows = []) {
  const on = (Array.isArray(rows) ? rows : []).filter((row) => row?.operational);
  if (!on.length) return null;
  const first = on.find((row) => row.provider === on[0].provider && row.default) ?? on[0];
  if (seed === 'models:light') return on.find((row) => row.tier === 'light') ?? first;
  return first;
}

/** One path into the record, or undefined. Paths are the registry's own. */
export function getPath(obj, path) {
  return String(path)
    .split('.')
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** The leaf's current value as a control value — '' when unanswered. */
export function currentOf(f, ctx) {
  if (!f.from) return '';
  const v = getPath(ctx.record, f.from);
  if (v == null) return '';
  if (f.shape === 'provider-model') {
    return v.provider && v.model ? pm(v) : '';
  }
  return String(v);
}

/** What the setup view starts a control on: the answer if given, else the seed. */
export function initialOf(f, ctx) {
  const cur = currentOf(f, ctx);
  if (cur !== '') return cur;
  if (f.seed === 'home') return ctx.home ?? '';
  if (f.seed === 'models:first' || f.seed === 'models:light') { const row = seedRow(f.seed, ctx.rows); return row ? pm(row) : ''; }
  if (f.seed === 'sessions:estimate') return String(ctx.sessionEstimate ?? 0);
  if (f.seed === 'open' || f.seed === 'control') return f.seed;
  return '';
}

/**
 * The options a plain select offers — resolved from the surface's own ctx. A field whose
 * options are `models` or `models_for:<provider>` is not a plain select: it is the one
 * picker (form-steps.js `providerModelPair`), and `pickerProvider` says which form.
 */
export function optionsOf(f, ctx) {
  if (f.options === 'desk_profiles') return (ctx.deskProfiles ?? []).map((p) => ({ label: p.label, value: p.name }));
  return [];
}

/** Is this field the picker, and in which form: `{ fixed }` with the provider a
 * `models_for:` row fixes (the row is the provider, the pick is the model alone), or ''
 * for the free pair; null for any other field. */
export function pickerProvider(f) {
  const options = String(f?.options ?? '');
  if (options === 'models') return { fixed: '' };
  if (options.startsWith('models_for:')) return { fixed: options.slice('models_for:'.length) };
  return null;
}

/** Would this value be omitted from a save? The one rule the registry ever declares. */
export function omitted(f, v) {
  if (f.omit !== 'blank') return false;
  if (f.shape === 'provider-model') return !splitPm(v)[1];
  return !String(v ?? '').trim();
}

/** One field's value, shaped for the wire. */
function shaped(f, v) {
  if (f.shape === 'provider-model') {
    const [provider, model] = splitPm(v);
    return { provider, model };
  }
  if (f.shape === 'number') return Number(v);
  const s = String(v ?? '').trim();
  return f.norm === 'lower' ? s.toLowerCase() : s;
}

/** Merge one shaped value into a family body at the registry's key path. */
function land(body, key, value) {
  const parts = String(key).split('.');
  let o = body;
  for (const p of parts.slice(0, -1)) o = o[p] ??= {};
  o[parts[parts.length - 1]] = value;
}

/**
 * Answers in, requests out — one body per family, so a route is called ONCE however
 * many fields feed it, which is what makes adding a field to an existing family free.
 */
export function toRequests(schema, values) {
  const byFamily = new Map();
  const body = (fam) => {
    if (!byFamily.has(fam)) byFamily.set(fam, {});
    return byFamily.get(fam);
  };

  for (const f of schema.fields) {
    const v = values[f.id];
    if (v === undefined || omitted(f, v)) continue;
    land(body(f.lands.family), f.lands.key, shaped(f, v));
  }

  return [...byFamily.entries()].map(([fam, json]) => ({
    family: fam,
    route: '/api/machine-settings',
    method: 'PATCH',
    json: { family: fam, value: json },
  }));
}

/** The request for ONE field's answer — how ⚙ saves a row by itself. */
export function toRequest(schema, f, v) {
  const json = {};
  land(json, f.lands.key, shaped(f, v));
  return { route: '/api/machine-settings', method: 'PATCH', json: { family: f.lands.family, value: json } };
}
