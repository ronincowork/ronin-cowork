/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { status } from './ui.js';

/* ---------- KOSHI — the seventh commons pane (tab: 目 Koshi) ----------
 *
 * "Which model does each Koshi job ask?" — one row per incarnation, one dropdown per
 * row. That is the whole pane, and it is deliberately the whole pane: the choice is
 * three options wide and the interesting part is the consequence, not the control.
 *
 * The three outlets and the incarnations both come from the server
 * (`GET /api/koshi`), so this file names neither. When Reaper exists it appears here
 * because the server started listing it — not because anyone edited this pane.
 *
 * NOT SHOWN, EVER: an API key. An incarnation may name the env var that holds its key;
 * the value stays in the repo's .env and never crosses this boundary.
 *
 * Koshi reads its outlet when it starts, so a change here lands on the next
 * `libexec/koshi start` — said on screen rather than left for someone to discover.
 */
export function buildKoshi(root, isShowing) {
  let data = null;

  const head = document.createElement('div');
  head.className = 'ko-head';
  const blurb = document.createElement('div');
  blurb.className = 'ko-blurb';

  // IS IT RUNNING, AND A WAY TO START IT. Settings apply by themselves within half a
  // minute, so this is not how a change lands — it is for the case that cannot cover:
  // the watcher is not running at all, and there is nobody to ask.
  const restart = document.createElement('button');
  restart.className = 'ko-restart';
  restart.textContent = '↻ Restart Koshi';
  restart.title = 'Stop and start the watcher. Settings apply on their own; this is for when it is not running at all.';
  restart.addEventListener('click', async () => {
    const was = restart.textContent;
    restart.disabled = true;
    restart.textContent = 'restarting…';
    const r = await request('/api/koshi/restart', { method: 'POST' });
    if (!r.ok || !r.data.ok) {
      blurb.classList.add('bad');
      blurb.textContent = r.ok ? 'it did not come back up' : r.message;
    } else {
      data.running = r.data.running;
      say2();
    }
    restart.disabled = false;
    restart.textContent = was;
  });
  head.append(blurb, restart);

  const say2 = () => {
    blurb.classList.remove('bad');
    blurb.textContent = data?.running
      ? 'Which model each Koshi job asks. Changes apply within a minute — no restart needed.'
      : 'Koshi is NOT running. Nothing is watching any ladder.';
    blurb.classList.toggle('bad', !data?.running);
  };

  const list = document.createElement('div');
  list.className = 'ko-list';
  root.append(head, list);

  const say = (msg, bad) => {
    list.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'ko-empty' + (bad ? ' bad' : '');
    p.textContent = msg;
    list.appendChild(p);
  };

  /** One incarnation: what it is, and the outlet it asks. */
  const rowFor = (inc) => {
    const row = document.createElement('div');
    row.className = 'ko-row' + (inc.built ? '' : ' off');

    const name = document.createElement('div');
    name.className = 'ko-name';
    name.textContent = inc.label;
    const what = document.createElement('div');
    what.className = 'ko-what';
    what.textContent = inc.what;

    const pick = document.createElement('select');
    pick.className = 'ko-pick';
    for (const o of data.outlets) {
      const opt = new Option(o.built ? o.label : `${o.label} — not built`, o.id);
      opt.disabled = !o.built;
      opt.title = o.what;
      pick.add(opt);
    }
    // The fallback is the server's, not a guess made here: an incarnation with no
    // setting is running on the default, and the dropdown should say which.
    pick.value = data.choices[inc.id]?.outlet || 'koshi_external';
    pick.disabled = !inc.built;
    pick.title = inc.built ? 'Which outlet this job asks' : 'Not built yet';

    // THE SLIDER — three stops, and it is honest about being three stops: the labels
    // say Relaxed / Steady / Keen rather than pretending to a continuum. It scales the
    // whole cadence table at once, so the SHAPE holds: a riffing session is watched a
    // sixth as often as one cutting code at every setting.
    // ONLY THE WATCHER HAS A PACE. The other incarnations answer an event — a session
    // dies, is born, or asks — and an event has no rate, so a slider on those rows would
    // be a knob with nothing behind it.
    //
    // `!== false` rather than `=== true`: an older server that does not send the field
    // yet keeps the rows it already drew, instead of the slider vanishing everywhere the
    // moment this ships and reappearing after a restart.
    const paced = inc.paced !== false;
    const pace = document.createElement('input');
    pace.className = 'ko-pace';
    pace.type = 'range';
    pace.min = '0';
    pace.max = String((data.paces || []).length - 1);
    pace.step = '1';
    pace.disabled = !inc.built;
    const paceIdx = () => Math.max(0, (data.paces || []).findIndex((p) => p.id === (data.choices[inc.id]?.pace || 'steady')));
    pace.value = String(paceIdx());
    const paceLabel = document.createElement('div');
    paceLabel.className = 'ko-pacelabel';

    const note = status('ko-note');
    const chosen = () => data.outlets.find((o) => o.id === pick.value);
    const describe = () => note.say(inc.built ? (chosen()?.what ?? '') : 'Not built yet — nothing asks anything.');
    describe();

    const currentPace = () => (data.paces || [])[Number(pace.value)];
    const describePace = () => {
      const p = currentPace();
      paceLabel.textContent = p ? `${p.label} — ${p.what}` : '';
    };
    describePace();

    const save = async (msg) => {
      note.say('saving…', 'busy');
      const r = await request(`/api/koshi/${inc.id}`, {
        method: 'POST',
        json: {
          outlet: pick.value,
          model: data.choices[inc.id]?.model,
          pace: currentPace()?.id,
        },
      });
      if (!r.ok) {
        note.say(r.message, 'bad');
        pick.value = data.choices[inc.id]?.outlet || 'koshi_external';
        pace.value = String(paceIdx());
        describePace();
        return;
      }
      data.choices = r.data.choices;
      note.say(msg());
    };

    // The slider redraws its label as it moves and only saves when it is let go —
    // dragging across three stops should not be three writes.
    pace.addEventListener('input', describePace);
    pace.addEventListener('change', () => save(() => `${currentPace()?.label} — live within a minute.`));
    pick.addEventListener('change', () => save(() => `${chosen()?.label} — live within a minute.`));

    row.append(name, what, pick, note.el);
    if (paced) row.insertBefore(paceLabel, note.el), row.insertBefore(pace, paceLabel);
    return row;
  };

  const render = () => {
    say2();
    list.innerHTML = '';
    for (const inc of data.incarnations) list.appendChild(rowFor(inc));
  };

  const load = async () => {
    const r = await request('/api/koshi');
    if (!r.ok) {
      say(r.message, true);
      return;
    }
    data = r.data;
    render();
  };

  // Loaded when the tab is opened, not on a timer: nothing here changes on its own.
  return { enter: () => void load(), isShowing };
}
