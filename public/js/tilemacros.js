/* part of the ronin-cowork client — see js/README.md */
import { macroData } from './home.js';
import { toast } from './ui.js';
import { IS_TOUCH, S } from './state.js';
import { closeTileMore, fitDropToTile } from './tilemore.js';
import { addProvMark } from './provenance.js';
import { t } from './lexicon.js';

/**
 * The ⚡ button on a TILE header: the fast path for session_macros.
 *
 * It PREFILLS and stops — `+forkit: ` lands in the input you are typing in, mid
 * sentence, and you add your own words before sending. It never runs anything.
 * That is the whole point: the text it inserts is text you could have typed, so
 * after a few uses you type it yourself, including from a pane or a phone where
 * no menu exists. A menu that executed would hide the syntax forever.
 *
 * Prefill needs no server capability — every surface already has a way to put
 * characters somewhere without submitting them:
 *   compose overlay open  -> append into the textarea (touch types here)
 *   unlocked tile         -> append to the parked buffer, shown in the strip
 *   locked tile           -> sendRaw(), which is `{t:'i'}` with no Enter
 *
 * A TEACHING SURFACE SINCE 2026-08-17, and that is what the shape below is about.
 * The drop used to be every macro in the catalog, one dense `+name:` row each, the
 * explanation on hover. The owner: *"it's just very ugly… I would rather have four
 * macros and have larger buttons. These should be headlines, and the boxes are big
 * enough that you can actually describe in them what that means, so people can then
 * go, 'Oh, I see.'"* So three things changed together and none of them stands alone:
 *
 *   - FOUR, not thirteen. `preview: yes` in the catalog entry is the only way onto
 *     this drop (src/macros.ts). *"If we have too many, people just don't get
 *     educated."* Nothing is hidden from an agent — every macro still runs.
 *   - NO `+name:` ON THE FACE. The headline is the catalog's `label:`, plain words.
 *     The invocation moved to the help box, which is where the syntax is still
 *     learnable without being what you read first.
 *   - THE BODY COPY IS ALWAYS VISIBLE, never on hover. The owner confirmed it
 *     directly, and he reads Ronin on a phone, where hover does not exist.
 *
 * A CATALOG ENTRY IS WRITTEN TWICE, FOR TWO READERS (owner, 2026-08-17). The prose under
 * a `## name` heading in MACROS.md is the AGENT'S instruction — it opens with the rule the
 * agent must not break — and `label:`/`blurb:` are the PERSON'S copy. This file renders only
 * the second pair. It never renders `instruction`, not even as a fallback; see render().
 *
 * The reference — the whole instruction, every macro, the ones not previewed
 * included — is `ronin_catalogs/MACROS.md`.
 */
/** Catalog blurbs are markdown, and a card renders none of it — `**bold**` and
 *  backticks arrive as literal punctuation. Strip the syntax, keep the words. */
