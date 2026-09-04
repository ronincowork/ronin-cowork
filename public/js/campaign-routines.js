/* part of the ronin-cowork client — see js/README.md */
/**
 * ROUTINES — installs and switches on one page (owner, 2026-09-03).
 *
 * The catalog supplies the rows; campaign_config owns the on/off answer. Ronin Services
 * is both an install and a Routine, so its row carries the install as well: what is on
 * this machine, whether the box is activated, and the whole activation flow inline —
 * enter an email, send, and the row collapses to "waiting for your confirmation" with
 * resend and cancel; activated, it says so. No separate card, no separate surface, and
 * nothing here re-renders on a poll: the row repaints only after a press, and after the
 * slow check while a confirmation is outstanding.
 */
import { t } from './lexicon.js';
import { S } from './state.js';
import { request } from './request.js';
import { saveCampaign } from './campaigns.js';
import { WorkspaceKit } from './workspace-kit.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};
const bucket = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function completeRoutineMap(catalog, stored) {
  const current = bucket(stored);
  return Object.fromEntries(catalog.map((routine) => [routine.name, current[routine.name] === true]));
}

/** What Ronin Services adds — the owner's list, not a closed one. */
function servicesSell() {
  return [
    t('campaign_view.sell_library', 'The template library — teams and agents Ronin keeps and grows, with the procedures, macros and tools they read, installed with one press.'),
    t('campaign_view.sell_assistant', 'A background assistant that keeps every agent’s work record and instructions current, so the roster and the tile say what each agent is doing.'),
    t('campaign_view.sell_transcripts', 'Readable transcripts are not in this beta; the recorder is off while it is refactored.'),
    t('campaign_view.sell_voice', 'Text to voice, and voice in — hear a report read back; speak to an agent from the tile.'),
    t('campaign_view.sell_hotwords', 'Hotwords — teach dictation the words it mishears, once, for every session.'),
    t('campaign_view.sell_memory', 'Unified team memory — what a session learns is kept for the team and recalled at birth.'),
    t('campaign_view.sell_stats', 'Usage history — what your sessions did, counted over time, never their content.'),
  ];
}

