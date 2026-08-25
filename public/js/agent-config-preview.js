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


/** The resolved readings worth showing, in the order they answer "what will this be". */
const RESOLVED_ROWS = Object.freeze([
  ['session_role', 'Session role'],
  ['name', 'Name'],
  ['team', 'Team'],
  ['team_role', 'Team role'],
  ['project_root', 'Project root'],
  ['dir', 'Directory'],
  ['agent', 'Launches an agent'],
  ['cmd', 'Command'],
  ['launchAgent', 'CLI'],
  ['dial', 'Control'],
  ['mcp', 'gbrain'],
  ['lifecycle', 'Lifecycle'],
  ['mode', 'Mode'],
  ['capExempt', 'Exempt from the session max'],
]);

/** A resolved value in the owner's words. Booleans read as words; a blank stays blank,
 *  because blank is a real answer and "—" would be us inventing one. */
function readingOf(key, value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export function createSeatPreview() {
  // Resolved at CALL time, not at import time — see the note in agent-config-fields.js.
  const { createSurface } = WorkspaceKit.primitives;
  const surface = createSurface({ className: 'ac-preview', label: 'Preview' });

  const briefHead = document.createElement('h3');
  briefHead.className = 'ac-preview-heading';
  briefHead.textContent = 'The brief this session is born with';
  const brief = document.createElement('pre');
  brief.className = 'ac-preview-brief';

  const resolvedHead = document.createElement('h3');
  resolvedHead.className = 'ac-preview-heading';
  resolvedHead.textContent = 'What it resolves to';
  const rows = document.createElement('dl');
  rows.className = 'ac-preview-rows';

  const body = document.createElement('div');
  body.className = 'ac-preview-body';
  body.append(briefHead, brief, resolvedHead, rows);
  surface.content.append(body);

  /** Nothing resolved yet is not a failure — it is the ordinary state before the first
   *  preflight answers. `empty` says so without implying anything broke. */
  const clear = (message = 'Nothing to preview yet.') => {
    brief.textContent = '';
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
    brief.textContent = verdict.brief ?? '';
    rows.replaceChildren();
    if (!resolved) {
      surface.setState('empty', 'This seat did not resolve far enough to preview.');
      return;
    }
    for (const [key, label] of RESOLVED_ROWS) {
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
        : 'source not reported';
      dd.append(attribution);
      rows.append(dt, dd);
    }
    surface.setState(verdict.verdict === 'refuse' ? 'stale' : '', '');
  };

  clear();
  return { el: surface.el, surface, show, clear };
}
