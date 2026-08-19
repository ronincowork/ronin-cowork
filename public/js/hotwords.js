/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { button, field, status } from './ui.js';

/**
 * the commons' ▥ Hotwords pane — the words dictation keeps getting wrong.
 *
 * Terms a general speech model has never heard, sent with your voice so the
 * transcriber writes them instead of writing something that sounds like them. Ronin's
 * own nouns are Japanese and invented, so an English engine renders `ctx` as CHIZU and
 * TEGAMI as "the gummy", and whoever reads the transcript has to guess.
 *
 * A LIST, NOT A FILE. This started as a textarea over `ronin_catalogs/HOTWORDS.md` on the
 * argument that a list of words does not need a row editor. That was wrong on the
 * surface that matters most: adding one word meant finding your place in markdown with
 * an iOS keyboard over the top of it. A row per term with an ✕, and one field to add,
 * is fewer taps AND less to look at — the file is still there for rearranging the
 * groups by hand.
 *
 * Every write returns the resulting list and the server re-renders from THAT, never
 * from what the client hoped it did. One parser, on the server, always.
 */
export function buildHotwords(pane, isShowing) {
  const wrap = document.createElement('div');
  wrap.className = 'hot';

  // -- add --
  const addRow = document.createElement('div');
  addRow.className = 'hot-add';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'a word it keeps getting wrong';
  input.autocapitalize = 'off';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocorrect', 'off');
  const inputField = field(input, { label: 'a word dictation keeps getting wrong' });
  const addBtn = button('Add', { cls: 'hot-addbtn' });
  addRow.append(inputField.el, addBtn);

  const count = document.createElement('div');
  count.className = 'hot-count';
  count.textContent = 'loading…';

  // WHOSE LIST IS THIS. Hotwords is the one catalog that is copy-on-write rather than
  // an entry-merge (docs/shadowing.md): until your first edit you are reading Ronin's
  // shipped list; after it, your file IS the list and new stock words will not reach
  // you. That is worth one line, because nothing else on this tab would ever say it.
  const whose = document.createElement('div');
  whose.className = 'hot-whose';

  const list = document.createElement('div');
  list.className = 'hot-list';

  // Only ever an error or nothing: a list that re-renders from the server IS the
  // confirmation, so "saved" would be noise on every tap.
  const msg = status();

  wrap.append(addRow, msg.el, count, whose, list);
  pane.appendChild(wrap);

  const setMsg = (text, bad) => msg.say(text, bad ? 'bad' : '');

  const render = (terms) => {
    list.innerHTML = '';
    count.textContent = terms.length
      ? `${terms.length} word${terms.length === 1 ? '' : 's'} sent with your voice`
      : 'no words yet — dictation runs unbiased';
    for (const t of terms) {
      const row = document.createElement('div');
      row.className = 'hot-row';
      const w = document.createElement('span');
      w.textContent = t;
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'hot-x';
      x.textContent = '✕';
      x.title = `Remove ${t}`;
      x.addEventListener('click', () => post('/api/hotwords/remove', t, x));
      row.append(w, x);
      list.appendChild(row);
    }
  };

  /** Every mutation goes through here: disable, call, re-render from the response. */
  const post = async (url, term, btn) => {
    if (btn) btn.disabled = true;
    setMsg('');
    const r = await request(url, { method: 'POST', json: { term } });
    if (!r.ok) {
      setMsg(r.message, true);
      if (btn) btn.disabled = false;
      return;
    }
    render(r.data.terms || []);
  };

  const add = () => {
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    post('/api/hotwords/add', t, addBtn).then(() => {
      addBtn.disabled = false;
      // Stay in the field: adding words is something you do several of at a time.
      input.focus();
    });
  };
  addBtn.addEventListener('click', add);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  });

  const enter = async () => {
    const r = await request('/api/hotwords');
    if (!r.ok) {
      count.textContent = 'could not load';
      setMsg(r.message, true);
      return;
    }
    render(r.data.terms || []);
    whose.textContent = r.data.own
      ? '◆ your list — an upgrade cannot touch it, and will not add to it either'
      : 'Ronin\'s stock list — your first edit makes a copy that is yours';
    whose.classList.toggle('own', !!r.data.own);
    setMsg('');
  };

  return { enter, isShowing };
}
