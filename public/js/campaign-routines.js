/* part of the ronin-cowork client — see js/README.md */
/**
 * ROUTINES — the switchboard for control systems (owner, 2026-08-30): the things Ronin
 * can run for you — Ronin control (desks), gbrain, Koshi, Hotwords — one row each, with
 * its switch where a switch exists. A control system is a BUNDLE: a reading list, SOPs,
 * a macro library and tools; on means a session born after the switch gets all four.
 * The bundle model itself is the CONTROL_BUNDLES build-out in the lab; this surface is
 * honest on day one — the one real switch (gbrain, a SETTEI setting) flips, and the
 * systems without a switch yet say present or absent rather than pretending.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { S } from './state.js';
import { WorkspaceKit } from './workspace-kit.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

export function createRoutinesSurface() {
  const { createSurface, createNotice } = WorkspaceKit.primitives;
  const label = t('campaign_view.routines', 'Routines');
  const surface = createSurface({ label, className: 'cv-surface' });
  const body = el('div', 'cv-body');
  surface.content.append(body);
  let settei = null;
  const notice = createNotice();

  const present = (svc) => !Array.isArray(S.services) || S.services.includes(svc);
  const gbrainOn = () => settei?.set?.gbrain?.enabled === true;

  const setGbrain = async (on) => {
    notice.set('info', t('campaign.saving', 'saving…'));
    const r = await request('/api/settei/gbrain', { method: 'PUT', json: { enabled: on } });
    notice.set(r.ok ? 'success' : 'failed', r.ok ? t('settei.saved', 'saved') : r.message);
    if (r.ok) await load();
  };

  /** One control system: its name, what it brings, and its switch or its state. */
  const row = (name, what, control) => {
    const line = el('div', 'cv-choice');
    const left = el('div', 'cv-choice-pick');
    left.append(el('span', 'cv-choice-name', name), el('p', 'cv-choice-why', what));
    line.append(left, control);
    return line;
  };
  const toggle = (on, onChange) => {
    const wrap = el('label', 'cv-switch');
    const box = el('input'); box.type = 'checkbox'; box.checked = on;
    box.addEventListener('change', () => onChange(box.checked));
    wrap.append(box, el('span', null, on ? t('campaign_view.on', 'On') : t('campaign_view.off', 'Off')));
    return wrap;
  };
  const state = (text) => el('span', 'cv-state', text);

  /** The rows, read at paint so the lexicon is up. The switch column says what it is. */
  const ROWS = () => [
    {
      name: t('campaign_view.rt_control', 'Ronin control'),
      what: t('campaign_view.rt_control_what', 'Desks, hand-in and team promotion: the desk reading, the tejun-desk tools, the git shims. On wherever a repository declares desks.'),
      control: state(t('campaign_view.rt_by_repo', 'per repository — see Project roots')),
    },
    {
      name: t('campaign_view.rt_gbrain', 'gbrain'),
      what: t('campaign_view.rt_gbrain_what', 'The shared memory service: its reading and its MCP tools for sessions born with it connected.'),
      control: present('gbrain') ? toggle(gbrainOn(), (on) => void setGbrain(on)) : state(t('campaign_view.rt_absent', 'not installed')),
    },
    {
      name: t('campaign_view.rt_koshi', 'Koshi'),
      what: t('campaign_view.rt_detail_koshi', 'The smart fill behind launches and Mika.'),
      control: state(present('koshi') ? t('campaign_view.rt_present', 'installed — no switch yet') : t('campaign_view.rt_absent', 'not installed')),
    },
    {
      name: t('campaign_view.rt_hotwords', 'Hotwords'),
      what: t('campaign_view.rt_hotwords_what', 'The words dictation keeps mishearing, sent with your voice.'),
      control: state(present('koe') ? t('campaign_view.rt_present', 'installed — no switch yet') : t('campaign_view.rt_absent', 'not installed')),
    },
  ];

  function paint() {
    body.replaceChildren();
    body.append(el('p', 'cv-note', t('campaign_view.routines_help', 'What Ronin runs for you. Each is a bundle — a reading list, SOPs, macros and tools — and a switch applies to sessions born after it; nothing running is touched.')));
    for (const r of ROWS()) body.append(row(r.name, r.what, r.control));
    body.append(notice.el);
  }
  async function load() {
    const r = await request('/api/settei');
    settei = r.ok ? r.data : null;
    paint();
  }

  return { el: surface.el, enter: () => { paint(); void load(); } };
}

/** The card's line: how many switches are on, of those that exist. */
export function routinesSummary(settei) {
  const on = settei?.set?.gbrain?.enabled === true ? 1 : 0;
  return t('campaign_view.routines_n', '{on} of {n} switches on', { on, n: 1 });
}