export function createRoutinesSurface(campaign) {
  const { createSurface, createNotice } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('campaign_view.routines', 'Routines and Installs'), className: 'cv-surface' });
  const body = el('div', 'cv-body');
  surface.content.append(body);
  let catalog = [];
  let installed = null;   // /api/installed — installed parts, activated
  let activation = null;  // /api/services/activation — stage, masked email
  let timer = null;

  const available = (routine) => (routine.mcp || []).every((name) => !Array.isArray(S.services) || S.services.includes(name));
  const save = async (name, on, notice) => {
    const row = campaign();
    if (!row) return;
    const routines = { ...completeRoutineMap(catalog, row.config?.agent_defaults?.routines), [name]: on };
    notice.set('info', t('campaign.saving', 'saving…'));
    const result = await saveCampaign(row.id, { config: { agent_defaults: { ...bucket(row.config?.agent_defaults), routines } } });
    notice.set(result.ok ? 'success' : 'failed', result.ok ? t('settei.saved', 'saved') : result.message);
    if (result.ok) paint();
  };

  /* ---- the install, on the Services row ---- */
  const act = async (route, json, notice) => {
    notice.set('info', t('campaign.saving', 'saving…'));
    const r = await request(route, json === 'DELETE' ? { method: 'DELETE' } : { method: 'POST', ...(json ? { json } : {}) });
    if (!r.ok) { notice.set('failed', r.message); return; }
    notice.set('', '');
    await readInstall();
    paint();
  };
  const installBlock = (notice) => {
    const block = el('div', 'cv-install');
    const stage = activation?.stage || 'not_requested';
    const activated = installed?.services?.activated === true;
    const parts = installed?.services?.parts || [];
    // THREE FACTS, IN THE ORDER THEY MATTER (owner, 2026-09-03): the parts ship with Ronin,
    // so "installed" is the usual answer; the SWITCH on the right is what turns them on for
    // new Agents; ACTIVATION with Ronin HQ is a separate, optional step for the hosted parts.
    block.append(el('p', 'cv-choice-why', parts.length
      ? t('campaign_view.svc_installed', 'Installed on this machine: {parts}. The switch on the right turns it on for new Agents.', { parts: parts.join(', ') })
      : t('campaign_view.svc_absent', 'Not installed on this machine.')));
    const parked = installed?.services?.parked || [];
    if (parked.length) block.append(el('p', 'cv-choice-why', t('campaign_view.svc_parked', 'Parked parts: {parts}.', {
      parts: parked.map((part) => {
        const reason = String(part.reason || `${part.routine || 'Routine'} is off`)
          .replace(new RegExp(`^${part.name} is `, 'i'), '')
          .replace(/, to be refactored$/i, '');
        return `${part.name} — ${reason}`;
      }).join('; '),
    })));
    // The running copy: the parts load at start, by the switch. Off means none of it runs —
    // no recorder, no tapes, Locked tiles only — until the switch is on and Ronin restarts.
    if (installed?.services?.restart_needed) block.append(el('p', 'cv-choice-why cv-restart', installed.services.switched_on
      ? t('campaign_view.svc_restart_on', 'Switched on, but not running in this copy of Ronin: restart Ronin to start it.')
      : t('campaign_view.svc_restart_off', 'Switched off, but still running in this copy of Ronin until it restarts.')));
    else if (parts.length && !installed?.services?.switched_on) block.append(el('p', 'cv-choice-why', t('campaign_view.svc_off_running', 'Off: none of it runs — no recording, no transcripts, tiles are Locked only. Files stay in place.')));
    block.append(el('p', 'cv-choice-why', activated
      ? t('campaign_view.svc_activated', 'Activated with Ronin HQ: the template library and the hosted parts are yours.')
      : t('campaign_view.svc_not_activated', 'Not activated with Ronin HQ. Activation is optional and separate from the switch: it unlocks the hosted parts — the template library first — with an email and a confirmation.')));
    if (!activated) {
      if (stage === 'awaiting_email' || stage === 'address_changed' || stage === 'requesting') {
        block.append(el('p', 'cv-choice-why', stage === 'requesting' ? t('campaign_view.svc_sending', 'Sending the confirmation email…') : t('campaign_view.svc_waiting', 'Waiting for your confirmation — open the email sent to {email}.', { email: activation?.email_masked || '' })));
        const actions = el('div', 'cv-actions');
        const resend = el('button', 'cv-button', t('campaign_view.svc_resend', 'Send the email again')); resend.type = 'button';
        if (activation?.resend_available_at && new Date(activation.resend_available_at) > new Date()) { resend.disabled = true; resend.title = t('campaign_view.svc_resend_after', 'after {time}', { time: new Date(activation.resend_available_at).toLocaleTimeString() }); }
        resend.addEventListener('click', () => act('/api/services/activation/resend', null, notice));
        const cancel = el('button', 'cv-button', t('campaign_view.svc_cancel', 'Cancel the request')); cancel.type = 'button';
        cancel.addEventListener('click', () => act('/api/services/activation', 'DELETE', notice));
        actions.append(resend, cancel);
        block.append(actions);
      } else if (stage === 'verified' || stage === 'installing') {
        block.append(el('p', 'cv-choice-why', t('campaign_view.svc_installing', 'Confirmed — Ronin is finishing the install.')));
      } else {
        // not_requested · cancelled · expired · error: the form, and nothing else.
        const form = el('form', 'cv-actions');
        const email = el('input', 'cv-input'); email.type = 'email'; email.required = true; email.placeholder = t('campaign_view.svc_email', 'you@example.com'); email.autocomplete = 'email';
        const send = el('button', 'cv-button', t('campaign_view.svc_send', 'Send confirmation email')); send.type = 'submit'; send.dataset.primary = 'true';
        form.append(email, send);
        form.addEventListener('submit', (event) => { event.preventDefault(); if (email.value.trim()) void act('/api/services/activation', { email: email.value.trim() }, notice); });
        block.append(el('p', 'cv-choice-why', stage === 'expired' ? t('campaign_view.svc_expired', 'That confirmation link expired. Ask for a fresh one.') : t('campaign_view.svc_ask', 'To activate: the address the entitlement should go to, then confirm from the email.')), form);
      }
    }
    const sell = el('details', 'cv-sell');
    sell.append(el('summary', null, t('campaign_view.sell_head', 'What Ronin Services adds')));
    const ul = el('ul');
    for (const line of servicesSell()) ul.append(el('li', null, line));
    sell.append(ul);
    block.append(sell);
    return block;
  };

  function paint() {
    body.replaceChildren();
    const row = campaign();
    if (!row) return surface.setState('empty', t('campaign_view.none_selected', 'No Campaign selected.'));
    surface.setState(null, '');
    const values = completeRoutineMap(catalog, row.config?.agent_defaults?.routines);
    const notice = createNotice();
    body.append(el('p', 'cv-note', t('campaign_view.routines_help', 'What is installed on this machine, and what new Cowork Agents start with. The switches seed new Teams; a Team may replace them, and New Agent shows the resolved answer. Nothing already running changes.')));
    for (const routine of catalog) {
      const line = el('div', 'cv-choice');
      const words = el('div', 'cv-choice-pick');
      words.append(el('span', 'cv-choice-name', routine.label || routine.name), el('p', 'cv-choice-why', routine.blurb || t('campaign_view.routine_no_description', 'No description supplied.')));
      if (routine.name === 'ronin_worktrees') words.append(el('p', 'cv-choice-why', t('campaign_view.worktrees_routine_help', 'Worktrees give each Agent a separate working folder and branch, so file changes do not collide. They run only when both the Agent and repo have Worktrees on, and use the managed hand-in and Team-lead merge process.')));
      if (routine.name === 'ronin_services') words.append(installBlock(notice));
      const controls = el('div', 'cv-routine-control');
      // The pill is the INSTALL fact. For Services: installed (its parts are here) or not; activation is said in the row, not here.
      const ok = routine.name === 'ronin_services' ? (installed?.services?.parts || []).length > 0 : available(routine);
      const word = routine.name === 'ronin_services'
        ? (ok ? (installed?.services?.activated ? t('campaign_view.svc_pill_activated', 'Installed · activated') : t('campaign_view.svc_pill_installed', 'Installed')) : t('campaign_view.svc_pill_absent', 'Not installed'))
        : (ok ? t('campaign_view.available', 'Available') : t('campaign_view.unavailable', 'Unavailable'));
      controls.append(el('span', ok ? 'cv-state cv-state-ok' : 'cv-state', word));
      const toggle = el('label', 'cv-switch');
      const box = el('input'); box.type = 'checkbox'; box.checked = values[routine.name];
      const state = el('span', null, box.checked ? t('campaign_view.on', 'On') : t('campaign_view.off', 'Off'));
      box.addEventListener('change', () => { state.textContent = box.checked ? t('campaign_view.on', 'On') : t('campaign_view.off', 'Off'); void save(routine.name, box.checked, notice); });
      toggle.append(box, state); controls.append(toggle); line.append(words, controls); body.append(line);
    }
    body.append(notice.el);
    // While a confirmation is outstanding, look again slowly; otherwise the page is still.
    clearTimeout(timer);
    const stage = activation?.stage;
    if (!installed?.services?.activated && (stage === 'awaiting_email' || stage === 'requesting' || stage === 'verified' || stage === 'installing')) {
      timer = setTimeout(() => { if (surface.el.isConnected) void readInstall().then(paint); }, 15000);
    }
  }

  const readInstall = async () => {
    const [i, a] = await Promise.all([request('/api/installed', { cache: 'no-store' }), request('/api/services/activation', { cache: 'no-store' })]);
    installed = i.ok ? i.data : null;
    activation = a.ok ? a.data : null;
  };

  return {
    el: surface.el,
    enter: () => void Promise.all([request('/api/routines'), readInstall()]).then(([result]) => { catalog = result.ok && Array.isArray(result.data) ? result.data : []; paint(); }),
  };
}

export function routinesSummary(campaign) {
  const values = bucket(campaign?.config?.agent_defaults?.routines);
  return t('campaign_view.routines_n', '{n} on', { n: Object.values(values).filter((value) => value === true).length });
}
