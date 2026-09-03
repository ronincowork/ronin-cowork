/** Resolve the two behaviour shelves into literal birth-reading files. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSops } from './resources.js';
import { storeDir } from './stores.js';
import { listWays } from './resources.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface DeliveredBehaviour {
  book: string;
  file: string;
}

export interface ResolvedBehaviours {
  delivered: DeliveredBehaviour[];
  ignored: string[];
}

/** Unknown shelves, missing books and malformed addresses are omissions, never refusals. */
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
    const origin = shelf ? shelves[shelf].get(name) : undefined;
    if (!shelf || !origin) {
      ignored.push(`behaviours[${book || String(raw)}]`);
      continue;
    }
    const file = origin === 'user'
      ? path.join(storeDir(shelf), `${name}.md`)
      : path.join(ROOT, shelf === 'sops' ? 'ronin_sops' : 'ways', `${name}.md`);
    delivered.push({ book, file });
  }
  return { delivered, ignored: ignored.sort() };
}
