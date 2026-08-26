/* part of the ronin-cowork client — see js/README.md */

/**
 * THE PREVIEW HALF — what this seat will be born with, and nothing that pretends to be a
 * terminal.
 *
 * A proposed seat HAS NO SESSION. There is nothing to attach, no socket to open and no
 * Output to register, so this Surface mounts no Tile and never will: a simulated terminal
 * would be a picture of a lie. The owner ruled the shape (2026-08-23) — the composed brief
 * plus a dry-run resolution — and the Kit's own slot is named `preview` for that reason.
 *
 * TWO HALVES, BOTH THE SERVER'S ANSWERS RATHER THAN OURS:
 *
 *   the composed brief    the literal first message the agent will read, assembled by
 *                         `buildBrief` on the server. In manual mode it is the owner's
 *                         words byte for byte, because manual means Ronin adds nothing.
 *   the resolution        what `resolveForm` returns for this seat — the same resolver the
 *                         launch itself runs, reached through New Team's preflight. This
 *                         file re-derives no part of the cascade; a second cascade in the
 *                         browser would be correct exactly until somebody edited one.
 *
 * `stated_by` rides beside each resolved value from that same server answer. This file
 * formats the returned layer/source pairs and does not infer a winner from the seat.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';


/** The resolved readings worth showing, in the order they answer "what will this be".
 *  A function, not a table: the lexicon loads after this module is evaluated. */
function resolvedRows() {
  return [
    ['session_role', t('seat.session_role', 'Session role')],
    ['name', t('seat.name', 'Name')],
    ['team', t('team.team', 'Team')],
    ['team_role', t('team.team_role', 'Team role')],
    ['project_root', t('team.project_root', 'Project root')],
    ['team_objective', t('preview.team_objective', 'Team objective')],
    ['team_repos', t('preview.team_repos', 'Team repositories')],
    ['team_branch', t('preview.team_branch', 'Team branch')],
    ['team_wipeboard', t('preview.team_wipeboard', 'Team wipeboard')],
    ['team_state', t('preview.team_state', 'Team state')],
    ['dir', t('preview.dir', 'Directory')],
    ['agent', t('preview.agent', 'Launches an agent')],
    ['label', t('preview.label', 'Agent label')],
    ['model', t('preview.model', 'Model bias')],
    ['permissions', t('preview.permissions', 'Permissions')],
    ['posture', t('preview.posture', 'Posture')],
    ['opening', t('preview.opening', 'Opening template')],
    ['ack', t('preview.ack', 'Acknowledgement gate')],
    ['cmd', t('team.command', 'Command')],
    ['launchAgent', t('preview.cli', 'CLI')],
    ['dial', t('team.control', 'Control')],
    ['mcp', t('seat.mcp', 'gbrain')],
    ['mcpDefault', t('preview.mcp_default', 'gbrain default')],
    ['mcpAlways', t('preview.mcp_always', 'gbrain locked on')],
    ['lifecycle', t('preview.lifecycle', 'Lifecycle')],
    ['mode', t('team.mode', 'Mode')],
    ['capExempt', t('preview.cap_exempt', 'Exempt from the session max')],
  ];
}

/** A resolved value in the owner's words. Booleans read as words; a blank stays blank,
 *  because blank is a real answer and "—" would be us inventing one. */
function readingOf(key, value) {
  if (typeof value === 'boolean') return value ? t('preview.yes', 'yes') : t('preview.no', 'no');
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export function createSeatPreview() {
  // Resolved at CALL time, not at import time — see the note in agent-config-fields.js.
  const { createSurface } = WorkspaceKit.primitives;
  const surface = createSurface({ className: 'ac-preview', label: t('preview.title', 'Preview') });

  const briefHead = document.createElement('h3');
  briefHead.className = 'ac-preview-heading';
  briefHead.textContent = t('preview.brief_head', 'The brief this session is born with');
  const brief = document.createElement('pre');
  brief.className = 'ac-preview-brief';

  const resolvedHead = document.createElement('h3');
  resolvedHead.className = 'ac-preview-heading';
  resolvedHead.textContent = t('preview.resolved_head', 'What it resolves to');
  const rows = document.createElement('dl');
  rows.className = 'ac-preview-rows';
  const readingHead = document.createElement('h3');
  readingHead.className = 'ac-preview-heading';
  readingHead.textContent = t('preview.reading_head', 'Read at birth');
  const reading = document.createElement('ul');
  reading.className = 'ac-preview-reading';

  const body = document.createElement('div');
  body.className = 'ac-preview-body';
  body.append(briefHead, brief, readingHead, reading, resolvedHead, rows);
  surface.content.append(body);

  /** Nothing resolved yet is not a failure — it is the ordinary state before the first
   *  preflight answers. `empty` says so without implying anything broke. */
  const clear = (message = t('preview.nothing_yet', 'Nothing to preview yet.')) => {
    brief.textContent = '';
    reading.replaceChildren();
    rows.replaceChildren();
    surface.setState('empty', message);
  };

  /**
   * Paint one seat's verdict. `verdict.resolved` is the server's `Resolved` shape; the
   * brief rides beside it. A refused seat still shows everything the resolver DID work
   * out — a refusal is not a reason to blank the surface, and seeing how far it got is
   * most of the diagnosis.
   */
  const show = (verdict) => {
    if (!verdict) return clear();
    const resolved = verdict.resolved ?? null;
    brief.textContent = resolved?.brief ?? '';
    reading.replaceChildren();
    rows.replaceChildren();
    if (!resolved) {
      surface.setState('empty', t('preview.unresolved', 'This seat did not resolve far enough to preview.'));
      return;
    }
    const birthReading = Array.isArray(resolved.birth_reading) ? resolved.birth_reading : [];
    for (const file of birthReading) {
      const item = document.createElement('li');
      item.textContent = file;
      reading.append(item);
    }
    if (!birthReading.length) {
      const item = document.createElement('li');
      item.dataset.blank = '';
      item.textContent = t('preview.no_reading', 'No birth reading reported.');
      reading.append(item);
    }
    for (const [key, label] of resolvedRows()) {
      const reading = readingOf(key, resolved[key]);
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = reading;
      // A blank resolved value is a real answer and is marked as one rather than left
      // looking like a rendering failure.
      if (!reading) dd.dataset.blank = '';
      const attribution = document.createElement('small');
      attribution.className = 'ac-preview-stated-by';
      const statedBy = Array.isArray(resolved.stated_by?.[key]) ? resolved.stated_by[key] : [];
      attribution.textContent = statedBy.length
        ? statedBy.map(({ layer, source }) => `${String(layer).replaceAll('_', ' ')} · ${source}`).join(' + ')
        : t('preview.source_unknown', 'source not reported');
      dd.append(attribution);
      rows.append(dt, dd);
    }
    surface.setState(verdict.verdict === 'refuse' ? 'stale' : '', '');
  };

  clear();
  return { el: surface.el, surface, show, clear };
}
