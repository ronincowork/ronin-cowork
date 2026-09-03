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
import { t } from './lexicon.js';

/** How the six durable stages read to a person, in their words rather than ours.
 *  A function, not a table: the lexicon loads after this module is evaluated. */
function stageWords() {
  return {
    not_requested: [t('services.stage_not_requested', 'Not requested'), t('services.stage_not_requested_blurb', 'Ronin Services are not switched on for this machine.')],
    requesting: [t('services.stage_requesting', 'Sending…'), t('services.stage_requesting_blurb', 'Asking Ronin to send your confirmation email.')],
    awaiting_email: [t('services.stage_awaiting_email', 'Check your email'), t('services.stage_awaiting_email_blurb', 'Open the link we sent. Any device is fine — your phone works.')],
    verified: [t('services.stage_verified', 'Email confirmed'), t('services.stage_verified_blurb', 'Ronin has what it needs. Services install next.')],
    installing: [t('services.stage_installing', 'Installing Services'), t('services.stage_installing_blurb', 'This machine is fetching and verifying the download.')],
    installed: [t('services.stage_installed', 'Services are ready'), t('services.stage_installed_blurb', 'Nothing further to do.')],
    expired: [t('services.stage_expired', 'This link expired'), t('services.stage_expired_blurb', 'Ask for a fresh confirmation email below.')],
    cancelled: [t('services.stage_cancelled', 'Request cancelled'), t('services.stage_cancelled_blurb', 'Nothing was switched on, and the address was not kept.')],
    address_changed: [t('services.stage_address_changed', 'Address changed'), t('services.stage_address_changed_blurb', 'A new confirmation email is on its way.')],
    error: [t('services.stage_error', 'Waiting to send'), t('services.stage_error_blurb', 'Ronin HQ could not be reached. This will retry.')],
  };
}

