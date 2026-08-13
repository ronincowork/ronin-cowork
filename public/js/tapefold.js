/* part of the tmux-ronin client — see js/README.md */
/**
 * THE FOLD RULE, as a pure function — no DOM.
 *
 * `result` and `code` lines fold, exactly as the CLI folds them: a block, default
 * CLOSED, its summary carrying the first line and a count. A ⎿ result and the code
 * lines under it are one fold, the way they are one thing. Everything else is plain
 * transcript text.
 *
 * This decides the GROUPING only; `tapeview.js` turns the ops into <details> elements.
 * Pure because the rule is fiddly and load-bearing — a tool's output settles across
 * several ticks and must not shatter into one fold per tick — and because a rule this
 * shape is worth pinning with tests (tests/tape-fold.test.js) rather than eyeballing
 * on a phone.
 *
 * OPS, in render order:
 *   { t: 'text',   s }               plain transcript text
 *   { t: 'fold',   label, lines, n } open a new fold
 *   { t: 'extend', lines, n }        append to the fold the previous call left open
 *
 * `lines` is mutated as the walk continues, and the op is pushed when the fold opens,
 * so the ops array stays in render order. `n` counts the foldable lines only — blank
 * lines absorbed into a fold do not bump the summary's count, matching the original.
 */

/**
 * @param {Array<[string, string]>} recs  [kind, text] pairs from the settled scroll
 * @param {boolean} continuing            may the previous call's open fold be extended?
 * @returns {{ops: Array, chars: number, keepFold: boolean}}
 *          `chars` is what the transcript grew by (text + one newline per record);
 *          `keepFold` says whether a fold is still open for the NEXT call to extend.
 */
export function groupRecs(recs, continuing) {
  const ops = [];
  let plain = '';
  let chars = 0;
  let fold = null; // the op currently being filled
  let carried = !!continuing; // an untouched fold from the previous call is still open

  const flushPlain = () => {
    if (!plain) return;
    ops.push({ t: 'text', s: plain });
    plain = '';
  };
  const openFold = (label) => {
    flushPlain();
    // Carried: the first fold of this call continues the previous one rather than
    // starting a second — that is what stops one tool's output shattering per tick.
    fold = carried ? { t: 'extend', lines: [], n: 0 } : { t: 'fold', label, lines: [], n: 0 };
    carried = false;
    ops.push(fold);
    return fold;
  };

  for (let i = 0; i < recs.length; i++) {
    const [k, t] = recs[i];
    chars += t.length + 1;
    if (k === 'result' || k === 'code') {
      // A stray code fragment — one or two wrapped lines between prose — stays
      // inline: a fold per fragment is worse noise than the fragment. Only a real
      // block (3+ lines, blanks allowed inside) earns the fold. ⎿ results always
      // fold; their first line IS the summary. An already-open fold takes the line
      // whatever its length, so a settling block never splits.
      if (!fold && !carried && k === 'code') {
        let run = 0;
        for (let j = i; j < recs.length; j++) {
          const [jk, jt] = recs[j];
          if (jk === 'code' || jk === 'result') run++;
          else if (!jt.trim() && run) continue;
          else break;
          if (run >= 3) break;
        }
        if (run < 3) {
          plain += t + '\n';
          continue;
        }
      }
      if (!fold) openFold(k === 'code' ? '⌨ code' : t.trim() || '⎿');
      fold.n++;
      fold.lines.push(t);
      continue;
    }
    if ((fold || carried) && !t.trim()) {
      // A blank inside a result/code block belongs to the fold — it must not
      // shatter one tool's output into a chain of stub folds.
      if (!fold) openFold(null);
      fold.lines.push('');
      continue;
    }
    if (fold || carried) {
      fold = null;
      carried = false;
    }
    plain += t + '\n';
  }
  flushPlain();
  return { ops, chars, keepFold: !!fold || carried };
}
