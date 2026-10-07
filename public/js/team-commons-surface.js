/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TEAM COMMONS as one surface: Roster, Docs, Wipeboard, Messages, Cron jobs and
 * Configuration behind a tab strip, painting itself from the store. Lifted as a copy from
 * cowork-view.js for the Team tenant on the tenant frame (team-view.js); cowork-view.js
 * keeps its own until it goes. Its next rows in UI_STRUCTURE.md are tabs → rows, and
 * Configuration → a menu on the surface header that opens a full overlay; not this one.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { membersOfTeam, subscribe as subscribeTeams, teamByName } from './team-controller.js';
import { store } from './store.js';
import { createTeamWipeboard } from './team-wipeboard.js';
import { createTeamJikan } from './team-jikan.js';
import { buildMessageQueue } from './message-queue.js';
import { buildDocs } from './docs.js';
import { renderTeamConfiguration } from './team-configuration.js';
import { buildTeamMembers, configSignature, currentWorkStep } from './team-members.js';
import { stanceLabel } from './home.js';
import { t } from './lexicon.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

/** A member's readings off its home row: the work step, the stance, the gauge, the model. */
export function readingsOf(row = {}) {
  const current = currentWorkStep(row.tegami);
  const ctx = row.ctx != null ? `⛽ ${row.ctx}%` : '';
  return {
    step: current.label,
    description: current.text,
    model: (row.model || '').toLowerCase(),
    status: stanceLabel(row.stance),
    ctx,
    lines: [current.text, stanceLabel(row.stance), ctx, (row.model || '').toLowerCase()].filter(Boolean),
  };
}

/**
 * `team()` names the Team; `context()` the view context the tab strip mounts with. The
 * roster rows call back `onSelect` (the composition reader), `onOpen` (the Agent's
 * workbench), `onAddLead` (New Agent as lead) and `onClose` (retire); `onSaved` hears a
 * saved configuration.
 */
