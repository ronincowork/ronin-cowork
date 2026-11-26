import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { STOCK_DIR, entryValue, isKeyLine, resolveFiles, resolveTreeFiles, type Origin } from './resources.js';
import { storeDir } from './resources.js';

export type DefinitionKind =
  | 'desk_profiles' | 'lexicons' | 'canvases';

export interface Definition {
  name: string;
  origin: Origin;
  shadowed: boolean;
  file: string;
  /** The whole file, for definitions whose body carries structure beyond the key lines. */
  text: string;
  get: (key: string) => string;
  has: (key: string) => boolean;
}

const isDefinitionFile = (n: string): boolean =>
  n.endsWith('.md') && !n.startsWith('.') && !/readme\.md$/i.test(n); // <folder>_readme.md says the format

const isHidden = (d: Definition): boolean => /^yes$/i.test(d.get('hidden'));

export async function readDefinitions(kind: DefinitionKind): Promise<Definition[]> {
  const merged = new Map<string, Definition>();
  const resolver = resolveFiles;
  for (const file of await resolver({
    stock: path.join(STOCK_DIR, kind),
    user: path.join(storeDir('custom'), kind),
    include: isDefinitionFile,
    symlinks: true,
  })) {
    const lines = file.text.split('\n');
    if (!lines.some(isKeyLine)) {
      console.error(`[ronin] ${file.path}: no \`- **key:** value\` lines — not a definition, skipped.`);
      continue;
    }
    merged.set(file.name, {
      name: file.name,
      origin: file.origin,
      shadowed: file.shadowed,
      file: file.path,
      text: file.text,
      get: (key: string) => entryValue(lines, key),
      has: (key: string) => entryValue(lines, key) !== '',
    });
  }
  const rank = (d: Definition): number => {
    const n = Number(d.get('order'));
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };
  const label = (d: Definition): string => (d.get('label') || d.name).toLowerCase();
  return [...merged.values()]
    .filter((d) => !isHidden(d))
    .sort((a, b) => rank(a) - rank(b) || label(a).localeCompare(label(b)));
}

export async function findDefinition(kind: DefinitionKind, token: string): Promise<Definition | undefined> {
  if (!token) return undefined;
  return (await readDefinitions(kind)).find((d) => d.name === token);
}

export const splitDefinitionList = (v: string): string[] =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== '—' && s !== '-');

interface Row {
  name: string;
  origin: Origin;
  shadowed: boolean;
  icon: string;
  label: string;
  blurb: string;
  ask: string;
  remit: string;
  credit?: { text: string; url: string };
}


function credit(v: string): { text: string; url: string } | undefined {
  const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(v.trim());
  return m ? { text: m[1], url: m[2] } : undefined;
}

const row = (d: Definition): Row => ({
  name: d.name,
  origin: d.origin,
  shadowed: d.shadowed,
  icon: d.get('icon'),
  label: d.get('label') || d.name,
  blurb: d.get('blurb'),
  ask: d.get('ask'),
  remit: d.get('remit'),
  credit: credit(d.get('credit')),
});

