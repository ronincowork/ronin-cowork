/* part of the tmux-ronin client — see js/README.md */

/* ---------- STATS — the sixth commons pane (tab: ▦ Stats) ----------
 *
 * TOMODACHI's readout: how this install actually gets used. The house name for the
 * system is TOMODACHI; the tab says "Stats" because words a user works with are plain
 * English (KOTOBA). The plan is co-working/user_repo/wip/buildouts/TOMODACHI.md and
 * the counting contract is docs/soroban.md.
 *
 * TWO RULES THIS FILE OBEYS:
 *
 *   1. NO GENERATED PROSE. Labels, counts, charts, dates. No headline, no summary, no
 *      sentence about how you work. The reader draws the conclusion; this supplies the
 *      evidence.
 *   2. A SECTION WITH NO DATA IS ABSENT, NOT ZEROED. Legs land one at a time, and a
 *      wall of zeros reads as "you never did this" when the truth is "nobody built the
 *      counter yet". The capability GRID is the deliberate exception — there a zero is
 *      the point, because it is a feature nobody has found.
 *
 * Everything is CSS and one inline SVG sparkline. No chart library, no dependency.
 */

// `other` is a real bucket, not a gap: a session whose letter names no job still has
// to be drawable, or it silently vanishes from a chart that claims to show everything.
const JOBS = ['RiffOnIt', 'DraftPlan', 'CutCode', 'ChaseBug', 'CheckWork', 'WatchCrew', 'OddJob', 'other'];
const WINDOWS = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['all', 'All time'],
];
/** Named for the thing you would go and try, not for the internal counter. */
const CAPS = [
  ['forks', 'forks'],
  ['groups', 'groups'],
  ['led', '人 led'],
  ['board_posts', 'board posts'],
  ['board_reads', 'board reads'],
  ['voice', 'voice'],
  ['pad', 'pad'],
  ['copy', 'copy panel'],
];

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const sumOf = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);

