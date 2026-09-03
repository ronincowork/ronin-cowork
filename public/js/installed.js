/* part of the ronin-cowork client — see js/README.md */
/**
 * INSTALLED — what is on this machine, as one surface (owner, 2026-09-03).
 *
 * Three facts, each said in its own words and never folded into "off": what is INSTALLED
 * here (Ronin Cowork, the Services parts), whether Ronin Services is ACTIVATED (an
 * entitlement — an email, a confirmation), and which Routines are SWITCHED on for new
 * Agents. An install is not a switch; the switches live on the Campaign's Routines
 * surface and are only pointed at from here. The activation card stands on this tab
 * while the box holds no entitlement, and the case for Ronin Services is made in full,
 * in the owner's words.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { servicesCard } from './services-card.js';

const el = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

/** What Ronin Services adds — the sell, as a list a person can read top to bottom. */
export function servicesSell() {
  return [
    t('installed.sell_library', 'The template library — teams and agents Ronin keeps and grows, with the procedures, macros and tools they read, installed into your own stores with one press.'),
    t('installed.sell_assistant', 'A background assistant that keeps every agent’s work record and instructions current — so the roster and the tile tell you what each agent is doing without you asking.'),
    t('installed.sell_transcripts', 'The locked terminal becomes streaming text — a durable record of every session that can be re-rendered as a proper transcript, read on a phone, summarised, or turned to voice.'),
    t('installed.sell_views', 'Record-fed views of a tile — Terminal Mirror, Detailed, Condensed, Conversation and Agent Summary — instead of the raw locked terminal.'),
    t('installed.sell_voice', 'Text to voice — hear an agent’s report read back; speak to it from the tile.'),
    t('installed.sell_hotwords', 'Hotwords — teach dictation the words it mishears, once, for every session.'),
    t('installed.sell_memory', 'Unified team memory — what a session learns is kept for the team and recalled at birth, not lost with the tile.'),
    t('installed.sell_mobile', 'A proper terminal on a phone — lower latency, real scrolling, copy and paste that behaves.'),
    t('installed.sell_stats', 'Usage history — what your sessions did, counted over time, never their content.'),
    t('installed.sell_help', 'A help desk that knows your box — Mika, the house assistant, with Ronin’s own procedures in hand.'),
  ];
}

export function buildInstalled(host, showing) {
  const wrap = el('div', 'desk-pane inst show');
  host.append(wrap);
  let answer = null;
  const paint = () => {
    wrap.replaceChildren();
    if (!answer) { wrap.append(el('p', 'tw-note', t('installed.reading', 'Reading this machine…'))); return; }
    const a = answer;
    wrap.append(el('h2', 'inst-h', t('installed.here', 'Installed on this machine')));
    const rows = el('dl', 'inst-rows');
    const row = (k, v) => { rows.append(el('dt', null, k), el('dd', null, v)); };
    row(t('installed.cowork', 'Ronin Cowork'), a.cowork.release || t('installed.cowork_commit', 'commit {commit}', { commit: a.cowork.commit }));
    const svcWord = a.services.activated
      ? t('installed.services_activated', 'installed and activated')
      : a.services.installed
        ? t('installed.services_not_activated', 'installed, not activated — no entitlement yet')
        : t('installed.services_absent', 'not installed');
    row(t('installed.services', 'Ronin Services'), `${svcWord}${a.services.parts.length ? ` · ${a.services.parts.join(', ')}` : ''}`);
    row(t('installed.services_switch', 'Ronin Services for new Agents'), a.services.switched_on ? t('installed.switch_on', 'switched on (Campaign → Routines)') : t('installed.switch_off', 'switched off (Campaign → Routines)'));
    wrap.append(rows);
    wrap.append(el('p', 'tw-note', t('installed.not_a_switch', 'An install is not a switch. What is installed and activated is this machine’s; which Routines a new Agent is born with — Ronin Base, Worktrees, Services, Host, gbrain — is the Campaign’s, on its Routines surface, and a Team may override it.')));
    if (!a.services.activated) {
      wrap.append(el('h2', 'inst-h', t('installed.activate', 'Activate Ronin Services')));
      wrap.append(el('p', 'tw-note', a.services.installed
        ? t('installed.activate_help', 'The parts are here already. Activation is an entitlement for this box: enter the email it should go to, press the button, and confirm from the mail.')
        : t('installed.activate_help_absent', 'Nothing of Services is installed here yet. Activation still starts the same way — an email and a confirmation — and the install follows.')));
      const card = el('div');
      wrap.append(card);
      servicesCard(card, () => { void read(); });
    }
    wrap.append(el('h2', 'inst-h', t('installed.sell_head', 'What Ronin Services adds')));
    const ul = el('ul', 'inst-sell');
    for (const line of servicesSell()) ul.append(el('li', null, line));
    wrap.append(ul);
    wrap.append(el('p', 'tw-note', t('installed.floor', 'Everything else — the coworkspace, teams, agents, worktrees, the handful of templates that ship, and making your own — is Ronin Cowork, open source, and works fully without Services.')));
  };
  const read = async () => {
    const r = await request('/api/installed', { cache: 'no-store' });
    answer = r.ok ? r.data : null;
    paint();
  };
  paint();
  return { enter: () => { if (showing()) void read(); } };
}