export function servicesCard(container, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'st-services';
  container.appendChild(wrap);

  const line = status('st-status');
  let installTimer = null;
  function render(state) {
    if (!state) {
      // SAY IT WHERE IT CAN BE SEEN. `line.el` is only mounted on the success path
      // an unreachable operator looked exactly like a card with nothing to show.
      line.say(t('services.unreachable', 'could not reach the operator'), 'bad');
      wrap.replaceChildren(line.el);
      return;
    }
    if (installTimer) clearTimeout(installTimer);
    wrap.replaceChildren();

    const SAY = stageWords();
    const [title, blurb] = SAY[state.stage] ?? SAY.not_requested;

    const head = document.createElement('div');
    head.className = 'st-row st-obs';
    const l = document.createElement('div');
    l.className = 'st-lab';
    l.textContent = t('settei.ronin_services', 'Ronin Services');
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
      wrap.appendChild(obs(t('services.entitlement', 'entitlement'), state.entitlement_id));
    }

    const actions = document.createElement('div');
    actions.className = 'st-row';

    if (state.stage === 'not_requested' || state.stage === 'cancelled' || state.stage === 'expired') {
      const email = document.createElement('input');
      email.type = 'email';
      email.className = 'st-inp';
      email.placeholder = 'you@example.com';
      const f = field(email, { label: t('services.email', 'Your email address'), sr: false });
      f.el.classList.add('st-field');
      // The same disclosure as first run, because a person may meet Services for the first
      // time here rather than there. docs/services-activation.md lists what this must say;
      // about the product rather than a description of it.
      f.say(t('services.disclosure', 'Ronin receives this address, the accepted terms version, and a request from '
        + 'this install — enough to verify you and manage Services access. Services then '
        + 'sends the weekly operating statistics described in the terms: counts, never code '
        + 'and never what was typed. Free Cowork sends none of this merely because it is '
        + 'installed. A pending request can be cancelled, and Services can be uninstalled later.'));
      wrap.appendChild(f.el);

      // The action names what it DOES. "Save" would hide an immediate, disclosed account
      // action behind a word that means "write this down".
      actions.appendChild(nodeOf(button(t('services.send_confirmation', 'Send confirmation email'), {
        onClick: () => act(f, '/api/services/activation', { email: email.value.trim() }),
      })));
    }

    if (state.stage === 'awaiting_email'
        || (state.stage === 'error' && state.error_at_stage === 'awaiting_email')) {
      actions.appendChild(nodeOf(button(t('services.check_status', 'Check status'), {
        cls: 'services-check',
        onClick: () => act(line, '/api/services/activation/poll', null),
      })));
      const resend = button(t('services.resend', 'Resend'), {
        onClick: () => act(line, '/api/services/activation/resend', null),
      });
      const change = button(t('services.change_address', 'Change address'), { onClick: () => changeAddress() });
      const cancel = button(t('services.cancel_request', 'Cancel request'), {
        onClick: () => act(line, '/api/services/activation', null, 'DELETE'),
      });
      actions.append(nodeOf(resend), nodeOf(change), nodeOf(cancel));
      if (state.resend_available_at) {
        const when = new Date(state.resend_available_at);
        if (when > new Date()) {
          resend.disabled = true;
          // The server owns the cooldown; the page reports it rather than guessing.
          const n = document.createElement('span');
          n.className = 'st-note';
          n.textContent = ' ' + t('services.resend_after', 'you can resend after {time}', { time: when.toLocaleTimeString() });
          actions.appendChild(n);
        }
      }
    }

    if (state.stage === 'error' && state.error_at_stage === 'requesting') {
      actions.append(nodeOf(button(t('services.change_and_retry', 'Change address and try again'), {
        onClick: () => changeAddress(),
      })), nodeOf(button(t('services.cancel_request', 'Cancel request'), {
        onClick: () => act(line, '/api/services/activation', null, 'DELETE'),
      })));
    }

    if (state.stage === 'verified' || (state.stage === 'error' && state.entitled)) {
      // Recovery only. Installation normally starts by itself the moment an entitlement
      // arrives; this is for the case where it failed and somebody wants to try again
      // without another email.
      actions.appendChild(nodeOf(button(t('services.install_now', 'Install Services now'), {
        onClick: () => act(line, '/api/services/install', {}),
      })));
    }

    if (actions.childNodes.length) wrap.appendChild(actions);
    wrap.appendChild(line.el);

    if (state.egress?.length) wrap.appendChild(egressBox(state.egress));

    onChange?.(state);
    document.dispatchEvent(new CustomEvent('ronin:services-state', { detail: state }));
    // Installing is local work, so a short local read can replace the spinner with its
    // real outcome without creating another Shiwake poll.
    if (state.stage === 'installing') installTimer = setTimeout(() => void load(), 3000);
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
    s.textContent = t('services.egress_summary', 'what this machine has sent ({n})', { n: lines.length });
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
    where.say(t('services.working', 'working…'), 'busy');
    const r = await request(route, { method: method || 'POST', ...(json ? { json } : {}) });
    if (!r.ok) { where.say(r.message || t('services.failed', 'that did not work'), 'bad'); return; }
    await load();
  }

  async function changeAddress() {
    const next = window.prompt(t('services.new_address_prompt', 'New email address for Ronin Services'));
    if (!next) return;
    await act(line, '/api/services/activation/address', { email: next.trim() });
  }

  async function load() {
    const r = await request('/api/services/activation');
    // `.data`, not `.json` — request.js's contract is { ok, status, data } and has never
    // carried a `.json`. Reading the wrong name handed render() `undefined` on SUCCESS,
    // which took the !state branch and returned before the card was ever built: the ⚙
    // Services card drew nothing at all, and with it went the only UI caller of
    // POST /api/services/install — the one escape for a box stranded at `verified`.
    render(r.ok ? r.data : null);
  }

  void load();
  return { reload: load, stop() { if (installTimer) clearTimeout(installTimer); } };
}
