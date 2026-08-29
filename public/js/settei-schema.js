/* part of the ronin-cowork client — see js/README.md */

/* THE SCHEMA VOCABULARY — the interpreter both settei surfaces share.
 *
 * The record's `schema` block (src/settei.ts SETTEI_SCHEMA) declares every askable
 * leaf as data; this module knows how to READ that vocabulary — paths, seeds, option
 * sources, value shapes, the omission rule — and deliberately knows NO field. A field
 * name appearing in this file would be the second declaration the registry exists to
 * end. The renderers (js/cowork-setup.js, js/settei.js) own furniture and layout; this
 * owns meaning.
 *
 * `ctx` is what a surface already fetched and chose: { record, home, modelOpts,
 * light }. The two surfaces build different modelOpts on purpose — first run offers
 * only what the box can run, ⚙ offers the whole table and says what is not installed.
 */

/** A provider·model select value is one string so it survives a plain <option>. */
export const pm = (s) => s.provider + '\t' + s.model;
export const splitPm = (v) => String(v || '').split('\t');

/** A light tier by name, else the LAST column — the launch table puts a provider's
 * richest default first, so the cheapest thing on offer is at the other end. */
export const LIGHT = /haiku|mini|flash|small|lite/i;

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
  if (f.seed === 'models:first') return ctx.modelOpts?.[0]?.value ?? '';
  if (f.seed === 'models:light') return ctx.light ? pm(ctx.light) : '';
  if (f.seed === 'sessions:estimate') return String(ctx.sessionEstimate ?? 0);
  return '';
}

/** The options a select offers — resolved from the surface's own ctx. */
export function optionsOf(f, ctx) {
  if (f.options === 'models') return ctx.modelOpts ?? [];
  if (f.options === 'desk_profiles') return (ctx.deskProfiles ?? []).map((p) => ({ label: p.label, value: p.name }));
  // New projects and desks (owner, 2026-08-29): two answers, written into RONIN_REPO at add time.
  if (f.options === 'new_project_desks') return [
    { label: 'Desks — each coding session at its own branch and worktree, hand-in, team promotion', value: 'managed' },
    { label: 'None — sessions work in the checkout', value: 'none' },
  ];
  return [];
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

  return [...byFamily.entries()].map(([fam, json]) => {
    const route = schema.families[fam];
    return { family: fam, route: route.route, method: route.method, json };
  });
}

/** The request for ONE field's answer — how ⚙ saves a row by itself. */
export function toRequest(schema, f, v) {
  const json = {};
  land(json, f.lands.key, shaped(f, v));
  const route = schema.families[f.lands.family];
  return { route: route.route, method: route.method, json };
}