export function createTeamCommonsSurface({ team, context, idPrefix = 'workspace1', onSelect = () => {}, onOpen = () => {}, onAddLead = () => {}, onClose = () => {}, onSaved = () => {} }) {
  const { createTabbedSurface, createAction } = WorkspaceKit.primitives;
  let channels = null;
  const wipeboard = createTeamWipeboard();
  const jikan = createTeamJikan({
    onCount: ({ scheduled, paused }) => channels?.setBadge('cron-jobs', `${scheduled} / ${paused}`,
      t('workspace.tab_cron_count', '{scheduled} scheduled, {paused} paused', { scheduled, paused })),
  });
  const docsPane = el('div', 'home-docs tw-docs');
  const docs = buildDocs(docsPane, (name) => membersOfTeam(team()).some((m) => m.name === name), () => teamByName(team())?.repos || []);
  const docsService = { el: docsPane, mount: () => {}, enter: () => { docs.enter(); }, leave: () => { docs.close(); }, destroy: () => { docs.close(); } };
  const roster = el('div', 'tw-config tw-roster');
  const config = el('div', 'tw-config');
  const messages = el('div', 'tw-messages');
  const service = (node) => ({ el: node, mount: () => {}, enter: () => {}, leave: () => {}, destroy: () => {} });
  // THE COUNT IS THE SIGNAL: what is waiting is a number; attention colours the tab.
  let retainedCount = 0;
  let chooseQueueOnOpen = false;
  const paintMessageAttention = () => {
    if (!channels) return;
    channels.setBadge('agent-message-queue', retainedCount || '',
      retainedCount ? t('workspace.tab_messages_waiting', '{count} waiting to enter a live session', { count: retainedCount }) : '');
    channels.setAttention('agent-message-queue', retainedCount > 0);
    if (chooseQueueOnOpen) {
      if (retainedCount > 0) channels.select('agent-message-queue');
      chooseQueueOnOpen = false;
    }
  };
  const messageQueue = buildMessageQueue(messages, (count) => { retainedCount = count; paintMessageAttention(); });
  channels = createTabbedSurface({
    label: t('team.commons', 'Commons'),
    tabs: [
      { id: 'roster', label: t('workspace.tab_roster', 'Roster'), panel: service(roster) },
      { id: 'docs', label: t('workspace.tab_docs', 'Docs'), panel: docsService },
      { id: 'wipeboard', label: t('workspace.tab_wipeboard', 'Wipeboard'), panel: wipeboard },
      // The queue listens while the Commons is on screen, not only while its own tab is.
      { id: 'agent-message-queue', label: t('workspace.tab_agent_message_queue', 'Messages'), panel: messages, watch: () => { messageQueue.enter(); return messageQueue.leave; } },
      { id: 'cron-jobs', label: t('workspace.tab_cron_jobs', 'Cron jobs'), panel: jikan },
      { id: 'team-configuration', label: t('workspace.tab_team_configuration', 'Configuration'), panel: service(config) },
    ],
    selected: 'roster',
    onSelect: () => { chooseQueueOnOpen = false; },
  });
  paintMessageAttention();

  /* ---------- painting from the store ---------- */
  let rows = new Map(); // name -> the store's home row
  let entered = false;
  let mounted = false;
  let seenConfig = '';
  let seenRecord = '';
  const readings = (member) => readingsOf(rows.get(member.name));
  // CONFIGURATION IS DRAWN ONLY WHEN IT MOVED: the member rows follow the pushed readings,
  // the Configuration tab follows the saved record alone, so a push never throws away an
  // edit in progress (owner, 2026-09-13).
  const renderConfig = (record) => {
    const name = team();
    const members = membersOfTeam(name);
    const signature = configSignature(name) + JSON.stringify(members.map((member) => readings(member).lines));
    const recordText = JSON.stringify(record || null);
    const rowsMoved = signature !== seenConfig;
    const recordMoved = recordText !== seenRecord;
    if (!rowsMoved && !recordMoved) return;
    seenConfig = signature;
    seenRecord = recordText;
    const changed = () => { channels.setState(); paint(); };
    roster.replaceChildren(buildTeamMembers(name, {
      onChanged: changed,
      onFailed: (message) => channels.setState('failed', message),
      idPrefix, reading: readings, onSelect, onOpen, onAddLead, onClose,
    }));
    if (!recordMoved) return;
    if (!record) { renderTeamConfiguration(config, null, { createAction }); return; }
    const fields = el('div');
    const section = el('section', 'league-team-config');
    section.append(el('h3', 'league-team-roster-title', t('workspace.tab_team_configuration', 'Configuration')), fields);
    config.replaceChildren(section);
    renderTeamConfiguration(fields, { ...record, durable: true }, { createAction, onSaved: (saved) => { onSaved(saved); renderConfig(saved); paint(); } });
  };
  const paint = () => {
    const name = team();
    if (!name) return;
    const record = teamByName(name);
    // THE BOARD IS ASSUMED: the roster's wipeboard id, or the Team's own name.
    wipeboard.setBoard((record.durable && record.wipeboard) || name);
    jikan.setTeam(name, membersOfTeam(name).map((m) => m.name));
    renderConfig(record.durable ? record : null);
  };
  const stopRows = store.subscribe('home', (list) => { rows = new Map((list || []).map((row) => [row.name, row])); if (entered) paint(); });
  const stopTeams = subscribeTeams(() => { if (entered) paint(); });

  return {
    el: channels.el,
    show: (detail = {}) => {
      const ctx = context?.();
      if (!mounted && ctx) { channels.mount(ctx); mounted = true; }
      entered = true;
      seenConfig = ''; // a fresh entry always paints the roster once
      if (!detail.doc && !detail.tab) { chooseQueueOnOpen = true; if (retainedCount > 0) paintMessageAttention(); }
      channels.enter(ctx);
      paint();
      if (detail.doc) { channels.select('docs'); void docs.open(detail.doc); } else if (detail.tab) channels.select(detail.tab);
    },
    leave: () => { entered = false; channels.leave(); },
    destroy: () => { entered = false; stopRows(); stopTeams(); channels.destroy(); },
  };
}
