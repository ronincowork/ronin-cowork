/**
 * THE SERVICES CARD — the activation flow as a person sees it.
 *
 * One card, six states, and the state comes from the operator rather than from what this
 * page remembers doing. A reload, a second tab, or an operator restart all land on the
 * truth, because the durable stage lives on disk and this only renders it.
 *
 * NO SECRET REACHES THIS FILE. The claim secret and the entitlement token stay with the
 * operator; the browser sees a masked address, a stage, and an entitlement id — which
 * identifies and cannot authorize.
 */
import { request } from './request.js';
import { button, field, status } from './ui.js';

/** How the six durable stages read to a person, in their words rather than ours. */
const SAY = {
  not_requested: ['Not requested', 'Ronin Services are not switched on for this machine.'],
  requesting: ['Sending…', 'Asking Ronin to send your confirmation email.'],
  awaiting_email: ['Check your email', 'Open the link we sent. Any device is fine — your phone works.'],
  verified: ['Email confirmed', 'Ronin has what it needs. Services install next.'],
  installing: ['Installing Services', 'This machine is fetching and verifying the download.'],
  installed: ['Services are ready', 'Nothing further to do.'],
  expired: ['This link expired', 'Ask for a fresh confirmation email below.'],
  cancelled: ['Request cancelled', 'Nothing was switched on, and the address was not kept.'],
  address_changed: ['Address changed', 'A new confirmation email is on its way.'],
  error: ['Waiting to send', 'Ronin HQ could not be reached. This will retry.'],
};

/** Stages worth watching: something is expected to change without the person acting. */
const WATCH = ['requesting', 'awaiting_email', 'verified', 'installing'];

export function servicesCard(container, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'st-services';
  container.appendChild(wrap);

  const line = status('st-status');
  let timer = null;
  let backoff = 2000;

  const stop = () => { if (timer) clearTimeout(timer); timer = null; };

  /**
   * VISIBLE POLLING. It says it is checking, and it says when it will check again, because
   * a spinner that never resolves and a page that has quietly given up look identical.
   *
   * It backs off rather than hammering, and it stops the moment the stage is settled — the
   * plan is explicit that this must not become an immortal daemon.
   */
  async function poll(state) {
    stop();
    if (!WATCH.includes(state.stage)) { backoff = 2000; return; }
    timer = setTimeout(async () => {
      line.say('checking…', 'busy');
      const r = await request('/api/services/activation/poll', { method: 'POST' });
      backoff = Math.min(backoff * 1.6, 30000);
      render(r.ok ? r.json : null);
    }, backoff);
  }

  function render(state) {
    if (!state) { line.say('could not reach the operator', 'bad'); return; }
    wrap.replaceChildren();

    const [title, blurb] = SAY[state.stage] ?? SAY.not_requested;

    const head = document.createElement('div');
    head.className = 'st-row st-obs';
    const l = document.createElement('div');
    l.className = 'st-lab';
    l.textContent = 'Ronin Services';
    const v = document.createElement('div');
    v.className = 'st-val';
    v.textContent = title;
    if (state.email_masked) {
      const n = document.createElement('span');
      n.className = 'st-note';
      // The masked address, never the full one — this page has never been told it.
      n.textContent = ' ' + state.email_masked;
      v.appendChild(n);
    }
    head.append(l, v);
    wrap.appendChild(head);

    const say = document.createElement('div');
    say.className = 'st-row st-obs';
    say.textContent = state.error_message || blurb;
    wrap.appendChild(say);

    if (state.entitlement_id) {
      // An identifier, so it is safe to show. HQ refuses it as a credential.
      wrap.appendChild(obs('entitlement', state.entitlement_id));
    }

    const actions = document.createElement('div');
    actions.className = 'st-row';

    if (state.stage === 'not_requested' || state.stage === 'cancelled' || state.stage === 'expired') {
      const email = document.createElement('input');
      email.type = 'email';
      email.className = 'st-inp';
      email.placeholder = 'you@example.com';
      const f = field(email, { label: 'Your email address', sr: false });
      f.el.classList.add('st-field');
      f.say('Ronin sends one confirmation email. Free Cowork sends nothing.');
      wrap.appendChild(f.el);

      // The action names what it DOES. "Save" would hide an immediate, disclosed account
      // action behind a word that means "write this down".
      actions.appendChild(button('Send confirmation email', {
        onClick: () => act(f, '/api/services/activation', { email: email.value.trim() }),
      }).el ?? button('Send confirmation email', {
        onClick: () => act(f, '/api/services/activation', { email: email.value.trim() }),
      }));
    }

    if (state.stage === 'awaiting_email' || state.stage === 'error') {
      const resend = button('Resend', {
        onClick: () => act(line, '/api/services/activation/resend', null),
      });
      const change = button('Change address', { onClick: () => changeAddress() });
      const cancel = button('Cancel request', {
        onClick: () => act(line, '/api/services/activation', null, 'DELETE'),
      });
      actions.append(nodeOf(resend), nodeOf(change), nodeOf(cancel));
      if (state.resend_available_at) {
        const when = new Date(state.resend_available_at);
        if (when > new Date()) {
          // The server owns the cooldown; the page reports it rather than guessing.
          const n = document.createElement('span');
          n.className = 'st-note';
          n.textContent = ` you can resend after ${when.toLocaleTimeString()}`;
          actions.appendChild(n);
        }
      }
    }

    if (state.stage === 'verified' || state.stage === 'error') {
      // Recovery only. Installation normally starts by itself the moment an entitlement
      // arrives; this is for the case where it failed and somebody wants to try again
      // without another email.
      actions.appendChild(nodeOf(button('Install Services now', {
        onClick: () => act(line, '/api/services/install', {}),
      })));
    }

    if (actions.childNodes.length) wrap.appendChild(actions);
    wrap.appendChild(line.el);

    if (state.egress?.length) wrap.appendChild(egressBox(state.egress));

    onChange?.(state);
    void poll(state);
  }

  function nodeOf(b) { return b.el ?? b; }

  function obs(label, value) {
    const row = document.createElement('div');
    row.className = 'st-row st-obs';
    const l = document.createElement('div');
    l.className = 'st-lab';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'st-val';
    v.textContent = value;
    row.append(l, v);
    return row;
  }

  /** What has left this machine, so the owner can see it without asking us. */
  function egressBox(lines) {
    const d = document.createElement('details');
    d.className = 'st-egress';
    const s = document.createElement('summary');
    s.textContent = `what this machine has sent (${lines.length})`;
    d.appendChild(s);
    for (const e of lines.slice(0, 10)) {
      const row = document.createElement('div');
      row.className = 'st-row st-obs';
      row.textContent = `${e.at} ${e.method} ${e.host}${e.path} → ${e.status || e.outcome} (${e.ms}ms)`;
      d.appendChild(row);
    }
    return d;
  }

  async function act(where, route, json, method) {
    where.say('working…', 'busy');
    const r = await request(route, { method: method || 'POST', ...(json ? { json } : {}) });
    if (!r.ok) { where.say(r.message || 'that did not work', 'bad'); return; }
    await load();
  }

  async function changeAddress() {
    const next = window.prompt('New email address for Ronin Services');
    if (!next) return;
    await act(line, '/api/services/activation/address', { email: next.trim() });
  }

  async function load() {
    const r = await request('/api/services/activation');
    render(r.ok ? r.json : null);
  }

  void load();
  return { reload: load, stop };
}
