/* part of the ronin-cowork client — see js/README.md */
/**
 * JOB CLASSES — the owner's shelves over the ＋ New kind board.
 *
 * Drawn as collapsible groupings, NAMED classes by ruling (KOTOBA § LAUNCHER): `group`
 * is the roster's addressing word (`+tag:` resolves to live members) and a job class
 * addresses nothing — no API resolves one, no behavior branches on one. Membership
 * lives in the JOB_CLASSES.md side manifest (src/catalog.ts): never the shipped
 * catalog, so an upgrade cannot clobber a shelf and a shelf cannot pin a house job to
 * a stale entry. An absent manifest answers the two shipped shelves.
 *
 * THE ROSTER'S OWN GRAMMAR, on purpose (js/roster.js): dragging a job onto a shelf
 * ADDS it there — `copy`, never a move, because a job may sit on several shelves —
 * and the ✎ editor is the same multi-toggle the drag cannot express: it is where
 * membership is REMOVED, and it is what keeps every edit reachable on touch, exactly
 * the split the roster makes with its 🏷 editor.
 */
import { request } from './request.js';
import { toast } from './ui.js';

const DRAG_TYPE = 'application/x-ronin-job';

/** Make a kind button a drag source. The payload is the job's name and nothing else. */
export function draggableJob(b, name) {
  b.draggable = true;
  b.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(DRAG_TYPE, name);
    e.dataTransfer.setData('text/plain', name);
    b.classList.add('dragging');
  });
  b.addEventListener('dragend', () => b.classList.remove('dragging'));
}

/* Which shelves are folded — a per-device viewing preference, like the tile layout,
 * so it lives in this browser and never in the manifest. */
const FOLD_KEY = 'ronin.jobClassesClosed';
const foldedClasses = () => {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
};
const rememberFold = (name, open) => {
  try {
    const closed = new Set(foldedClasses());
    if (open) closed.delete(name); else closed.add(name);
    localStorage.setItem(FOLD_KEY, JSON.stringify([...closed]));
  } catch (_) {
    /* storage denied — the fold simply does not persist */
  }
};

/**
 * @param {object} deps
 * @param {(k: object) => HTMLElement} deps.jobButton  the launcher's own kind button
 * @param {() => object[]} deps.allJobs  the catalog as the launcher holds it
 * @param {() => void} deps.onChange  rebuild the board (shelves AND the loose tail)
 * @returns {{wrap: HTMLElement, add: HTMLElement, render: () => Set<string>}}
 */
