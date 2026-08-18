/* part of the tmux-ronin client — see js/README.md */
import { request } from './request.js';
import { button, field, status } from './ui.js';
import { pm, getPath, currentOf, optionsOf, toRequest } from './settei-schema.js';

/* ---------- ⚙ SETUP — what this install IS, in one room ----------
 *
 * One fetch (`GET /api/settei`) and one screen. The record it draws has three sections
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
 * THE TYPED ROWS RENDER FROM THE RECORD'S OWN `schema` (the registry, src/settei.ts),
 * through the vocabulary in js/settei-schema.js — a leaf asked anywhere is editable
 * here structurally, and this file knows no field. The found and derived rows stay
 * composed by hand on purpose: "pointed at openai — OPENAI_API_KEY not set" is worth
 * more than a generic renderer could say. Layout — which schema section lands in
 * which group — is this room's own furniture.
 */
export function buildSettei(root, isShowing) {
  let rec = null;
  let specs = [];

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

  /** An editable row: label, control, and the field's own status line. */
  const setRow = (label, control, hint, save) => {
    const row = document.createElement('div');
    row.className = 'st-row';
    const f = field(control, { label, sr: false });
    f.el.classList.add('st-field');
    if (hint) f.say(hint);
    const commit = async () => {
      f.say('saving…');
      const r = await save(control.value);
      if (!r.ok) return f.say(r.message, true);
      f.say('saved');
      // The record is the authority on what a save produced — a fallback in force is
      // not the same as the value typed, and only a re-read knows which is showing.
      await load({ quiet: true });
    };
    control.addEventListener('change', () => void commit());
    row.appendChild(f.el);
    return row;
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

  /** One registry row in, one saving ⚙ row out — the only place a `kind` is read. */
  const schemaRow = (f) => {
    const cur = currentOf(f, { record: rec });
    const ctx = { record: rec, modelOpts: allModelOpts() };
    let control;
    if (f.kind === 'select') {
      control = document.createElement('select');
      control.className = 'st-inp';
      control.add(new Option('— none set —', ''));
      for (const o of optionsOf(f, ctx)) control.add(new Option(o.label, o.value));
      control.value = cur;
    } else if (f.kind === 'number') {
      control = input(cur, { type: 'number', cls: 'st-num', min: f.min });
    } else {
      control = input(cur, { max: 120, placeholder: f.fallback ? String(getPath(rec, f.fallback) ?? '') : f.placeholder });
    }
    const notes = [];
    if (f.note) notes.push(String(getPath(rec, f.note) ?? ''));
    // A fallback in force is visible — a default is never passed off as an answer.
    if (cur === '' && f.fallback) notes.push(`unset — using ${getPath(rec, f.fallback) ?? ''}`);
    if (f.aside) notes.push(f.aside);
    return setRow(f.short ?? f.label, control, notes.filter(Boolean).join(' · '), (v) => {
      const req = toRequest(rec.schema, f, v);
      return request(req.route, { method: req.method, json: req.json });
    });
  };

  /** EVERY PROVIDER AND MODEL THE TABLE KNOWS, in table order, and no vendor is named
   * in this file. The list comes from ronin_catalogs/PROJECT_ROOTS.md through
   * /api/session-launch-specs. An uninstalled agent still appears, because the table
   * is what the house supports and hiding a row teaches nothing — but it says so,
   * rather than being offered as though it would work. */
  const allModelOpts = () =>
    specs.map((sp) => {
      const have = rec.observed.agents[sp.cmd.split(' ')[0]]?.installed;
      return { label: `${sp.provider} · ${sp.model}${have ? '' : ' — not installed'}`, value: pm(sp) };
    });

  const render = () => {
    body.innerHTML = '';
    const { set, observed, status: st, schema } = rec;
    const m = observed.machine;
    const fieldsIn = (test) => schema.fields.filter(test).map(schemaRow);

    blurb.textContent = 'What this install is set to — and what it is running on.';
    stamp.textContent = `measured ${new Date(observed.observed_at).toLocaleString()}`;

    /* you and this machine — the typed rows are the registry's, in its order */
    group('you and this machine');
    for (const row of fieldsIn((f) => (f.sec === 'you' || f.sec === 'machine') && f.lands)) body.appendChild(row);
    // The box's own name leads the row — it must be readable here even when the owner
    // has typed nothing (the setup page's THIS BOX fact, kept visible for good).
    body.appendChild(obsRow('hardware',
      `${m.host} · ${m.kind === 'virtual' ? `${m.provider ?? 'virtual'} ${m.product ?? ''}`.trim() : 'physical'} · ${m.cores} cores · ${m.ram_gb} GB`,
      m.hypervisor ? ` ${m.hypervisor}` : ''));
    body.appendChild(obsRow('running', `${observed.os.name} · node ${observed.runtime.node}`,
      ` ${observed.ronin.release ?? observed.ronin.commit}${observed.ronin.dirty ? ' (dirty)' : ''} · contract ${observed.ronin.contract}`));
    body.appendChild(obsRow('Ronin reachable at', st.routes[0]?.at,
      ` ${st.routes[0]?.exposure}${st.routes[0]?.alias ? ` · or ${st.routes[0].alias} (MagicDNS)` : ''}`));
    body.appendChild(obsRow('reach by ssh', st.ssh));

    /* capacity */
    group('capacity');
    for (const row of fieldsIn((f) => f.lands?.family === 'session-max')) body.appendChild(row);

    /* projects — shown, never edited here */
    group(`projects · ${set.projects.length}`);
    for (const p of set.projects) {
      const health = st.projects.find((x) => x.name === p.name);
      body.appendChild(obsRow(p.name, p.remit || p.dir,
        health?.dir === 'missing' ? ` ✕ ${p.dir} is gone` : health?.repo ? ` ${health.repo}` : ''));
    }
    const link = document.createElement('div');
    link.className = 'st-row st-link';
    link.textContent = 'Edit these in ▣ Project root — this room only shows them.';
    body.appendChild(link);

    /* how work gets a model */
    group('how work gets a model');
    for (const row of fieldsIn((f) => f.sec === 'defaults' && f.lands?.family === 'agents')) body.appendChild(row);
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
      body.appendChild(obsRow(name, isSet ? '✓ set' : 'not set', ' presence only — the value stays in .env'));
    }

    // Open-source weights actually ON the box — named and sized, never assumed.
    for (const w of observed.weights ?? []) {
      body.appendChild(obsRow(w.name, '✓ downloaded', ` ${w.mb} MB · koshi_weights store`));
    }
    if (!(observed.weights ?? []).length) body.appendChild(obsRow('local weights', 'none downloaded'));

    /* agent installations — a three-column grid with the REQUEST column LEADING
     * (owner, 2026-08-18): tick = put it on the needed list, ✓ = already on the box.
     * One meaning per column, taught ONCE on the hint line — never per row, which
     * read as a sentence trailing off to a floating control. */
    group('agent installations');
    const hint = document.createElement('div');
    hint.className = 'st-row st-link';
    hint.textContent = 'tick the first column to put one on the needed list';
    body.appendChild(hint);
    const wantedNow = () => (set.wanted ?? []);
    const wantTick = (kind, name) => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'st-check';
      box.title = 'put it on the needed list';
      box.checked = wantedNow().some((w) => w.kind === kind && w.name === name);
      box.addEventListener('change', async () => {
        const next = wantedNow().filter((w) => !(w.kind === kind && w.name === name));
        if (box.checked) next.push({ kind, name });
        await request('/api/settei/wanted', { method: 'PUT', json: { wanted: next } });
        await load({ quiet: true });
      });
      return box;
    };
    for (const [id, a] of Object.entries(observed.agents)) {
      const row = document.createElement('div');
      row.className = 'st-row st-agent';
      const req = document.createElement('div');
      req.className = 'st-req';
      if (a.installed) req.textContent = '✓';
      else req.appendChild(wantTick('agent', id));
      const name = document.createElement('div');
      name.className = 'st-lab';
      name.textContent = a.label ?? id;
      const state = document.createElement('div');
      state.className = 'st-val';
      state.textContent = a.installed
        ? `installed${a.path ? ` · ${a.path}` : ''}`
        : `not installed · ${a.from ?? ''}`;
      row.append(req, name, state);
      body.appendChild(row);
    }

    /* services — Ronin Services is a BUNDLE (owner, 2026-08-18): installed or not,
       one row, no roster recital. The per-socket detail stays in the record for any
       reader that needs it; this room answers the owner's actual question. */
    group('services');
    body.appendChild(obsRow('Ronin Services', observed.ronin.services.length ? '✓ installed' : 'not installed'));
    const gb = document.createElement('input');
    gb.type = 'checkbox';
    gb.className = 'st-check';
    gb.checked = set.gbrain.enabled;
    const gbField = field(gb, { label: 'use gbrain', sr: false });
    gbField.el.classList.add('st-field');
    // TWO FACTS, SAID APART: whether gbrain is installed is measured; the tick is the
    // owner's own setting — an installed service can be deliberately off, and an
    // unlabelled empty box reads as "not installed", which is a different claim.
    gbField.say(observed.ronin.services.includes('gbrain')
      ? 'installed on this box — the tick is whether your agents use it'
      : 'not installed — the setting waits here for when it is');
    gb.addEventListener('change', async () => {
      gbField.say('saving…');
      const r = await request('/api/settei/gbrain', { method: 'PUT', json: { enabled: gb.checked } });
      gbField.say(r.ok ? 'saved' : r.message, !r.ok);
    });
    const gbRow = document.createElement('div');
    gbRow.className = 'st-row';
    gbRow.appendChild(gbField.el);
    body.appendChild(gbRow);

    /* the deal — Ronin Services the subscription, a different thing from the sockets above */
    group('subscription');
    body.appendChild(obsRow('subscription', st.subscription,
      set.services.email ? ` ${set.services.email}` : ''));
    body.appendChild(
      // THE PASTED CODE (owner's ruling). The verification email carries the id; this is
      // where it lands. It records and does not verify — the id gates nothing on this
      // box, so a wrong one costs a wrong line in a record rather than access to
      // anything, and the collector treats it as a claim to match rather than proof.
      setRow('entitlement code', input(set.services.entitlement, { max: 200, placeholder: 'paste the code from your email' }),
        'from the services email — recorded here, checked by us',
        (v) => request('/api/settei/services', { method: 'PUT', json: { entitlement: v, email: set.services.email } })),
    );

    /* THE NEEDED BOX (owner, 2026-08-18) — every unmet thing in one place: the
     * registry's requires and the owner's own wants, computed per read. Satisfy one
     * and it vanishes on the next look with no write anywhere. This is exactly the
     * list the setup seat reads at its own start. */
    group('still needed');
    for (const n of rec.needed ?? []) {
      body.appendChild(obsRow(n.leaf, n.needs, ` ${n.how}`));
    }
    if (!(rec.needed ?? []).length) body.appendChild(obsRow('nothing', 'your choices are satisfied'));

    /* the reading list's offer — an agent exists and the list is non-empty. One
     * press, per the flow's death condition: the seat reads the door itself at
     * start, so this hands over a pointer and nothing else. */
    if (st.agents.usable.length && (rec.needed ?? []).length) {
      const row = document.createElement('div');
      row.className = 'st-row';
      const go = button('start your setup session', {
        cls: 'st-inp',
        onClick: async () => {
          go.disabled = true;
          const r = await request('/api/launch', {
            method: 'POST',
            json: { session_job: schema.seat.job, name: schema.seat.name, prompt: schema.seat.prompt },
          });
          go.disabled = false;
          go.textContent = r.ok ? 'setup session started — see ⌂ Roster' : r.message || 'could not start';
        },
      });
      row.appendChild(go);
      body.appendChild(row);
    }
  };

  const load = async ({ quiet } = {}) => {
    if (!quiet) {
      blurb.textContent = 'reading…';
      stamp.textContent = '';
    }
    // Two calls, not one: the record is this install, and the launch table is what the
    // house supports. Keeping them apart is what lets the dropdown offer a provider this
    // box has not installed yet and say so, instead of pretending the table is the box.
    const [r, sp] = await Promise.all([request('/api/settei'), request('/api/session-launch-specs')]);
    specs = sp.ok && Array.isArray(sp.data) ? sp.data : [];
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
