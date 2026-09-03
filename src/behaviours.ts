import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSops } from './resources.js';
import { storeDir } from './resources.js';
import { listWays, wayFile } from './resources.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface DeliveredBehaviour {
  book: string;
  file: string;
}

export interface ResolvedBehaviours {
  delivered: DeliveredBehaviour[];
  ignored: string[];
}

export async function resolveBehaviourBooks(input: readonly string[]): Promise<ResolvedBehaviours> {
  const [sops, ways] = await Promise.all([listSops(), listWays()]);
  const shelves = {
    sops: new Map(sops.map((row) => [row.name, row.origin])),
    ways: new Map(ways.map((row) => [row.name, row.origin])),
  } as const;
  const delivered: DeliveredBehaviour[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const book = String(raw).trim();
    if (!book || seen.has(book)) continue;
    seen.add(book);
    const match = /^(sops|ways):([a-z0-9][a-z0-9_-]*)$/.exec(book);
    const shelf = match?.[1] as keyof typeof shelves | undefined;
    const name = match?.[2] ?? '';
    const resolved = shelf ? shelves[shelf].get(name) : undefined;
    if (!shelf || !resolved) {
      ignored.push(`behaviours[${book || String(raw)}]`);
      continue;
    }
    const file = shelf === 'ways' ? await wayFile(name, resolved) : resolved === 'user'
      ? path.join(storeDir('sops'), `${name}.md`) : path.join(ROOT, 'ronin_sops', `${name}.md`);
    delivered.push({ book, file });
  }
  return { delivered, ignored: ignored.sort() };
}
