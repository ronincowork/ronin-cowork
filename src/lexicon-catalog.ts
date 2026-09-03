import { entryPairs, type Origin } from './resources.js';
import { findDefinition, readDefinitions, type Definition } from './resource-adapters.js';
import { readFile } from 'node:fs/promises';

const FIELDS = new Set(['label', 'blurb', 'base', 'order', 'hidden']);

export interface LexiconInfo {
  name: string;
  label: string;
  blurb: string;
  base: string;
  origin: Origin;
  shadowed: boolean;
}

export interface ResolvedLexicon extends LexiconInfo {
  chain: string[];
  words: Record<string, string>;
}

const info = (d: Definition): LexiconInfo => ({
  name: d.name,
  label: d.get('label') || d.name,
  blurb: d.get('blurb'),
  base: d.get('base'),
  origin: d.origin,
  shadowed: d.shadowed,
});

export async function listLexicons(): Promise<LexiconInfo[]> {
  return (await readDefinitions('lexicons')).map(info);
}

async function wordsOf(d: Definition): Promise<Record<string, string>> {
  const lines = (await readFile(d.file, 'utf8')).split('\n');
  const out: Record<string, string> = {};
  for (const [k, v] of entryPairs(lines)) if (!FIELDS.has(k) && v) out[k] = v;
  return out;
}

export async function resolveLexicon(name: string): Promise<ResolvedLexicon | undefined> {
  const head = await findDefinition('lexicons', name);
  if (!head) return undefined;
  const chain: string[] = [];
  const layers: Record<string, string>[] = [];
  let cur: Definition | undefined = head;
  while (cur && !chain.includes(cur.name) && chain.length < 16) {
    chain.push(cur.name);
    layers.push(await wordsOf(cur));
    const base = cur.get('base').trim();
    cur = base ? await findDefinition('lexicons', base) : undefined;
  }
  const words: Record<string, string> = {};
  for (const layer of layers.reverse()) Object.assign(words, layer);
  return { ...info(head), chain, words };
}
