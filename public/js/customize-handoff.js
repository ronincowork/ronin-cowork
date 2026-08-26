/* part of the ronin-cowork client — see js/README.md */
/**
 * CUSTOMIZE — the guided agent handoff, and the read-only sentence that replaces it.
 *
 * THE HANDOFF IS NOT A LESSER EDITOR. The front door that actually gets used is a person
 * telling their own agent *"add a session_role that…"*; the file existing, with a header
 * explaining its format, is what makes that work. So this makes the owner's file exist,
 * says where it is, and hands over a briefed instruction. A form here would be a worse
 * editor than the one they already have.
 *
 * IT STATES THE SHADOW TRADE BEFORE THE FACT. Editing a shipped entry makes it yours, and
 * an upgrade improving that entry stops reaching you. Nothing else on the screen would
 * ever say so, and after the edit is too late — so the warning sits on the button.
 *
 * WHERE THERE IS NO SEED PATH, THE DIRECTORY'S README IS THE WORKED EXAMPLE. The three
 * definition directories ship one each and every one states its field list; `seed` covers
 * five markdown catalogs and no definition directory, so those resources get the path and
 * the format rather than a created file.
 */
import { addYourOwn } from './provenance.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';


const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
};

// A function, not a constant: the lexicon loads after this module is evaluated.
function shadowTrade() {
  return t('customize.shadow_trade', 'Changing one of Ronin’s own entries makes it yours: it moves to your catalogs store, '
  + 'where an upgrade cannot touch it — and improvements Ronin makes to that entry will not '
  + 'reach you. That is the trade for owning it.');
}

export function buildHandoff(resource, list = []) {
  const { createNotice } = WorkspaceKit.primitives;
  const box = el('section', 'cz-write');
  box.append(el('h3', null, t('customize.handoff_head', 'Making it yours')));

  if (resource.capability === 'read-only') {
    // Read-only is a decision about this release, not a claim the resource is immutable.
    // Say how the owner changes it, and do not draw a disabled control.
    box.append(el('p', null,
      t('customize.handoff_read_only_shelf', 'This preview reads this shelf and does not write it. Your own agent can change it '
      + 'directly — tell it what you want and it edits the file.')));
    return box;
  }

  if (resource.capability === 'deferred') {
    box.append(el('p', null, resource.why || t('customize.handoff_deferred', 'Deferred in this preview.')));
    return box;
  }

  box.append(createNotice({ message: shadowTrade() }).el);

  if (resource.file) {
    // A shadowable markdown catalog: the seed route makes the file and hands back the path.
    box.append(el('p', null,
      t('customize.handoff_seed', 'Ronin can create your own {file} in your catalogs store — outside every repo, untouched by upgrades. The path is the answer: hand it to your agent, or open it yourself.', { file: resource.file })));
    box.append(addYourOwn(resource.file, resource.what || t('customize.entry', 'entry')));
    return box;
  }

  if (resource.dir) {
    // A definition directory: no seed path exists, so the README is the worked example.
    box.append(el('p', null,
      t('customize.handoff_read_only', 'One file per {thing}, named by its token, in your catalogs store under {dir}. Ronin cannot create that file for you yet — ask your agent to add one, and point it at the directory’s own README, which states the format and every field.', { thing: resource.label.toLowerCase().replace(/s$/, ''), dir: resource.dir })));
    const hint = el('p', 'cz-hint',
      t('customize.handoff_store_hint', 'Ask for the store path with: bin/ronin-store catalogs — never spell it by hand.'));
    box.append(hint);
    return box;
  }

  box.append(el('p', null, t('customize.handoff_ask_agent', 'Ask your agent to add one.')));
  return box;
}
