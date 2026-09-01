/* part of the ronin-cowork client — see js/README.md */
/**
 * THE HELP WORKSPACE — what each step means, beside the step you are on.
 *
 * The owner asked for it as the third card on the Launch bench (2026-09-01): "a third
 * kanban card in the middle, which is help or instructions… Let's say in workspace one I
 * have new team, and in workspace two I put the help form. I should be able to scroll up
 * and down the form, and the help should scroll up and down so I can see what the
 * descriptions are of different things." That is what this is for, and it is why the
 * Launch bench is the LONG form: it is the first-time surface, reached from the root page,
 * where a person is learning what Ronin can do rather than starting their fifth Agent.
 *
 * WHY THE HELP LIVES HERE AND NOT UNDER EACH FIELD. Every "optional" sentence and every
 * explanatory line was cut from the forms themselves at the owner's word — the form is for
 * answering, not for reading. The explanations did not stop being true; they moved to a
 * surface you open when you want them and close when you do not.
 *
 * HOW IT FOLLOWS THE FORM. It watches the form surface's own scroller and asks which step
 * is nearest its top, then marks that section current and brings it into view. No API on
 * the forms and no shared state: a step already carries `data-step`, which is the only
 * thing the two sides need to agree on.
 */
import { t } from './lexicon.js';

const el = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

/** One entry per step key either form uses; shared keys are written for both.
 *  A FUNCTION, not a const table: a table of words built at import time freezes the stock
 *  wording before a lexicon is up (KOKUGO § 5), and check-modules refuses it. */
function SECTIONS() {
  return [
    { key: 'type', title: t('help.type', 'New session'), body: t('help.type_body', 'Three kinds of thing can start here. A Cowork Agent is born into Ronin and gets the floor, its routines, its reading and its team. A bare-metal Agent is the provider’s own CLI and nothing else. A terminal is a pane with no agent in it at all. The choice decides which of the steps below exist — a terminal is asked three things because there are only three to ask.') },
    { key: 'top', title: t('help.top', 'Name & kind'), body: t('help.top_body', 'The name is the only thing you must give. It is also the tag every session carries, so it is lowercase and typeable — the field enforces that as you type. A Team’s title is written for you from the name and is yours to change. The kind says what this is for, and it narrows the templates below to the ones that suit it.') },
    { key: 'template', title: t('help.template', 'Template'), body: t('help.template_body', 'A template fills part of the form in and stops. Its answers become yours the moment they land — nothing stays linked, and you can change any of it. Make your own fills nothing in, and going back to it empties what a template wrote.') },
    { key: 'objective', title: t('help.objective', 'Common instructions'), body: t('help.objective_body', 'What everyone born onto this Team is told. The objective reaches them: it is written into the brief every new Agent reads at birth, in the Team’s own words.') },
    { key: 'instructions', title: t('help.instructions', 'Instructions'), body: t('help.instructions_body', 'What this one Agent should do, in your words. It arrives as the first thing it reads.') },
    { key: 'team', title: t('help.team', 'Team'), body: t('help.team_body', 'A new team is made first and the Agent is born into it. Joining an existing one lands that team’s answers in this form, which you can then change. No team is ordinary — a rōnin works alone and nothing is missing.') },
    { key: 'where', title: t('help.where', 'Who and where'), body: t('help.where_body', 'The provider and model that open, and the folder they open in. The folder is where work starts, not a fence: an Agent reaches whatever it is asked to reach. A Team’s branch is the line its Agents hand work in to, and the lead promotes from it; blank means the Team’s own line.') },
    { key: 'mandate', title: t('help.mandate', 'Mandate'), body: t('help.mandate_body', 'How far this Agent goes before it checks in, whether it may build out a team, and what it hands back. Open leads every one and means no requirement — it is not a gap.') },
    { key: 'loadout', title: t('help.loadout', 'Tools and skills'), body: t('help.loadout_body', 'Launch mode decides what Ronin appends to the command that starts this Agent. Routines are resolved above and shown here with where each answer came from. Behaviours are documents you hand it at birth: the house’s own procedures, and the ways of working it can take.') },
    { key: 'kit', title: t('help.kit', 'Shared toolkit'), body: t('help.kit_body', 'What every Agent raised on this Team starts with. All of it lands in the next Agent form as an ordinary editable value — none of it is a constraint, and changing it here never touches a session already running.') },
    { key: 'lead', title: t('help.lead', 'Team lead'), body: t('help.lead_body', 'A lead is an offer, not a seat: a brief and a mandate that become a launch. Membership is never stored — a Team’s members are the live sessions carrying its tag.') },
  ];
}

