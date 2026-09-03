/**
 * Shared source-text parsing for the structural checks (check-modules, check-dead).
 *
 * These are deliberately regex-grade, not an AST: the client is 25 plain ES modules
 * with no build step, and the checks only need imports/exports/identifiers. If a
 * check ever needs real syntax, reach for an AST then — not here, pre-emptively.
 */

/** Strip comments but KEEP strings — import specifiers live inside quotes. */
export function noComments(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') { out += src[i]; i++; } out += src[i]; i++; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Strip comments AND string/template literals, for identifier matching only. */
export function codeOnly(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++; out += '""';
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; continue;
    }
    out += c; i++;
  }
  return out;
}

/** `import { a, b, c as d } from './mod.js'` occurrences in comment-stripped source.
 *  `names` are the SOURCE names (what the module must export); `locals` are the
 *  bindings in the importing file (what its code refers to) — the two differ exactly
 *  when `as` renames, which `ui.js`'s `tabs as makeTabs` made real. */
export function parseImports(src) {
  return [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.js'/g)].map((m) => {
    const parts = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    return {
      names: parts.map((s) => s.split(/\s+as\s+/)[0]),
      locals: parts.map((s) => s.split(/\s+as\s+/).pop()),
      from: m[2],
    };
  });
}

/** Top-level `export const|let|var|function|class NAME` names in comment-stripped source. */
export function parseExports(src) {
  return [...src.matchAll(/^export\s+(?:const|let|var|function|async function|class)\s+([\w$]+)/gm)].map((m) => m[1]);
}
