/**
 * THE SERVICES CARD — the activation flow as a person sees it.
 *
 * One card, four states, and the state comes from the operator rather than from what this
 * page remembers doing. A reload, a second tab, or an operator restart all land on the
 * truth, because the durable stage lives on disk and this only renders it.
 *
 * NO SECRET REACHES THIS FILE. An entitlement token, where a machine holds one, stays with
 * the operator; the browser sees a stage and an entitlement id — which identifies and cannot
 * authorize.
 */
import { request } from './request.js';
import { store } from './store.js';
import { button, status } from './ui.js';
import { t } from './lexicon.js';
import { createKeyedList } from './workspace-primitives.js';

/** How the four durable stages read to a person, in their words rather than ours.
 *  A function, not a table: the lexicon loads after this module is evaluated. */
function stageWords() {
  return {
    not_requested: [t('services.stage_not_requested', 'Not installed'), t('services.stage_not_requested_blurb', 'Ronin Services are not installed on this machine.')],
    installing: [t('services.stage_installing', 'Installing Services'), t('services.stage_installing_blurb', 'This machine is fetching and verifying the download.')],
    installed: [t('services.stage_installed', 'Services are ready'), t('services.stage_installed_blurb', 'Nothing further to do.')],
    error: [t('services.stage_error', 'Needs attention'), t('services.stage_error_blurb', 'The Services install did not finish.')],
  };
}

export function servicesCard(container, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'st-services';
  container.appendChild(wrap);

  const line = status('st-status');
  // ONE FACT MOVES, ONE ROW REPAINTS (owner, 2026-11-12, KAN-414): the kit's keyed list. The
  // card's rows (the stage, its words, the entitlement, the install press, the press's answer
  // line, what has been sent) are kept, each repainted only when what it shows moves; the
  // egress list keeps its fold until a new line arrives.
  const rows = createKeyedList({ key: (row) => row.key, shows: (row) => row.shows, draw: (row) => row.draw() });
  const lineRow = { key: 'line', shows: '', draw: () => line.el };
  function render(state) {
    if (!state) {
      // SAY IT WHERE IT CAN BE SEEN. `line.el` is only mounted on the success path
      // an unreachable operator looked exactly like a card with nothing to show.
      line.say(t('services.unreachable', 'could not reach the operator'), 'bad');
      rows.set(wrap, [lineRow]);
      return;
    }

    const SAY = stageWords();
    const [title, blurb] = SAY[state.stage] ?? SAY.not_requested;
    const installable = state.stage === 'not_requested' || state.stage === 'error';
    rows.set(wrap, [
      { key: 'head', shows: JSON.stringify([title, state.email_masked]), draw: () => {
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
        return head;
      } },
      { key: 'say', shows: state.error_message || blurb, draw: () => {
        const say = document.createElement('div');
        say.className = 'st-row st-obs';
        say.textContent = state.error_message || blurb;
        return say;
      } },
      // An identifier, so it is safe to show. HQ refuses it as a credential.
      ...(state.entitlement_id ? [{ key: 'entitlement', shows: state.entitlement_id, draw: () => obs(t('services.entitlement', 'entitlement'), state.entitlement_id) }] : []),
      // Installing needs no registration or entitlement. The same press retries a failed
      // install; the answer says only whether the installer started.
      ...(installable ? [{ key: 'actions', shows: '', draw: () => {
        const actions = document.createElement('div');
        actions.className = 'st-row';
        actions.appendChild(nodeOf(button(t('services.install_now', 'Install Services now'), {
          onClick: () => act(line, '/api/services/install', {}),
        })));
        return actions;
      } }] : []),
      lineRow,
      ...(state.egress?.length ? [{ key: 'egress', shows: JSON.stringify(state.egress.slice(0, 10).concat(state.egress.length)), draw: () => egressBox(state.egress) }] : []),
    ]);

    onChange?.(state);
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
    where.say('');
    // Install answers with the services object; a registration's new activation arrives as
    // {t:'services-setup'}.
    if (r.data?.activation) render(r.data.activation);
  }

  async function load() {
    const r = await request('/api/services/activation');
    // `.data`, not `.json` — request.js's contract is { ok, status, data } and has never
    // carried a `.json`. Reading the wrong name handed render() `undefined` on SUCCESS,
    // which took the !state branch and returned before the card was ever built: the ⚙
    // Services card drew nothing at all, and with it went the only UI caller of
    // POST /api/services/install — the one way to retry a failed install.
    render(r.ok ? r.data : null);
  }

  // OPEN reads the activation and listens: each step and an install's end arrive by push, and a reopened socket (Ronin back from a restart) reads again. `stop` is CLOSE.
  const unlisten = store.listen('services-setup', (m) => render(m.services?.activation ?? null));
  const unopen = store.onOpen(() => { void load(); });
  void load();
  return { stop() { unlisten(); unopen(); } };
}
