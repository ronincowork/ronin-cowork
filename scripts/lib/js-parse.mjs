
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

export function parseExports(src) {
  return [...src.matchAll(/^export\s+(?:const|let|var|function|async function|class)\s+([\w$]+)/gm)].map((m) => m[1]);
}
