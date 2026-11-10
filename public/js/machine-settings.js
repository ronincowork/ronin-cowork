/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { button, field, status } from './ui.js';
import { pm, getPath, currentOf, optionsOf, pickerProvider, toRequest } from './machine-settings-schema.js';
import { servicesCard } from './services-card.js';
import { accountCard } from './account-card.js';
import { t } from './lexicon.js';
import { loadProviderCatalog, providerCatalog, modelLabel } from './form-steps.js';
import { ask } from './ask.js';
import { saveRow } from './save-row.js';

/* ---------- ⚙ CONFIGURATION — what this install IS, in one room ----------
 *
 * One fetch (`GET /api/machine-settings`) and one screen. The record it draws has three sections
 * and the pane keeps them visibly apart, because a row you can change and a row the box
 * measured are not the same kind of row:
 *
 *   set       an input. Saving it writes one named key.
 *   observed  a line of text. The box said so; there is nothing to type.
 *   status    a note beside the thing it is about — what follows from the other two.
 *
 * WHY EVERY FIELD SAVES ITSELF instead of one Save button at the bottom: each row is a
 * different named endpoint, so a single button would have to fan out into four writes
 * and then explain which of them failed. Per-field saving is what ⌂ Roster's cap and the
 * 目 Koshi outlets already do, and it means the answer to "did that take?" is beside the
 * field you just left rather than at the foot of the page.
 *
 * NOT SHOWN, EVER: a key. The record names the env var an outlet needs and says whether
 * it is set; the value lives in .env and there is no field here that would accept one.
 *
 * WHAT THIS ROOM DOES NOT OWN. Projects are shown and not edited — ▣ Project root is
 * their editor and the roots file stays hand-editable, so this pane links rather than
 * becoming a second owner. The session max is the same number as ⌂ Roster's over one
 * route: two views, never two settings.
 *
 * THE TYPED ROWS RENDER FROM THE RECORD'S OWN `schema` (the registry, src/machine-settings.ts),
 * through the vocabulary in js/machine-settings-schema.js — a leaf asked anywhere is editable
 * here structurally, and this file knows no field. The found and derived rows stay
 * composed by hand on purpose: "pointed at <provider> — <its key> not set" is worth
 * more than a generic renderer could say. Layout — which schema section lands in
 * which group — is this room's own furniture.
 */