export function buildJobShelves({ jobButton, allJobs, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'ks-classes';
  const add = document.createElement('form');
  add.className = 'ks-class-add';
  // SAID "job group" ON THE SURFACE, `job_class` in every internal name (owner,
  // 2026-08-21: "call it job_scope? and still show it as Job Groups", then the class
  // ruling) — the display borrows the familiar word, the vocabulary keeps the roster's
  // `group` unambiguous. KOTOBA § LAUNCHER records the split once.
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 32;
  input.placeholder = 'job group';
  input.setAttribute('aria-label', 'New job group name');
  input.autocapitalize = 'off';
  input.autocomplete = 'off';
  input.spellcheck = false;
  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.textContent = '＋ add new';
  const msg = document.createElement('span');
  msg.className = 'ks-class-msg';
  add.append(input, btn, msg);

  let classes = [];
  const save = async (next) => {
    const r = await request('/api/job-classes', { method: 'PUT', json: { classes: next } });
    if (!r.ok) {
      toast(r.message, false);
      return false;
    }
    classes = r.data.classes;
    onChange();
    return true;
  };
  void (async () => {
    const r = await request('/api/job-classes');
    if (r.ok && Array.isArray(r.data.classes) && r.data.classes.length) {
      classes = r.data.classes;
      onChange();
    }
  })();

  add.addEventListener('submit', async (e) => {
    e.preventDefault();
    // The roster's own group-name rule (js/roster.js cleanGroup) — one rule, two boards.
    const name = String(input.value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    if (!name) {
      msg.textContent = 'use letters, digits, - or _';
      input.focus();
      return;
    }
    if (classes.some((c) => c.name === name)) {
      msg.textContent = `"${name}" already exists`;
      return;
    }
    msg.textContent = '';
    if (await save([...classes, { name, jobs: [] }])) {
      input.value = '';
      msg.textContent = `drag a job onto ${name}`;
    }
  });

  /** Which jobs sit on ONE shelf — a multi-toggle in the job menu's own clothes
   * (js/widgets.js openJobMenu: same anchoring, same dismissal grammar), staying open
   * across clicks because shelving is several toggles in a row. */
  const openEditor = (anchor, className) => {
    document.querySelector('.job-menu')?.remove();
    const m = document.createElement('div');
    m.className = 'job-menu';
    const cls = () => classes.find((c) => c.name === className);
    for (const k of allJobs()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'job-opt' + (cls()?.jobs.includes(k.name) ? ' on' : '');
      b.append(
        Object.assign(document.createElement('i'), { textContent: k.icon }),
        Object.assign(document.createElement('span'), { textContent: k.label }),
      );
      b.title = k.remit || k.blurb || '';
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const c = cls();
        if (!c) return;
        const jobs = c.jobs.includes(k.name) ? c.jobs.filter((j) => j !== k.name) : [...c.jobs, k.name];
        if (await save(classes.map((x) => (x.name === className ? { ...x, jobs } : x)))) {
          b.classList.toggle('on', jobs.includes(k.name));
        }
      });
      m.appendChild(b);
    }
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'job-opt none';
    del.textContent = `✕ delete "${className}"`;
    del.title = 'Remove this shelf — the jobs on it are untouched';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await save(classes.filter((x) => x.name !== className))) m.remove();
    });
    m.appendChild(del);
    document.body.appendChild(m);
    const a = anchor.getBoundingClientRect();
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    m.style.left = Math.round(Math.max(4, Math.min(a.left, window.innerWidth - w - 4))) + 'px';
    m.style.top = Math.round(a.bottom + 4 + h > window.innerHeight ? Math.max(4, a.top - h - 4) : a.bottom + 4) + 'px';
    setTimeout(() => {
      const away = () => {
        m.remove();
        document.removeEventListener('click', away);
        document.removeEventListener('keydown', esc, true);
      };
      const esc = (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        away();
      };
      document.addEventListener('click', away);
      document.addEventListener('keydown', esc, true);
    }, 0);
  };

  const shelf = (c, members) => {
    const d = document.createElement('details');
    d.className = 'ks-class';
    d.open = !foldedClasses().includes(c.name);
    const sum = document.createElement('summary');
    sum.append(
      Object.assign(document.createElement('b'), { textContent: c.name }),
      Object.assign(document.createElement('span'), { className: 'ks-class-n', textContent: String(members.length) }),
    );
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'ks-class-edit';
    edit.textContent = '✎';
    edit.title = `Choose which jobs are shelved under "${c.name}" — also where a job leaves a shelf`;
    edit.addEventListener('click', (e) => {
      e.preventDefault(); // a button inside <summary> must not toggle the fold
      e.stopPropagation();
      openEditor(edit, c.name);
    });
    sum.appendChild(edit);
    const grid = document.createElement('div');
    grid.className = 'ks-grid';
    for (const k of members) grid.appendChild(jobButton(k));
    d.append(sum, grid);
    d.addEventListener('toggle', () => rememberFold(c.name, d.open));
    d.title = `Drop a job here to add it to ${c.name}`;
    d.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      d.classList.add('drop-ready');
    });
    d.addEventListener('dragleave', (e) => {
      if (!d.contains(e.relatedTarget)) d.classList.remove('drop-ready');
    });
    d.addEventListener('drop', async (e) => {
      e.preventDefault();
      d.classList.remove('drop-ready');
      const name = e.dataTransfer.getData(DRAG_TYPE);
      if (!name || c.jobs.includes(name)) return;
      await save(classes.map((x) => (x.name === c.name ? { ...x, jobs: [...x.jobs, name] } : x)));
    });
    return d;
  };

  const render = () => {
    wrap.innerHTML = '';
    const all = allJobs();
    const byName = new Map(all.map((k) => [k.name, k]));
    const shelved = new Set();
    for (const c of classes) {
      // A name the catalog no longer knows renders nowhere and stays in the manifest —
      // the manifest is the owner's, and a stock job may come back (src/catalog.ts).
      const members = c.jobs.map((n) => byName.get(n)).filter(Boolean);
      members.forEach((k) => shelved.add(k.name));
      wrap.appendChild(shelf(c, members));
    }
    // A job on no shelf sits flat under the shelves, the roster's own answer — with a
    // heading only once shelves exist, because until then flat IS the whole board.
    if (classes.length && shelved.size < all.length) {
      wrap.appendChild(Object.assign(document.createElement('div'), { className: 'ks-loose-h', textContent: 'unclassed' }));
    }
    return shelved;
  };

  return { wrap, add, render };
}
