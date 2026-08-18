/* part of the tmux-ronin client — see js/README.md */
import { request } from './request.js';
import { field, status } from './ui.js';

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

  const render = () => {
    body.innerHTML = '';
    const { set, observed, status: st } = rec;
    const m = observed.machine;

    blurb.textContent = 'What this install is set to — and what it is running on.';
    stamp.textContent = `measured ${new Date(observed.observed_at).toLocaleString()}`;

    /* you and this machine */
    group('you and this machine');
    body.appendChild(
      setRow('your name', input(set.owner.name, { max: 64, placeholder: st.owner_name }),
        set.owner.name ? '' : `unset — using ${st.owner_name}`,
        (v) => request('/api/settei/owner', { method: 'PUT', json: { name: v } })),
    );
    body.appendChild(
      setRow('this machine', input(set.machine.name, { max: 64, placeholder: m.host }),
        set.machine.name ? '' : `unset — using ${m.host}`,
        (v) => request('/api/settei/machine', { method: 'PUT', json: { name: v } })),
    );
    body.appendChild(
      setRow('where it is', input(set.machine.where, { max: 120, placeholder: 'Hetzner fsn1 · under my desk' }),
        // Free text by ruling: the owner knows where the box is and the box does not.
        // Detecting it would mean a cloud metadata call from a page load.
        'in your own words — nothing detects this',
        (v) => request('/api/settei/machine', { method: 'PUT', json: { where: v } })),
    );
    body.appendChild(obsRow('hardware',
      `${m.kind === 'virtual' ? `${m.provider ?? 'virtual'} ${m.product ?? ''}`.trim() : 'physical'} · ${m.cores} cores · ${m.ram_gb} GB`,
      m.hypervisor ? ` ${m.hypervisor}` : ''));
    body.appendChild(obsRow('running', `${observed.os.name} · node ${observed.runtime.node}`,
      ` ${observed.ronin.release ?? observed.ronin.commit}${observed.ronin.dirty ? ' (dirty)' : ''} · contract ${observed.ronin.contract}`));
    body.appendChild(obsRow('reachable at', st.routes[0]?.at, ` ${st.routes[0]?.exposure}`));

    /* capacity */
    group('capacity');
    body.appendChild(
      setRow('session max', input(set.sessions.max, { type: 'number', cls: 'st-num', min: 0 }),
        `${st.sessions.state}${set.sessions.max ? '' : ' · 0 = no limit'} · also on ⌂ Roster, same setting`,
        (v) => request('/api/session-max', { method: 'PUT', json: { max: Number(v) } })),
    );

    /* projects — shown, never edited here */
    group(`projects · ${set.projects.length}`);
    for (const p of set.projects) {
      const health = st.projects.find((x) => x.name === p.name);
      body.appendChild(obsRow(p.name, p.remit || p.dir,
        health?.dir === 'missing' ? ` ✕ ${p.dir} is gone` : ` ${health?.brain ?? ''}`));
    }
    const link = document.createElement('div');
    link.className = 'st-row st-link';
    link.textContent = 'Edit these in ▣ Project root — this room only shows them.';
    body.appendChild(link);

    /* how work gets a model */
    group('how work gets a model');
    const dflt = set.agents.sessions?.default ?? {};
    // EVERY PROVIDER AND MODEL THE TABLE KNOWS, in table order, and no vendor is named
    // in this file. The list comes from ronin_catalogs/PROJECT_ROOTS.md through
    // /api/session-launch-specs — a provider is a row there and a model is a column, so
    // adding either is a table edit and never a code change. An earlier version of this
    // row was a free-text box with 'anthropic' and 'opus' as its placeholder, which read
    // as both stuck and partisan; it was neither intended nor defensible.
    const pick = document.createElement('select');
    pick.className = 'st-inp';
    pick.add(new Option('— none set —', ''));
    for (const s of specs) {
      // Say what the box can actually run. An uninstalled agent still appears, because
      // the table is what the house supports and hiding a row teaches nothing — but it
      // says so, rather than being offered as though it would work.
      const have = observed.agents[s.cmd.split(' ')[0]]?.installed;
      pick.add(new Option(`${s.provider} · ${s.model}${have ? '' : ' — not installed'}`, `${s.provider} ${s.model}`));
    }
    pick.value = dflt.provider && dflt.model ? `${dflt.provider} ${dflt.model}` : '';
    body.appendChild(
      setRow('new sessions use', pick, st.agents.new_session, (v) => {
        const [provider, model] = v ? v.split(' ') : [null, null];
        return request('/api/settei/agents', { method: 'PUT', json: { sessions: { default: { provider, model } } } });
      }),
    );
    for (const [name, job] of Object.entries(set.agents.jobs ?? {})) {
      // A job's pointing is edited in its own room (目 Koshi); here it is the resolved
      // answer plus whether the key it names is actually present — which is the part
      // no other surface says out loud.
      body.appendChild(obsRow(name.replace(/_/g, ' '), `${job.provider ?? job.outlet}${job.model ? ` · ${job.model}` : ''}`,
        st.agents[name] ? ` ${st.agents[name]}` : ''));
    }
    body.appendChild(obsRow('agents on this box',
      st.agents.usable.length ? st.agents.usable.join(' · ') : 'none found',
      ` ${Object.entries(observed.agents).filter(([, a]) => !a.installed).map(([n]) => n).join(', ')} — install to use`));

    /* services */
    group(`services · ${observed.ronin.services.length} registered`);
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
    const gb = document.createElement('input');
    gb.type = 'checkbox';
    gb.className = 'st-check';
    gb.checked = set.gbrain.enabled;
    const gbField = field(gb, { label: 'gbrain', sr: false });
    gbField.el.classList.add('st-field');
    gbField.say(observed.ronin.services.includes('gbrain') ? 'registered on this box' : 'not installed');
    gb.addEventListener('change', async () => {
      gbField.say('saving…');
      const r = await request('/api/settei/gbrain', { method: 'PUT', json: { enabled: gb.checked } });
      gbField.say(r.ok ? 'saved' : r.message, !r.ok);
    });
    const gbRow = document.createElement('div');
    gbRow.className = 'st-row';
    gbRow.appendChild(gbField.el);
    body.appendChild(gbRow);
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