/** The form surface sharing this bench, whichever of the two is seated. */
const formSurface = (host) => host.querySelector('[data-workbench-surface="launch.agent"], [data-workbench-surface="launch.team"]');

export function createLaunchHelpView(kit, { bench }) {
  const { createSurface } = kit.primitives;
  const surface = createSurface({ label: t('help.title', 'Help'), className: 'lh-surface' });
  const body = el('div', 'lh-body');
  const sections = new Map();
  for (const section of SECTIONS()) {
    const box = el('section', 'lh-section');
    box.dataset.help = section.key;
    box.append(el('h3', null, section.title), el('p', null, section.body));
    sections.set(section.key, box);
    body.append(box);
  }
  surface.content.append(body);

  let watching = null;
  let current = '';
  // The session type decides which steps EXIST, and choosing one is not a scroll — so the
  // step set has to be watched, not merely read when the surface is seated. Without this,
  // picking Terminal left Help offering eight sections for a form that had three.
  const stepWatch = new MutationObserver(() => paintWhichExist());
  // `:scope >` and not a bare descendant query: a form surface contains other surfaces'
  // content divs, and the first match is not reliably the one that scrolls.
  const scroller = () => formSurface(bench.host)?.querySelector(':scope > .wk-surface-content') || null;

  /** Which step sits nearest the top of the form's own scroller. */
  const stepAtTop = () => {
    const box = scroller();
    if (!box) return '';
    const top = box.getBoundingClientRect().top;
    let best = '';
    let bestGap = Infinity;
    for (const step of box.querySelectorAll('[data-step]')) {
      if (step.hidden || !step.getBoundingClientRect().height) continue;
      const gap = Math.abs(step.getBoundingClientRect().top - top);
      if (gap < bestGap) { bestGap = gap; best = step.dataset.step; }
    }
    return best;
  };
  const follow = () => {
    const key = stepAtTop();
    if (!key || key === current) return;
    current = key;
    for (const [name, box] of sections) box.dataset.current = String(name === key);
    // Only the sections a form actually has are shown, so Help never offers a step that
    // is not on the bench — a terminal launch has three, and Help shows three.
    sections.get(key)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const paintWhichExist = () => {
    const box = scroller();
    const live = new Set([...(box?.querySelectorAll('[data-step]') || [])]
      .filter((step) => !step.hidden && step.getBoundingClientRect().height)
      .map((step) => step.dataset.step));
    for (const [name, section] of sections) section.hidden = live.size > 0 && !live.has(name);
  };
  const attach = () => {
    const box = scroller();
    if (box === watching) return;
    watching?.removeEventListener('scroll', follow);
    stepWatch.disconnect();
    watching = box;
    watching?.addEventListener('scroll', follow, { passive: true });
    if (watching) stepWatch.observe(watching, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    paintWhichExist();
    follow();
  };

  return {
    el: surface.el,
    // The form can be seated, swapped or scrolled at any time, so Help re-finds it rather
    // than holding a reference that goes stale the first time a card is placed.
    show: () => { attach(); window.setTimeout(() => { attach(); paintWhichExist(); }, 400); },
    destroy: () => { watching?.removeEventListener('scroll', follow); stepWatch.disconnect(); watching = null; },
  };
}
