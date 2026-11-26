/* part of the ronin-cowork client — see js/README.md */

/* THE SCHEMA VOCABULARY — the interpreter both settei surfaces share.
 *
 * The record's `schema` block (src/machine-settings.ts MACHINE_SETTINGS_SCHEMA) declares every askable
 * leaf as data; this module knows how to READ that vocabulary — paths, option
 * sources, value shapes — and deliberately knows NO field. A field
 * name appearing in this file would be the second declaration the registry exists to
 * end. The Machine Settings renderer owns furniture and layout; this
 * owns meaning.
 *
 * `ctx` is what a surface already fetched and chose: { record, home, rows }, where
 * `rows` is the provider catalog as the server joins it (form-steps.js
 * `harnessCatalog().rows`): every row carries its tier and whether this machine can launch it.
 */

/** A provider·model value is one string so it survives a plain <option> and a text field. */
export const pm = (s) => s.provider + '\t' + s.model;
const splitPm = (v) => String(v || '').split('\t');

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

/**
 * The options a plain select offers — resolved from the surface's own ctx. A field whose
 * options are `models` or `models_for:<provider>` is not a plain select: it is the one
 * picker (form-steps.js `harnessModelPair`), and `pickerHarness` says which form.
 */
export function optionsOf(f, ctx) {
  if (f.options === 'desk_profiles') return (ctx.deskProfiles ?? []).map((p) => ({ label: p.label, value: p.name }));
  if (Array.isArray(f.choices)) return f.choices.map((choice) => typeof choice === 'string' ? { label: choice, value: choice } : choice);
  return [];
}

/** Is this field the picker, and in which form: `{ fixed }` with the provider a
 * `models_for:` row fixes (the row is the provider, the pick is the model alone), or ''
 * for the free pair; null for any other field. */
export function pickerHarness(f) {
  const options = String(f?.options ?? '');
  if (options === 'models') return { fixed: '' };
  if (options.startsWith('models_for:')) return { fixed: options.slice('models_for:'.length) };
  return null;
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

/** The request for ONE field's answer — how ⚙ saves a row by itself. */
export function toRequest(schema, f, v) {
  const json = {};
  land(json, f.lands.key, shaped(f, v));
  return { route: '/api/machine-settings', method: 'PATCH', json: { family: f.lands.family, value: json } };
}