export function buildMachineSettings(root, isShowing, { only = null } = {}) {
  let rec = null;
  let deskProfiles = []; // /api/desk-profiles — the ⚙ select's options (R38)

  const head = document.createElement('div');
  head.className = 'st-head';
  const blurb = document.createElement('div');
  blurb.className = 'st-blurb';
  const stamp = document.createElement('div');
  stamp.className = 'st-stamp';
  head.append(blurb, stamp);

  const body = document.createElement('div');
  body.className = 'st-body';
  root.append(head, body);

  /* ---------- the three kinds of row ---------- */

  const group = (title) => {
    const g = document.createElement('div');
    g.className = 'st-grp';
    g.textContent = title;
    body.appendChild(g);
  };

  /** An editable row saves itself (save-row.js); the re-read after it is this room's, because
   *  a fallback in force is not the same as the value typed and only the record knows which shows. */
  const reread = () => load({ quiet: true });
  /** One schema row's write, through the route the registry names for it. */
  const write = (f) => (value) => {
    const req = toRequest(rec.schema, f, value);
    return request(req.route, { method: req.method, json: req.json });
  };
  /** A question row: the ask() question, and its status line under it. */
  const noteRow = (question, note) => {
    const el = document.createElement('div'); el.className = 'st-row';
    const line = document.createElement('p'); line.className = 'st-note'; line.setAttribute('role', 'status');
    line.textContent = note;
    el.append(question, line);
    return { el, say: (state, message) => { line.textContent = message; line.classList.toggle('bad', state === 'invalid'); } };
  };

  /** A measured row: what the box said, with no control at all. */
  const obsRow = (label, value, note) => {
    const row = document.createElement('div');
    row.className = 'st-row st-obs';
    const l = document.createElement('div');
    l.className = 'st-lab';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'st-val';
    v.textContent = value ?? '—';
    if (note) {
      const n = document.createElement('span');
      n.className = 'st-note';
      n.textContent = note;
      v.appendChild(n);
    }
    row.append(l, v);
    return row;
  };

  const input = (value, opts = {}) => {
    const i = document.createElement('input');
    i.type = opts.type || 'text';
    i.className = 'st-inp' + (opts.cls ? ' ' + opts.cls : '');
    i.value = value ?? '';
    if (opts.placeholder) i.placeholder = opts.placeholder;
    if (opts.max) i.maxLength = opts.max;
    if (opts.min !== undefined) i.min = String(opts.min);
    return i;
  };

  /* ---------- the screen ---------- */

  /**
   * A MODEL ROW IS THE ONE PICKER (form-steps.js). The general default is the free pair;
   * a `models_for:` row fixes its provider and picks the model alone. Every provider and
   * model in the catalog is offered, operational first, and what this box cannot launch
   * is disabled and says so — hiding a row teaches nothing. A provider picked with no
   * model is not an answer yet, so it saves nothing and the row says what it waits for.
   */
  const pickerRow = (f, { fixed }) => {
    const stored = getPath(rec, f.from);
    let picked = fixed
      ? { provider: fixed, model: String(stored ?? '') }
      : { provider: String(stored?.provider || ''), model: String(stored?.model || '') };
    const catalog = providerCatalog().rows;
    const providers = catalog.filter((item, index) => catalog.findIndex((other) => other.provider === item.provider) === index);
    const reason = (item) => item.off
      ? t('forms.reason_turned_off', 'turned off')
      : t('forms.reason_not_on_machine', 'not on this machine');
    const fields = fixed ? [
      { key: 'model', label: f.short ?? f.label, blank: t('settei.none_set', '— none set —'), options: catalog.filter((item) => item.provider === fixed).map((item) => ({ v: item.model, l: modelLabel(item), word: item.tier, sub: item.cost || '', off: item.selectable ? '' : reason(item) })) },
    ] : [
      { key: 'provider', label: t('forms.provider', 'Model provider'), blank: t('settei.none_set', '— none set —'), options: providers.map((item) => ({ v: item.provider, l: item.provider_label, off: item.operational ? '' : reason(item) })) },
      { key: 'model', label: t('forms.model', 'Model'), blank: t('settei.none_set', '— none set —'), after: 'provider', options: (value) => catalog.filter((item) => item.provider === value.provider).map((item) => ({ v: item.model, l: modelLabel(item), word: item.tier, sub: item.cost || '', off: item.selectable ? '' : reason(item) })) },
    ];
    const pair = ask([{ group: fixed ? '' : f.label, fields }], {
      value: picked,
      onChange: (value) => {
        picked = { provider: fixed || value.provider || '', model: value.model || '' };
        const { provider, model } = picked;
        if (!fixed && provider && !model) return row.say('pending', t('settei.pick_model', 'choose a model to save'));
        void commit(fixed ? model : (model ? pm(picked) : ''));
      },
    });
    const row = noteRow(pair.el, f.aside || '');
    const commit = saveRow({ say: row.say, save: write(f), after: reread });
    return row.el;
  };

  /** One registry row in, one saving ⚙ row out — the only place a `kind` is read. */
  const schemaRow = (f) => {
    const picker = pickerProvider(f);
    if (picker) return pickerRow(f, picker);
    const cur = currentOf(f, { record: rec });
    const ctx = { record: rec, deskProfiles };
    if (f.kind === 'select') {
      const baseNote = [f.note ? String(getPath(rec, f.note) ?? '') : '', cur === '' && f.fallback ? t('settei.unset_using', 'unset — using {value}', { value: getPath(rec, f.fallback) ?? '' }) : '', f.aside || ''].filter(Boolean).join(' · ');
      const question = ask([{ group: '', fields: [{ key: f.id, label: f.short ?? f.label, blank: t('settei.none_set', '— none set —'), options: optionsOf(f, ctx).map((o) => ({ v: o.value, l: o.label })) }] }], {
        value: { [f.id]: cur },
        onChange: (value) => void commit(value[f.id]),
      });
      const row = noteRow(question.el, baseNote);
      const commit = saveRow({ say: row.say, save: write(f), after: reread });
      return row.el;
    }
    const control = f.kind === 'number'
      ? input(cur, { type: 'number', cls: 'st-num', min: f.min })
      : input(cur, { max: 120, placeholder: f.fallback ? String(getPath(rec, f.fallback) ?? '') : f.placeholder });
    const notes = [];
    if (f.note) notes.push(String(getPath(rec, f.note) ?? ''));
    // A fallback in force is visible — a default is never passed off as an answer.
    if (cur === '' && f.fallback) notes.push(t('settei.unset_using', 'unset — using {value}', { value: getPath(rec, f.fallback) ?? '' }));
    if (f.aside) notes.push(f.aside);
    const row = document.createElement('div'); row.className = 'st-row';
    const labelled = field(control, { label: f.short ?? f.label, sr: false });
    labelled.el.classList.add('st-field');
    labelled.say(notes.filter(Boolean).join(' · '));
    row.append(labelled.el);
    const commit = saveRow({ say: (state, message) => labelled.say(message, state === 'invalid'), save: write(f), after: reread });
    control.addEventListener('change', () => void commit(control.value));
    return row;
  };

  let card = null; // the Services card of the last render; a new render closes it first
  let account = null; // the Cloud account card of the last render, likewise
  const render = () => {
    body.innerHTML = '';
    const { set, observed, status: st, schema } = rec;
    const m = observed.machine;
    const fieldsIn = (test) => schema.fields.filter(test).map(schemaRow);

    // One section drawn alone, where another surface shows the same rows (Models > Defaults).
    if (only) {
      blurb.textContent = schema.sections.find((s) => s.id === only)?.lede ?? '';
      stamp.textContent = '';
      for (const row of fieldsIn((f) => f.sec === only && f.lands)) body.appendChild(row);
      return;
    }

    blurb.textContent = t('settei.blurb', 'What this install is set to — and what it is running on.');
    stamp.textContent = t('settei.measured', 'measured {time}', { time: new Date(observed.observed_at).toLocaleString() });

    group(t('settei.group_campaign', 'campaign'));
    for (const row of fieldsIn((f) => f.sec === 'campaign' && f.lands)) body.appendChild(row);

    /* you and this machine — the typed rows are the registry's, in its order */
    group(t('settei.group_you', 'you and this machine'));
    for (const row of fieldsIn((f) => (f.sec === 'you' || f.sec === 'machine') && f.lands)) body.appendChild(row);
    // The box's own name leads the row — it must be readable here even when the owner
    // has typed nothing (the setup page's THIS BOX fact, kept visible for good).
    body.appendChild(obsRow(t('settei.hardware', 'hardware'),
      `${m.host} · ${m.kind === 'virtual' ? `${m.provider ?? t('settei.virtual', 'virtual')} ${m.product ?? ''}`.trim() : t('settei.physical', 'physical')} · ${t('settei.cores_ram', '{cores} cores · {ram} GB', { cores: m.cores, ram: m.ram_gb })}`,
      m.hypervisor ? ` ${m.hypervisor}` : ''));
    body.appendChild(obsRow(t('settei.running', 'running'), t('settei.os_node', '{os} · node {node}', { os: observed.os.name, node: observed.runtime.node }),
      ' ' + t('settei.release_contract', '{release} · contract {contract}', { release: `${observed.ronin.release ?? observed.ronin.commit}${observed.ronin.dirty ? ' ' + t('desk.dirty', '(dirty)') : ''}`, contract: observed.ronin.contract })));
    // THE ADDRESS A PERSON SHOULD TYPE. When `tailscale serve` is in front, its HTTPS
    // name leads — it is the same MagicDNS name carrying a real certificate, and it is
    // the only one of these a passkey can exist on. The plain address stays visible as
    // what is behind the proxy; the MagicDNS alias is dropped in that case, because the
    // HTTPS name already IS that name and saying it twice reads as two doors.
    const rt = st.routes[0];
    body.appendChild(obsRow(t('settei.reachable_at', 'Ronin reachable at'), rt?.secure ?? rt?.at,
      rt?.secure
        ? ' ' + t('settei.reach_secure', '{exposure} · HTTPS by tailscale serve · plain {at}', { exposure: rt.exposure, at: rt.at })
        : ` ${rt?.exposure}${rt?.alias ? ' ' + t('settei.reach_alias', '· or {alias} (MagicDNS)', { alias: rt.alias }) : ''}`));
    body.appendChild(obsRow(t('settei.reach_ssh', 'reach by ssh'), st.ssh));

    /* capacity */
    group(t('settei.group_capacity', 'capacity'));
    for (const row of fieldsIn((f) => f.lands?.family === 'session-max')) body.appendChild(row);

    /* projects — shown, never edited here */
    group(t('settei.group_projects', 'projects · {n}', { n: set.projects.length }));
    for (const p of set.projects) {
      const health = st.projects.find((x) => x.name === p.name);
      body.appendChild(obsRow(p.title || p.name, p.remit || p.dir,
        health?.dir === 'missing' ? ' ' + t('settei.dir_gone', '✕ {dir} is gone', { dir: p.dir }) : health?.repo ? ` ${health.repo}` : ''));
    }
    const link = document.createElement('div');
    link.className = 'st-row st-link';
    link.textContent = t('settei.projects_link', 'Edit these in ▣ Workspace folders — this room only shows them.');
    body.appendChild(link);

    /* how work gets a model */
    group(t('settei.group_models', 'how work gets a model'));
    for (const row of fieldsIn((f) => (f.sec === 'models' || f.sec === 'defaults') && f.lands?.family === 'agents')) body.appendChild(row);
    // Jobs the registry already edits above render once, not twice.
    const managed = new Set(
      schema.fields.map((f) => f.lands?.key).filter((k) => k?.startsWith('jobs.')).map((k) => k.split('.')[1]),
    );
    for (const [name, job] of Object.entries(set.agents.jobs ?? {})) {
      if (managed.has(name)) continue;
      // A job's pointing is edited in its own room (目 Koshi); here it is the resolved
      // answer plus whether the key it names is actually present — which is the part
      // no other surface says out loud.
      body.appendChild(obsRow(name.replace(/_/g, ' '), `${job.provider ?? job.outlet}${job.model ? ` · ${job.model}` : ''}`,
        st.agents[name] ? ` ${st.agents[name]}` : ''));
    }

    // THE KEYS, BY NAME ONLY. Presence is scanned per read (names come from the
    // registry plus every key_env a job points at); the value lives in .env and never
    // enters the record in either direction — there is nothing here to leak.
    for (const [name, isSet] of Object.entries(observed.keys)) {
      body.appendChild(obsRow(name, isSet ? t('settei.key_set', '✓ set') : t('settei.key_not_set', 'not set'), ' ' + t('settei.key_presence', 'presence only — the value stays in .env')));
    }

    // Open-source weights actually ON the box — named and sized, never assumed.
    for (const w of observed.weights ?? []) {
      body.appendChild(obsRow(w.name, t('settei.weights_downloaded', '✓ downloaded'), ' ' + t('settei.weights_size', '{mb} MB · koshi_weights store', { mb: w.mb })));
    }
    if (!(observed.weights ?? []).length) body.appendChild(obsRow(t('settei.local_weights', 'local weights'), t('settei.weights_none', 'none downloaded')));

    group(t('settei.group_agents', 'agent installations'));
    const hint = document.createElement('div');
    hint.className = 'st-row st-link';
    hint.textContent = t('settei.agents_hint', 'a tick means it is on the box — tick an empty one to put it on the needed list');
    body.appendChild(hint);
    const wantedNow = () => (set.wanted ?? []);
    const instTick = (installed, kind, name) => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'st-check';
      if (installed) {
        box.checked = true;
        box.disabled = true; // a fact, not a control — reality unticks it, not you
        box.title = t('settei.installed', 'installed');
        return box;
      }
      box.title = t('settei.not_installed_tick', 'not installed — tick to put it on the needed list');
      box.checked = wantedNow().some((w) => w.kind === kind && w.name === name);
      box.addEventListener('change', async () => {
        const next = wantedNow().filter((w) => !(w.kind === kind && w.name === name));
        if (box.checked) next.push({ kind, name });
        await request('/api/machine-settings', { method: 'PATCH', json: { family: 'wanted', value: { wanted: next } } });
        await load({ quiet: true });
      });
      return box;
    };
    const tickRow = (installed, kind, name, label, where) => {
      const row = document.createElement('div');
      row.className = 'st-row st-agent';
      const req = document.createElement('div');
      req.className = 'st-req';
      req.appendChild(instTick(installed, kind, name));
      const nm = document.createElement('div');
      nm.className = 'st-lab';
      nm.textContent = label;
      const val = document.createElement('div');
      val.className = 'st-val';
      val.textContent = where ?? '';
      row.append(req, nm, val);
      return row;
    };
    for (const [id, a] of Object.entries(observed.agents)) {
      body.appendChild(tickRow(a.installed, 'agent', id, a.label ?? id, a.installed ? a.path ?? '' : a.from ?? ''));
    }

    group(t('settei.group_services', 'services'));
    body.appendChild(tickRow(observed.ronin.services.length > 0, 'service', '*', t('settei.ronin_services', 'Ronin Services'), ''));
    body.appendChild(tickRow(observed.ronin.services.includes('gbrain'), 'service', 'gbrain', 'gbrain', ''));
    /* the deal — Ronin Services the subscription, a different thing from the sockets above */
    group(t('settei.group_subscription', 'subscription'));
    const activation = set.services.activation ?? {};
    // The activation stage, labelled as what it is: activation is identity transport to
    // Ronin HQ, not a subscription. The subscription itself is the Cloud account card's.
    body.appendChild(obsRow(t('settei.services_activation', 'Services activation'), st.subscription,
      activation.email_masked ? ` ${activation.email_masked}` : ''));
    // The install's steps arrive by push. The card renders the durable stage rather than
    // what this page remembers doing, so a reload or a second tab lands on the truth.
    card?.stop();
    card = servicesCard(body);
    // Read-only, from the Services `account` part; hidden only when that part is absent.
    account?.stop();
    account = accountCard(body);

    group(t('settei.group_needed', 'still needed'));
    for (const n of rec.needed ?? []) {
      body.appendChild(obsRow(n.leaf, n.needs, ` ${n.how}`));
    }
    if (!(rec.needed ?? []).length) body.appendChild(obsRow(t('settei.needed_nothing', 'nothing'), t('settei.needed_satisfied', 'your choices are satisfied')));

    /* the reading list's offer — an agent exists and the list is non-empty. One
     * press, per the flow's death condition: the seat reads the door itself at
     * start, so this hands over a pointer and nothing else. */
    if (st.agents.usable.length && (rec.needed ?? []).length) {
      const row = document.createElement('div');
      row.className = 'st-row';
      const go = button(t('settei.setup_go', 'start your setup session'), {
        cls: 'st-go',
        onClick: async () => {
          go.disabled = true;
          const r = await request('/api/launch', {
            method: 'POST',
            json: {
              behaviours: schema.seat.behaviours,
              name: schema.seat.name,
              prompt: schema.seat.prompt,
              seed: ['ronin_catalogs/behaviours/conditional/atarashi.md'],
            },
          });
          go.disabled = false;
          go.textContent = r.ok ? t('settei.setup_started', 'setup session started — see ⌂ Roster') : r.message || t('settei.setup_failed', 'could not start');
        },
      });
      row.appendChild(go);
      body.appendChild(row);
    }
  };

  const load = async ({ quiet } = {}) => {
    if (!quiet) {
      blurb.textContent = t('settei.reading', 'reading…');
      stamp.textContent = '';
    }
    // Two reads, not one: the record is this install, and the provider catalog is what
    // Ronin offers. Keeping them apart is what lets a model row offer a provider this box
    // has not installed yet and say so, instead of pretending the catalog is the box.
    const [r, , dp] = await Promise.all([request('/api/machine-settings'), loadProviderCatalog(), request('/api/desk-profiles')]);
    deskProfiles = dp.ok && Array.isArray(dp.data?.profiles) ? dp.data.profiles : [];
    if (!r.ok) {
      blurb.textContent = r.message;
      blurb.classList.add('bad');
      return;
    }
    blurb.classList.remove('bad');
    rec = r.data;
    render();
  };

  // Read when the room is opened, not on a timer. The measured half is a snapshot and
  // says when it was taken; re-opening the tab is how you refresh it.
  return { enter: () => void load(), isShowing };
}
