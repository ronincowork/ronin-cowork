/* part of the tmux-ronin client — see js/README.md */
import { request } from './request.js';

/**
 * PROVENANCE — the mark that says a catalog entry is yours.
 *
 * Every catalog the commons renders is resolved from two files: the shipped one in the
 * install, and your own in the catalogs store, entry-merged by name (`docs/shadowing.md`).
 * The server puts `origin` and `shadowed` on every entry; this is the one place that
 * turns them into something on screen, so the four surfaces cannot drift apart.
 *
 * A MARK, NOT A BADGE. Stock is the overwhelming majority and gets NOTHING — silence is
 * the right rendering for "as shipped", and a badge on every row would be noise on the
 * common case to serve the rare one. Yours gets one glyph.
 *
 * Two states, because they are not the same fact:
 *   ◆  yours       — you added this; there was no shipped entry of the name.
 *   ◈  yours, changed — it stands in a SHIPPED entry's place. This is the one that
 *      matters: an upgrade improving that entry will not reach you, and nothing else
 *      on the screen would ever tell you so.
 */
export const isOwn = (e) => !!e && e.origin === 'user';

/** The mark for one entry, or null when it is stock and there is nothing to say. */
export function provMark(entry) {
  if (!isOwn(entry)) return null;
  const el = document.createElement('span');
  el.className = 'prov' + (entry.shadowed ? ' prov-shad' : '');
  el.textContent = entry.shadowed ? '◈' : '◆';
  el.title = entry.shadowed
    ? 'Yours — this replaces Ronin\'s shipped entry of the same name. Upgrades to that entry will not reach you.'
    : 'Yours — added by you, in your catalogs store. An upgrade cannot touch it.';
  return el;
}

/** Append the mark to a row, if there is one. Saves every caller the null check. */
export function addProvMark(el, entry) {
  const m = provMark(entry);
  if (m) el.append(m);
  return el;
}

/**
 * The "add your own" row that ends a catalog list.
 *
 * It creates the file and tells you where it is, and that is deliberately all. The front
 * door that actually gets used is a person telling their own agent *"add a session_job
 * that…"* — the file existing, with a header explaining the format, is what makes that
 * work. A form here would be a worse editor than the one they already have.
 */
export function addYourOwn(file, what, onDone) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'prov-add';
  btn.textContent = `＋ add your own ${what}`;
  btn.title = `Create your own ${file} in the catalogs store — yours, outside every repo, untouched by upgrades`;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const r = await request('/api/catalogs/seed', { method: 'POST', json: { file } });
    const say = document.createElement('div');
    if (!r.ok) {
      say.className = 'prov-said bad';
      say.textContent = 'could not create it — ' + r.message;
    } else {
      // The PATH is the answer — it is what you hand your agent, or open yourself.
      say.className = 'prov-said';
      say.textContent = r.data.created ? `made ${r.data.path} — edit it, or tell an agent to` : `yours is at ${r.data.path}`;
      if (onDone) onDone(r.data);
    }
    btn.after(say);
    btn.disabled = false;
  });
  return btn;
}
