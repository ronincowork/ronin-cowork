/* part of the ronin-cowork client — see js/README.md */
import { t } from './lexicon.js';

const el = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

function SECTIONS() {
  return [
    { key: 'type', title: t('help.type', 'New session'), body: t('help.type_body', 'Three kinds of thing can start here. A Cowork Agent is born into Ronin with this installation, its selected behaviours, reading and Team. A bare-metal Agent is the provider\u2019s own CLI and nothing else. A terminal is a shell with no agent in it at all.') },
    { key: 'top', title: t('help.top', 'Name & kind'), body: t('help.top_body', 'The name is the only thing you must give, and it is also the tag every session carries, so it is lowercase and typeable \u2014 the field enforces that as you type. A Team\u2019s title is written for you from the name and is yours to change. The kind says what this is for, and it narrows the templates below to the ones that suit it.') },
    { key: 'template', title: t('help.template', 'Template'), body: t('help.template_body', 'A template fills part of the form in and stops. Its answers become yours the moment they land \u2014 nothing stays linked, and you can change any of it. An Agent template is a loadout for one session; a Team template is a cast, and picking one lands its Agents as rows you can edit. Make your own fills nothing in, and going back to it empties what a template wrote.') },
    { key: 'objective', title: t('help.objective', 'Common instructions'), body: t('help.objective_body', 'What everyone born onto this Team is told. The objective reaches them: it is written into the brief every new Agent reads at birth, in the Team\u2019s own words.') },
    { key: 'instructions', title: t('help.instructions', 'Instructions'), body: t('help.instructions_body', 'What this one Agent should do, in your words. It arrives as the first thing it reads.') },
    { key: 'lead', title: t('help.agents', 'Agents'), body: t('help.agents_body', 'The Agents this Team is raised with. A row is short on purpose \u2014 a name and what that Agent does \u2014 and opens for its mandate when you want it. Raising creates the Team and then births every named row. A Team with no rows is ordinary and raises fine.') },
    { key: 'team', title: t('help.team', 'Team'), body: t('help.team_body', 'A new team is made first and the Agent is born into it. Joining an existing one lands that team\u2019s answers in this form, which you can then change. No team is ordinary \u2014 a r\u014dnin works alone and nothing is missing.') },
    { key: 'where', title: t('help.where', 'Who and where'), body: t('help.where_body', 'The provider and model that open, and the folder they open in. The folder is where work starts, not a fence: an Agent reaches whatever it is asked to reach.') },
    { key: 'mandate', title: t('help.mandate', 'Mandate'), body: t('help.mandate_body', 'How far this Agent goes before it checks in, whether it may build out a team, and what it hands back. Output takes as many answers as you mean \u2014 a plan AND the team AND no code \u2014 and nothing argues with a combination. Open means no requirement. None of it is enforced: the mandate is carried in the Agent\u2019s letter and read by it, not imposed on it.') },
    { key: 'loadout', title: t('help.loadout', 'Features and Behaviours'), body: t('help.loadout_body', 'Features add an available facility or taught practice. Behaviours are short documents about how the owner wants ordinary work done. Both are editable answers that are delivered at birth.') },
    { key: 'kit', title: t('help.kit', 'Shared toolkit'), body: t('help.kit_body', 'What every Agent raised on this Team starts with. All of it lands in the next Agent form as an ordinary editable value \u2014 none of it is a constraint, and changing it here never touches a session already running.') },
    { key: 'behaviours', title: t('help.behaviours', 'What a Behavior is'), body: t('help.behaviours_body', 'Behaviors are specific guidance given to Agents at birth. Write it Down, Planning, Team work, Visual Staging, and Working with the User are selectable; Auto Selected and Conditional Behaviors are applied by Ronin when their rules match.') },
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
  // AND THE BENCH ITSELF IS WATCHED. Help re-finds the form on `show`, but the form can be
  // swapped in the OTHER workspace without Help being placed again — put New Team where
  // New Agent was and Help went on describing the Agent's steps. Found by driving that
  // exact swap; nothing else would have shown it.
  const benchWatch = new MutationObserver(() => attach());
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
  const ALWAYS = new Map([['behaviours', ['loadout', 'kit']]]);
  const paintWhichExist = () => {
    const box = scroller();
    const live = new Set([...(box?.querySelectorAll('[data-step]') || [])]
      .filter((step) => !step.hidden && step.getBoundingClientRect().height)
      .map((step) => step.dataset.step));
    for (const [name, section] of sections) {
      const hosts = ALWAYS.get(name);
      section.hidden = live.size > 0 && (hosts ? !hosts.some((key) => live.has(key)) : !live.has(name));
    }
  };
  function attach() {
    const box = scroller();
    if (box === watching) return;
    watching?.removeEventListener('scroll', follow);
    stepWatch.disconnect();
    watching = box;
    watching?.addEventListener('scroll', follow, { passive: true });
    if (watching) stepWatch.observe(watching, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    paintWhichExist();
    follow();
  }

  return {
    el: surface.el,
    // The form can be seated, swapped or scrolled at any time, so Help re-finds it rather
    // than holding a reference that goes stale the first time a card is placed.
    show: () => {
      attach();
      benchWatch.observe(bench.host, { subtree: true, childList: true });
      window.setTimeout(() => { attach(); paintWhichExist(); }, 400);
    },
    destroy: () => { watching?.removeEventListener('scroll', follow); stepWatch.disconnect(); benchWatch.disconnect(); watching = null; },
  };
}