const plain = (s) =>
  (s || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

export function buildTileMacros(tile) {
  const btn = document.createElement('button');
  btn.className = 'tmac-btn';
  btn.textContent = '⚡';
  btn.title = t('macros.button_title', 'Macros — drop one into this session\'s input');

  const menu = document.createElement('div');
  menu.className = 'tmac';

  const close = () => menu.classList.remove('open');

  // Where the text goes, in the order a surface takes precedence. Returns false
  // when there is nowhere to put it (no session showing) so the click can say so
  // instead of silently doing nothing.
  const prefill = (text) => {
    // Touch types in the tile's composer — the one box on the phone. This used to
    // append into the compose OVERLAY's textarea, which was a different box from the
    // one under your thumb, so a macro you picked appeared somewhere you were not
    // looking. The overlay is gone; there is one place text can land.
    if (IS_TOUCH && tile.composerTa) {
      tile.composerTa.value += text;
      tile.composerTa.dispatchEvent(new Event('input')); // let it grow
      tile.composerTa.focus();
      return true;
    }
    if (!tile.session) return false;
    if (tile.locked) {
      tile.sendRaw(text);
      if (!IS_TOUCH) tile.focusTerminal();
    } else {
      tile.pending += text;
      tile.renderPending();
    }
    return true;
  };

  /**
   * BACKOFF for the macros that fire. The button presses Enter for you, so a second
   * tap is a second interruption of an agent that is already doing the thing — and
   * an impatient triple-tap would queue three of them into the pane. One send, then
   * the row is spent for COOLDOWN_MS and says so.
   *
   * Per tile and per macro, in memory: it guards a finger, not a policy, and it is
   * meant to expire when you reload. The one thing it must not do is silently
   * swallow the tap — a button that looks like it did nothing gets tapped again.
   */
  const COOLDOWN_MS = 120000;
  const firedAt = new Map();
  const coolingFor = (name) => {
    const left = COOLDOWN_MS - (Date.now() - (firedAt.get(name) ?? -Infinity));
    return left > 0 ? Math.ceil(left / 1000) : 0;
  };

  /** Type a line into the session and submit it. The Enter is a SEPARATE, delayed
   *  keypress — TUIs like Claude Code treat a trailing \r in the same write as part
   *  of the paste and do not submit (the compose trick, same as dvrInput). */
  const fire = (text) => {
    if (!tile.session) return false;
    tile.sendRaw(text);
    setTimeout(() => tile.sendRaw('\r'), 40);
    return true;
  };

  const render = () => {
    menu.innerHTML = '';
    // `preview: yes` in the catalog entry, and nothing else, puts a macro here.
    const shown = (macroData || []).filter((m) => m.preview);
    for (const m of shown) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'tmac-row' + (m.send ? ' sends' : '');
      const nm = document.createElement('b');
      // The concise command-shaped headline — and a ⏎ for a macro that FIRES, because
      // pressing Enter into a working session is not the same act as dropping text in
      // the box, and the face has to say which one this is.
      nm.textContent = (m.label || m.name) + (m.send ? ' ⏎' : '');
      // The mark rides on the headline, exactly as it does on the launcher's kind
      // buttons — a macro of yours, or one of ours you replaced (js/provenance.js).
      addProvMark(nm, m);
      // Body copy, ALWAYS VISIBLE, and it is `blurb:` or it is nothing.
      //
      // NO FALLBACK TO `instruction` (owner, 2026-08-17 — *"we need to split out the
      // description and the agent instruction into two different things because they don't
      // overlap"*). Until today this line read `m.blurb || plain(m.description)`, so a
      // previewed entry with no blurb showed the agent's own instruction to a person:
      // `forkit` would have greeted them with "Owner-invoked only — never fork on your own
      // initiative", a prohibition addressed to somebody else that teaches the reader nothing
      // about what the button does. Falling back IS the overlap the owner is splitting.
      //
      // So what does a blurbless card say? Stock entries cannot get here — check-catalogs
      // fails MACROS.md if any entry lacks `label:`/`blurb:`. The real case is a macro of the
      // OWN OWNER'S, in their own catalogs file (js/provenance.js exists for exactly that),
      // marked `preview: yes` with no blurb written. That card is label-only plus one quiet,
      // honest line naming the gap and the fix — not a blank under the headline (which reads
      // as broken), not the instruction, and not a guess at what their macro does.
      const why = document.createElement('small');
      why.textContent = plain(m.blurb) || t('macros.no_blurb', 'no blurb yet — add a blurb: line to its MACROS.md entry');
      row.append(nm, why);
      // THE INVOCATION IS THE ACCESSIBLE NAME, and it is deliberately not a `title`.
      //
      // It was one until 2026-08-18 — off the face by the owner's ruling, kept learnable in
      // the help box. But a card ALREADY says what it does, in two always-visible lines
      // (`nm` and `why`), so the box repeated the answer and then laid 300px of it across
      // the cards underneath. Owner: *"its dumb to have the hover description covering the
      // button description."* Same ruling as the Commons tabs got that morning: a control
      // that names itself on its face does not want a pop-up naming it again.
      //
      // So it moves to `aria-label` rather than being deleted. `tips.js` takes over any
      // `title` it finds, so a title is a pop-up here by definition; an accessible name is
      // not, and it keeps the invocation learnable for a screen reader — which is also the
      // reader who most needs to know this button types `+name:` rather than doing a thing.
      // The face stays the owner's plain words either way.
      row.setAttribute('aria-label', m.send
        ? t('macros.aria_send', '{label} — +{name} ⏎, typed into the session and sent for you', { label: m.label || m.name, name: m.name })
        : t('macros.aria_drop', '{label} — +{name}: dropped into the input for you to finish', { label: m.label || m.name, name: m.name }));
      const cool = m.send ? coolingFor(m.name) : 0;
      if (cool) {
        row.disabled = true;
        // The blurb's place, not an appendix to the headline: a spent button explaining
        // what it does is less use than one explaining why it will not go.
        why.textContent = t('macros.cooldown', 'sent — wait {s}s before sending it again', { s: cool });
      }
      row.addEventListener('click', () => {
        if (m.send) {
          if (coolingFor(m.name)) return;
          close();
          // The toast, not an alert — an alert over a live pane steals the keyboard
          // (docs/ui.md), and this is exactly a tile-scoped outcome.
          if (!fire(m.send)) toast('open a session in this tile first', false);
          else firedAt.set(m.name, Date.now());
          return;
        }
        close();
        if (!prefill('+' + m.name + ': ')) toast('open a session in this tile first', false);
      });
      menu.appendChild(row);
    }
    // Two ways to be empty and one sentence for both — the catalog has not loaded, or
    // nothing in it is marked `preview: yes`. Either way the fix is the same file.
    if (!shown.length) menu.textContent = t('macros.none_previewed', 'no macros previewed — see MACROS.md');
  };

  /**
   * THE TILE CLIPS, so the drop must know how tall its tile is.
   *
   * `.tile` is `overflow: hidden` and this menu hangs off `.tile-head` inside it, so a
   * drop taller than the room below the header is not "overflowing" — it is CUT, with no
   * scrollbar and no sign that anything is missing. Measured 2026-08-17 at four tiles up:
   * the fourth card lost its bottom half, which is the exact failure a teaching surface
   * cannot survive. The 2×2 wrap in style.css keeps it short enough in the ordinary case;
   * this is the guarantee, for a short tile, a long blurb, or a fifth previewed macro.
   *
   * No CSS length can say it — `60vh` is the window, `100%` is the header's own 35px, and
   * `cqh` needs size containment the tile deliberately does not have. So it is measured,
   * at OPEN time rather than once: the grid count, the window and the phone's keyboard all
   * resize a tile under a menu that is not showing.
   *
   * THE MEASUREMENT MOVED to `tilemore.js` on 2026-08-18, when 📄 became the second drop off
   * this header needing the same guarantee (`tiledocs.js`). The reasoning stays here, where
   * the failure was measured; the arithmetic is shared, because two copies of one number
   * are one edit away from disagreeing.
   */
  const fitToTile = () => fitDropToTile(btn, menu);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.classList.contains('open');
    // メ sits immediately to ⚡'s right since 2026-08-17 and its drop anchors to the same
    // corner of the same header, so leaving it up puts two panels on one spot. Through
    // `closeTileMore` rather than a `.tmore.open` class sweep: four tiles build four メ
    // buttons and each carries its own `aria-expanded`, which a class sweep leaves lying.
    closeTileMore();
    // 📄's doc list anchors to that same corner (2026-08-18) — same sweep, same reason.
    document.querySelectorAll('.tmac.open, .tdocs.open').forEach((m) => m.classList.remove('open'));
    if (open) return;
    render();
    menu.classList.add('open');
    fitToTile();
  });
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return { btn, menu };
}