export function buildStats(root) {
  let win = 'week';
  let loading = false;

  const head = el('div', 'td-head');
  const tabs = el('div', 'td-wins');
  const range = el('span', 'td-range');
  for (const [id, label] of WINDOWS) {
    const b = el('button', 'td-win', label);
    b.type = 'button';
    b.dataset.win = id;
    if (id === win) b.classList.add('on');
    b.addEventListener('click', () => {
      win = id;
      tabs.querySelectorAll('.td-win').forEach((x) => x.classList.toggle('on', x.dataset.win === id));
      load();
    });
    tabs.appendChild(b);
  }
  head.append(tabs, range);

  const faultBox = el('div', 'td-fault');
  faultBox.hidden = true;
  const body = el('div', 'td-body');
  root.append(head, faultBox, body);

  /* ---------- pieces ---------- */

  const card = (label, big, ...subs) => {
    const c = el('div', 'td-card');
    c.append(el('span', 'td-lbl', label), el('span', 'td-big', big));
    for (const s of subs) if (s) c.append(el('span', 'td-sub', s));
    return c;
  };

  const bars = (obj, order) => {
    const box = el('div', 'td-bars');
    const keys = order ? order.filter((k) => k in obj) : Object.keys(obj).sort((a, b) => obj[b] - obj[a]);
    const max = Math.max(1, ...keys.map((k) => obj[k]));
    keys.forEach((k, i) => {
      const row = el('div', 'td-bar');
      if (!obj[k]) row.classList.add('zero');
      const track = el('span', 'td-track');
      const fill = el('span', 'td-fill');
      fill.style.width = `${(obj[k] / max) * 100}%`;
      if (i === 0) fill.classList.add('top');
      track.appendChild(fill);
      row.append(el('span', 'td-nm', k), track, el('span', 'td-n', String(obj[k])));
      box.appendChild(row);
    });
    return box;
  };

  const hist = (obj, order, note) => {
    const wrap = el('div');
    const h = el('div', 'td-hist');
    const keys = order.filter((k) => k in obj);
    const max = Math.max(1, ...keys.map((k) => obj[k]));
    for (const k of keys) {
      const col = el('div', 'td-col');
      const stack = el('span', 'td-stack');
      stack.style.height = `${Math.max(2, (obj[k] / max) * 46)}px`;
      col.append(el('span', 'td-cnt', String(obj[k])), stack, el('span', 'td-cap', k));
      h.appendChild(col);
    }
    wrap.appendChild(h);
    if (note) wrap.appendChild(el('div', 'td-mean', note));
    return wrap;
  };

  /** Job at birth × job at death. The diagonal stayed put; everything else migrated. */
  const marimekko = (nested) => {
    const wrap = el('div');
    const total = Object.values(nested).reduce((a, ends) => a + sumOf(ends), 0);
    if (!total) return null;
    const mek = el('div', 'td-mek');
    const axis = el('div', 'td-mekaxis');
    for (const birth of JOBS) {
      const ends = nested[birth];
      if (!ends) continue;
      const n = sumOf(ends);
      const w = (n / total) * 100;
      const colEl = el('div', 'td-mekcol');
      colEl.style.flex = `${n} 1 0`;
      colEl.title = `${birth} — ${n}`;
      for (const end of JOBS) {
        if (!ends[end]) continue;
        const seg = el('div', 'td-seg');
        seg.style.height = `${(ends[end] / n) * 100}%`;
        seg.style.background = `var(--k-${end})`;
        seg.title = `launched ${birth} · died ${end} — ${ends[end]}`;
        if (w > 7 && ends[end] / n > 0.28) seg.appendChild(el('span', null, String(ends[end])));
        colEl.appendChild(seg);
      }
      mek.appendChild(colEl);
      const a = el('div', null, w > 9 ? `${birth} ${n}` : w > 5 ? birth : String(n));
      a.style.flex = `${n} 1 0`;
      a.title = `${birth} — ${n}`;
      axis.appendChild(a);
    }
    const legend = el('div', 'td-legend');
    for (const j of JOBS) {
      const s = el('span', null);
      const i = el('i');
      i.style.background = `var(--k-${j})`;
      s.append(i, document.createTextNode(j));
      legend.appendChild(s);
    }
    wrap.append(mek, axis, legend);
    return wrap;
  };

  const spark = (vals) => {
    if (!vals || vals.length < 2) return null;
    const max = Math.max(...vals, 1);
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * 100, 22 - (v / max) * 20]);
    const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 24');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'td-spark');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML =
      `<polygon points="0,24 ${line} 100,24" fill="var(--accent-2)" opacity=".16"></polygon>` +
      `<polyline points="${line}" fill="none" stroke="var(--accent-2)" stroke-width="1.2"` +
      ` vector-effect="non-scaling-stroke" stroke-linejoin="round"></polyline>` +
      `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="1.8" fill="var(--accent)"></circle>`;
    return svg;
  };

  const section = (title, note, ...panels) => {
    const live = panels.filter(Boolean);
    if (!live.length) return null; // absent, not zeroed
    const sec = el('div', 'td-sec');
    const h = el('div', 'td-sechead');
    h.append(el('h2', null, title), el('span', 'td-secn', note || ''), el('span', 'td-rule'));
    const grid = el('div', 'td-grid');
    live.forEach((p) => grid.appendChild(p));
    sec.append(h, grid);
    return sec;
  };

  const panel = (title, content, wide) => {
    if (!content) return null;
    const p = el('div', wide ? 'td-panel wide' : 'td-panel');
    if (title) p.appendChild(el('h3', null, title));
    p.appendChild(content);
    return p;
  };

  /* ---------- the fault banner: mechanical, paste-to-fix ---------- */

  const renderFaults = (faults) => {
    faultBox.textContent = '';
    if (!faults || !faults.length) {
      faultBox.hidden = true;
      return;
    }
    faultBox.hidden = false;
    const n = faults.length;
    faultBox.append(
      el(
        'div',
        'td-fhead',
        `⚠ ${n} stats probe${n > 1 ? 's are' : ' is'} broken — counting has stopped for ${n > 1 ? 'these' : 'this'}. Paste this into a session to fix.`,
      ),
    );
    // The caught error verbatim. Never a paraphrase: a summary drops exactly the words
    // a fixer would grep for.
    const text = faults
      .map((f) => `${f.site}   ${f.at}\n  ${f.err}\n  n=${f.n}  since ${f.first}`)
      .join('\n\n');
    faultBox.appendChild(el('pre', 'td-fbody', text));
  };

  /* ---------- render ---------- */

  const render = (d) => {
    body.textContent = '';
    range.textContent = d.days > 1 ? `${d.from} → ${d.to} · ${d.days} days` : d.from;
    renderFaults(d.faults);

    const s = d.sessions || {};
    const surf = d.surfaces || {};

    // cards
    const cards = el('div', 'td-cards');
    const sessCard = card('Sessions', String(s.started ?? 0));
    const sp = spark(s.spark);
    if (sp) sessCard.insertBefore(sp, sessCard.children[2] || null);
    cards.append(
      sessCard,
      card('Active days', `${s.active_days ?? 0} / ${d.days}`),
      card('Live now', String(s.alive ?? 0), `peak ${s.peak ?? 0}`),
      card('Groups', String(s.tag_groups ?? 0)),
    );
    body.appendChild(cards);

    // sessions
    const mek = marimekko(s.by_job_birth_end || {});
    const migN = sumOf(s.migrations);
    const migNote = migN
      ? el(
          'div',
          'td-mean',
          `${migN} migrated · ${Object.entries(s.migrations).map(([k, v]) => `${k.replace('>', '→')} ${v}`).join(' · ')}`,
        )
      : null;
    const mekPanel = mek ? panel('Job at birth × job at death', mek, true) : null;
    if (mekPanel && migNote) mekPanel.appendChild(migNote);

    body.appendChild(
      section(
        'Sessions',
        `${s.started ?? 0} started`,
        sumOf(s.by_job_now) ? panel('Doing right now', bars(s.by_job_now, JOBS)) : null,
        mekPanel,
        sumOf(s.born) ? panel('Born', bars(s.born, ['assisted', 'manual', 'fork', 'macro', 'hand'])) : null,
        sumOf(s.end) ? panel('Ended', bars(s.end, ['harakiri', 'deleted', 'cold', 'archived'])) : null,
        sumOf(s.life) ? panel('Lifetime', hist(s.life, ['<1h', '1-8h', '8h-1d', '1-7d', '>7d'])) : null,
        sumOf(s.ctx)
          ? panel('Context unused at close', hist(s.ctx, ['<25', '25-50', '50-75', '75-90', '>90']))
          : null,
        sumOf(s.by_model) ? panel('Model', bars(s.by_model)) : null,
      ) || el('div'),
    );

    // ladders — how far up their ladders live sessions are, and who waits at a gate
    const lad = { ...(s.ladders || {}) };
    const atGate = lad.at_gate || 0;
    delete lad.at_gate;
    const ladderPanel = sumOf(lad)
      ? panel(
          'How far up the ladder',
          hist(
            lad,
            ['none', '0-25', '25-50', '50-75', '75-100'],
            atGate ? `${atGate} at a gate — waiting on you` : null,
          ),
        )
      : null;
    const pl = d.plans;
    const planPanel = pl
      ? panel(
          'Plan docs',
          (() => {
            const rows = el('div', 'td-rows');
            const add = (k, v) => {
              const r = el('div', 'td-row');
              r.append(el('span', 'td-k', k), el('span', 'td-v', String(v)));
              rows.appendChild(r);
            };
            add('in flight', pl.live);
            add('landed', pl.landed);
            add('legs completed', pl.legs_done);
            add('stale 14d+', pl.stale);
            add('legs per plan (median)', pl.legs_median);
            return rows;
          })(),
        )
      : null;
    if (ladderPanel || planPanel) {
      body.appendChild(
        section('Ladders & plans', `${s.alive ?? 0} live`, ladderPanel, planPanel) || el('div'),
      );
    }

    // surfaces
    const caps = el('div', 'td-caps');
    for (const [key, label] of CAPS) {
      const n = (surf.caps || {})[key] || 0;
      const cell = el('div', n ? 'td-capcell' : 'td-capcell off');
      cell.append(el('span', 'td-capn', String(n)), el('span', 'td-capt', label));
      caps.appendChild(cell);
    }
    body.appendChild(
      section(
        'Ronin surfaces',
        `${sumOf(surf.macros)} macro runs`,
        sumOf(surf.macros) ? panel('Macros', bars(surf.macros)) : null,
        sumOf(surf.tabs) || sumOf(surf.dials) ? panel('UI', uiRows(surf)) : null,
        panel('Capabilities', caps, true),
      ) || el('div'),
    );

    const foot = el(
      'div',
      'td-foot',
      'Counted on this machine — no code, no prompts, no names. See README/STATS.md.',
    );
    body.appendChild(foot);
  };

  const uiRows = (surf) => {
    const rows = el('div', 'td-rows');
    const add = (k, v, zero) => {
      const r = el('div', zero ? 'td-row zero' : 'td-row');
      r.append(el('span', 'td-k', k), el('span', 'td-v', v));
      rows.appendChild(r);
    };
    const tabsSeen = surf.tabs || {};
    for (const [id, label] of [
      ['sessions', '⌂ Roster'],
      ['new', '＋ New session'],
      ['wipe', '▤ Wipeboard'],
      ['proj', '▣ Project root'],
      ['stats', '▦ Stats'],
    ]) {
      add(label, String(tabsSeen[id] || 0), !tabsSeen[id]);
    }
    const dials = surf.dials || {};
    if (sumOf(dials)) {
      add(
        'dials changed',
        `${sumOf(dials)} — ${Object.entries(dials).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
      );
    }
    const client = surf.client || {};
    if (sumOf(client)) {
      const total = sumOf(client);
      add(
        'desktop : touch',
        `${Math.round(((client.desktop || 0) / total) * 100)} : ${Math.round(((client.touch || 0) / total) * 100)}`,
      );
    }
    return rows;
  };

  /* ---------- load ---------- */

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const r = await fetch(`/api/tomodachi/stats?window=${win}`, { cache: 'no-store' });
      const d = await r.json();
      if (d && !d.error) render(d);
      else body.textContent = 'Stats are not available on this install yet.';
    } catch (_) {
      body.textContent = 'Stats could not be read.';
    } finally {
      loading = false;
    }
  }

  /** Called when the tab is opened — and it counts itself, like every other surface. */
  function enter() {
    try {
      navigator.sendBeacon?.(
        '/api/tomodachi/event',
        new Blob([JSON.stringify({ e: 'tab.open', v: 'stats' })], { type: 'application/json' }),
      );
    } catch (_) {}
    load();
  }

  return { enter, load };
}
