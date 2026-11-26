/* part of the ronin-cowork client — see js/README.md */
/**
 * THE RONIN TOUR, AS PICTURES (owner, 24 Nov; w926): "This needs to be a picture." One drawing per part
 * of docs/getting-started/tour.md (two kinds of Agent, the toolkit, how the work runs, giving your Team
 * work, when you come back), each with a line or two of caption, stepped through with Back and Next.
 * Setup gives the Tour both work surfaces while it is open (setup-view.js); closing it brings Setup back.
 *
 * The drawings are inline SVG in the design tokens (classes styled in css/setup-tour.css), so they read
 * in light and dark. The words are the Tour's; the doc stays the full text, with its Questions.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';

const W = 720, H = 400;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const box = (x, y, w, h, cls = 'tour-box', rx = 8) => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
const text = (x, y, words, cls = 'tour-label', anchor = 'middle') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(words)}</text>`;
const chip = (x, y, w, words, cls = 'tour-chip') => box(x, y, w, 34, cls, 17) + text(x + w / 2, y + 22, words, 'tour-chip-text');
/** A line with its own arrowhead (no marker ids, so many drawings share a page). */
const arrow = (x1, y1, x2, y2, cls = 'tour-wire') => {
  const a = Math.atan2(y2 - y1, x2 - x1), s = 10;
  const p = (da) => `${(x2 - s * Math.cos(a + da)).toFixed(1)},${(y2 - s * Math.sin(a + da)).toFixed(1)}`;
  const head = cls.split(' ').map((c) => `${c}-head`).join(' ');
  return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><path class="${head}" d="M${x2},${y2} L${p(0.45)} L${p(-0.45)} Z"/>`;
};
const tile = (x, y, w, words, cls = 'tour-box') => box(x, y, w, 52, cls) + text(x + w / 2, y + 32, words);
const person = (cx, cy) => `<circle class="tour-person" cx="${cx}" cy="${cy - 18}" r="16"/><path class="tour-person" d="M${cx - 28},${cy + 34} a28,28 0 0 1 56,0 Z"/>`;

export const TOUR_PARTS = Object.freeze([
  {
    id: 'kinds', title: 'Two kinds of Agent',
    caption: 'A Cowork Agent starts with Ronin’s brief: its Team, how to message the others, hand in work and keep its items true. A bare-metal Agent is the harness as it comes. Not sure? Leave Cowork on.',
    svg: () => [
      text(180, 34, 'Cowork Agent', 'tour-title'), chip(118, 46, 124, 'the default', 'tour-chip tour-chip-on'),
      box(30, 92, 300, 240, 'tour-ring', 16),
      chip(48, 110, 120, 'its Team'), chip(192, 110, 120, 'messages'),
      box(80, 166, 200, 76, 'tour-box tour-harness') + text(180, 199, 'Harness') + text(180, 223, 'Claude Code, Codex', 'tour-note'),
      chip(48, 274, 120, 'hand-in'), chip(192, 274, 120, 'items'),
      text(180, 362, 'Ronin’s brief around it', 'tour-accent'),
      text(540, 34, 'Bare-metal Agent', 'tour-title'),
      box(390, 92, 300, 240, 'tour-ghost', 16),
      box(440, 166, 200, 76, 'tour-box tour-harness') + text(540, 199, 'Harness') + text(540, 223, 'Claude Code, Codex', 'tour-note'),
      text(540, 296, 'Nothing from Ronin', 'tour-note'),
      text(540, 362, 'The harness as it comes', 'tour-note'),
    ].join(''),
  },
  {
    id: 'toolkit', title: 'The Ronin toolkit',
    caption: 'Cowork Agents already know it. They talk to each other, hand in work for the lead to review, and track the work on epics and items (or your Jira).',
    svg: () => [
      text(120, 34, '1 · Talk', 'tour-title'), text(360, 34, '2 · Hand in', 'tour-title'), text(600, 34, '3 · Track', 'tour-title'),
      box(10, 54, 220, 320, 'tour-ghost', 12), box(250, 54, 220, 320, 'tour-ghost', 12), box(490, 54, 220, 320, 'tour-ghost', 12),
      // Talk: two Agents message each other and post to the wipeboard.
      tile(26, 84, 80, 'Agent'), tile(134, 84, 80, 'Agent'),
      arrow(108, 104, 132, 104), arrow(132, 122, 108, 122),
      text(120, 166, 'message', 'tour-note'),
      arrow(66, 140, 90, 214), arrow(174, 140, 150, 214),
      box(40, 216, 160, 100, 'tour-box') + text(120, 244, 'Wipeboard'),
      '<line class="tour-rule" x1="60" y1="264" x2="180" y2="264"/><line class="tour-rule" x1="60" y1="282" x2="160" y2="282"/><line class="tour-rule" x1="60" y1="300" x2="170" y2="300"/>',
      text(120, 352, 'and shared documents', 'tour-note'),
      // Hand in: worktree, lead review, shared branch.
      tile(275, 80, 170, 'Own worktree'), arrow(360, 134, 360, 168), text(372, 156, 'hand in', 'tour-note', 'start'),
      tile(275, 172, 170, 'Lead reviews'), arrow(360, 226, 360, 260), text(372, 248, 'promote', 'tour-note', 'start'),
      tile(275, 264, 170, 'Shared branch', 'tour-box tour-on'),
      text(360, 352, 'or sent back', 'tour-note'),
      // Track: an epic holds the items.
      box(506, 76, 188, 276, 'tour-box', 10) + text(600, 104, 'Epic'),
      chip(518, 122, 164, 'In progress'), chip(518, 166, 164, 'In review'), chip(518, 210, 164, '⚑ Waiting on you', 'tour-chip tour-chip-on'), chip(518, 254, 164, 'Done ✓'),
      text(600, 320, 'items: who does what', 'tour-note'),
    ].join(''),
  },
  {
    id: 'runs', title: 'How the work runs',
    caption: 'Teams do the work; epics and items keep track of it. A Team is a group of Agents in one Workspace, usually with a lead. An epic is one part of the plan, given to one Team; its items are what each Agent is doing now.',
    svg: () => [
      box(14, 20, 692, 366, 'tour-ghost', 16), text(34, 50, 'Workspace: one project, its folders and repositories', 'tour-note', 'start'),
      box(40, 120, 190, 190, 'tour-box', 10) + text(135, 150, 'Epic') + text(135, 174, 'what done looks like', 'tour-note'),
      chip(58, 198, 154, 'item'), chip(58, 244, 154, 'item'),
      arrow(234, 214, 290, 214, 'tour-wire tour-wire-on'), text(262, 202, 'given to', 'tour-note'),
      box(296, 76, 392, 286, 'tour-ring', 14) + text(316, 104, 'Team', 'tour-title', 'start'),
      tile(422, 112, 140, 'Lead', 'tour-box tour-on'),
      arrow(470, 166, 372, 222), arrow(492, 166, 492, 222), arrow(514, 166, 612, 222),
      tile(318, 226, 110, 'Agent'), tile(437, 226, 110, 'Agent'), tile(556, 226, 110, 'Agent'),
      chip(328, 300, 90, 'item'), chip(447, 300, 90, 'item'), chip(566, 300, 90, 'item'),
    ].join(''),
  },
  {
    id: 'give', title: 'Giving your Team work',
    caption: 'Open your Team, press its lead’s tile, and say what you want in its Chat or terminal. A Cowork lead splits it into items and shares them out.',
    svg: () => [
      person(80, 200), text(80, 270, 'You'),
      box(140, 150, 230, 64, 'tour-bubble', 14), '<path class="tour-bubble" d="M140,176 L118,190 L142,194 Z"/>',
      text(255, 188, '“Add a sign-up page”'),
      arrow(374, 182, 420, 182, 'tour-wire tour-wire-on'),
      tile(424, 156, 130, 'Lead', 'tour-box tour-on'), text(489, 236, 'Chat or terminal', 'tour-note'),
      arrow(556, 170, 592, 92), arrow(556, 182, 592, 182), arrow(556, 194, 592, 272),
      chip(596, 74, 110, 'item'), chip(596, 165, 110, 'item'), chip(596, 255, 110, 'item'),
      text(651, 330, 'shared out', 'tour-note'),
    ].join(''),
  },
  {
    id: 'back', title: 'When you come back',
    caption: 'Agents keep working while you are away: closing the browser does not stop them. When one needs your answer it raises a ⚑ on its item, and its Team and tile show it is waiting on you.',
    svg: () => [
      box(30, 90, 170, 120, 'tour-ghost', 10), '<line class="tour-rule" x1="30" y1="114" x2="200" y2="114"/>',
      `<path class="tour-wire" d="M95,140 L135,180 M135,140 L95,180"/>`, text(115, 246, 'You close the browser', 'tour-note'),
      tile(250, 70, 200, 'Agent · working'), tile(250, 132, 200, 'Agent · working'), tile(250, 194, 200, 'Agent · working'),
      text(350, 280, 'They keep going', 'tour-note'),
      box(500, 90, 196, 72, 'tour-box tour-on', 10) + text(598, 122, '⚑ Waiting on you') + text(598, 146, 'on its item and tile', 'tour-note-on'),
      box(500, 184, 196, 60, 'tour-bubble', 14) + text(598, 220, 'You answer in Chat'),
      arrow(40, 336, 680, 336), text(40, 366, 'away', 'tour-note', 'start'), text(680, 366, 'back', 'tour-note', 'end'),
    ].join(''),
  },
]);

/** The Tour surface: one drawing at a time, Back and Next, a count. `close` is Setup's (setup-view.js). */
export function createTourSurface(context) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('setup.tour_title', 'Ronin Tour'), className: 'setup-surface setup-tour' });
  const stage = document.createElement('figure');
  stage.className = 'setup-tour-stage';
  const heading = document.createElement('h2');
  heading.className = 'setup-tour-heading';
  const picture = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  picture.setAttribute('viewBox', `0 0 ${W} ${H}`);
  picture.setAttribute('class', 'setup-tour-picture');
  picture.setAttribute('role', 'img');
  const caption = document.createElement('figcaption');
  caption.className = 'setup-tour-caption';
  stage.append(heading, picture, caption);
  const foot = document.createElement('div');
  foot.className = 'setup-tour-foot';
  const count = document.createElement('span');
  count.className = 'setup-tour-count';
  let at = 0;
  const back = WorkspaceKit.primitives.createAction({ label: t('setup.tour_back', 'Back'), action: () => go(at - 1) });
  const next = WorkspaceKit.primitives.createAction({ label: t('setup.tour_next', 'Next'), kind: 'primary',
    action: () => (at < TOUR_PARTS.length - 1 ? go(at + 1) : context.environment?.closeTour?.()) });
  foot.append((back.el ?? back), count, (next.el ?? next));
  const go = (n) => {
    at = Math.max(0, Math.min(TOUR_PARTS.length - 1, n));
    const part = TOUR_PARTS[at];
    heading.textContent = `${at + 1} · ${part.title}`;
    picture.innerHTML = part.svg();
    picture.setAttribute('aria-label', part.title);
    caption.textContent = part.caption;
    count.textContent = `${at + 1} of ${TOUR_PARTS.length}`;
    (back.el ?? back).disabled = at === 0;
    (next.el ?? next).textContent = at === TOUR_PARTS.length - 1 ? t('setup.tour_close', 'Close the Tour') : t('setup.tour_next', 'Next');
  };
  surface.el.tabIndex = -1;
  surface.el.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') go(at + 1);
    else if (event.key === 'ArrowLeft') go(at - 1);
  });
  surface.content.append(stage, foot);
  go(0);
  return { el: surface.el, show: () => go(0) };
}
