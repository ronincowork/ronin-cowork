/** Resolve journals only inside the location owned by the launch declaration. */
import { open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { readLaunchIdentity, writeLaunchIdentity } from './launch-binding.js';
import type { LaunchIdentity } from './sockets-contract.js';
const field = (value: unknown, key: string): unknown => key.split('.').reduce<unknown>((v, k) =>
  v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined, value);
const matches = (name: string, pattern: string) => new RegExp('^' + pattern.split('*')
  .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(name);
async function files(root: string, pattern: string): Promise<string[]> {
  const rows = await readdir(root, { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return []; throw e;
  });
  const nested = await Promise.all(rows.map(row => row.isDirectory() ? files(path.join(root, row.name), pattern)
    : Promise.resolve(row.isFile() && matches(row.name, pattern) ? [path.join(root, row.name)] : [])));
  return nested.flat().sort();
}
/** The first line of a journal, parsed. `null` when it is not there to be read yet. */
async function header(file: string): Promise<unknown | null> {
  const handle = await open(file, 'r');
  try {
    const buf = Buffer.alloc(65536);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    const end = buf.subarray(0, bytesRead).indexOf(10);
    if (end < 0) return null; // the first journal record is still being appended
    return JSON.parse(buf.subarray(0, end).toString('utf8')) as unknown;
  } catch {
    return null; // there, and not readable: the caller decides what that means
  } finally {
    await handle.close();
  }
}

export type SegmentChain = { files: string[]; session: string } | { gap: 'journal_pending' };

/**
 * A BIRTH'S JOURNAL IS A CHAIN, NOT A FILENAME.
 *
 * A CLI may close one rollout and open another under the same birth — Codex did, on
 * 2026-09-24, and because the identity pinned the first filename the copy simply stopped at
 * 12:56 while the Agent kept working. The owner's rule is that a reader which knows its
 * newest message must always receive anything newer, and a pinned filename cannot keep it.
 *
 * For an ISOLATED birth the journal root is private to that birth, so every parent segment
 * in it belongs here — membership is not in question, only order. The header's timestamp
 * decides it and the filename settles a tie, which is total because names in a directory are
 * unique. A tie is inconsequential — both segments are kept and every record is delivered
 * either way — so the transcript is never made unavailable over one (owner's ruling).
 *
 * READ-ONLY. Resolution runs on GET, so it writes nothing: the launch artifact is birth
 * evidence, never cursor state, and the chain is derived on every call.
 */
export async function resolveLaunchSegments(identity: LaunchIdentity): Promise<SegmentChain> {
  const declaration = identity.journal;
  if (!declaration) return { gap: 'journal_pending' };
  const pattern = declaration.pattern.replaceAll('{session_id}', identity.providerSession);
  const found: { file: string; ts: string; id: string }[] = [];
  for (const file of await files(declaration.root, pattern)) {
    const row = await header(file);
    // THERE AND UNREADABLE IS NOT ABSENT. A half-written header is a segment we cannot yet
    // place; treating it as missing would order the chain around a hole and hand out a seq
    // the next sync would contradict.
    if (row === null) return { gap: 'journal_pending' };
    const child = declaration.childPath ? field(row, declaration.childPath) : undefined;
    if (child === true || (child !== null && typeof child === 'object')) continue;
    const id = field(row, declaration.idPath);
    if (typeof id !== 'string' || !id) return { gap: 'journal_pending' };
    const ts = field(row, declaration.tsPath || 'timestamp');
    found.push({ file, ts: typeof ts === 'string' && ts ? ts : '', id });
  }
  if (!found.length) return { gap: 'journal_pending' };
  found.sort((a, b) => (a.ts === b.ts ? (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) : a.ts < b.ts ? -1 : 1));
  // The birth's provider session is the one it is writing NOW: derived on every call,
  // never written back, because resolution answers GETs.
  return { files: found.map((f) => f.file), session: found[found.length - 1].id };
}

export async function resolveLaunchJournal(identity: LaunchIdentity): Promise<string | null> {
  if (identity.journalFile) return identity.journalFile;
  if (!identity.journal || identity.strategy === 'unbound') return null;
  const declaration = identity.journal;
  const pattern = declaration.pattern.replaceAll('{session_id}', identity.providerSession);
  for (const file of await files(declaration.root, pattern)) {
    if (identity.providerSession && declaration.pattern.includes('{session_id}')) {
      identity.journalFile = file;
      await writeLaunchIdentity(identity);
      return file;
    }
    const handle = await open(file, 'r');
    let row: unknown;
    try {
      const buf = Buffer.alloc(65536);
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      const end = buf.subarray(0, bytesRead).indexOf(10);
      if (end < 0) return null; // the first journal record is still being appended
      row = JSON.parse(buf.subarray(0, end).toString('utf8'));
    } finally { await handle.close(); }
    const child = declaration.childPath ? field(row, declaration.childPath) : undefined;
    if (child === true || (child !== null && typeof child === 'object')) continue;
    const id = field(row, declaration.idPath);
    if (typeof id !== 'string' || !id) return null;
    // Named/minted identities select their declared id; isolated identities own this directory.
    if (identity.providerSession && identity.providerSession !== id) continue;
    identity.providerSession = id;
    identity.journalFile = file;
    await writeLaunchIdentity(identity);
    return file;
  }
  return null;
}

/** The live pane selects a persisted birth, never an in-memory event subscription. */
export async function resolveTranscriptSource(name: string): Promise<import('./sockets-contract.js').TranscriptLookup> {
  const { tmux } = await import('./tmux-client.js');
  const { exactPane } = await import('./tmux.js');
  const { sessionDir } = await import('./session-dir.js');
  const key = await tmux.run(['display-message', '-p', '-t', exactPane(name), '#{@ronin-key}']).catch(() => '');
  // Each step knows why it stopped, and says so. Collapsing these into one null made a
  // session that is merely not running read exactly like one whose CLI keeps no journal,
  // and the tile could only ever show a single sentence for both.
  //
  // An empty key is TWO situations, and telling a running Agent that it is not running is
  // the worse of them: no pane at all, or a live pane carrying no Ronin key — a terminal
  // opened by hand, or a session from before keys were stamped. `codex_bryers` was running
  // and being told it was not. So the pane is asked whether it exists before anything is
  // said about it.
  if (!key.trim()) {
    const live = await tmux.run(['has-session', '-t', `=${name}`]).then(() => true).catch(() => false);
    return { gap: live ? 'no_key' : 'not_live' };
  }
  const identity = await readLaunchIdentity(key.trim());
  if (!identity) return { gap: 'no_identity' };
  if (!identity.journal) return { gap: 'unbound' };
  const common = { format: identity.journal.format, provider: identity.cli, dir: sessionDir(key.trim()) };
  // An isolated birth owns its journal root, so its journal is the ordered chain of parent
  // segments in it and the newest is merely the current one. Nothing is written here.
  if (identity.strategy === 'isolated') {
    const chain = await resolveLaunchSegments(identity);
    if ('gap' in chain) return { gap: chain.gap };
    const files = chain.files;
    return { source: { ...common, file: files[files.length - 1], files, session: chain.session } };
  }
  const file = await resolveLaunchJournal(identity);
  if (!file) return { gap: 'journal_pending' };
  return { source: { ...common, file, session: identity.providerSession } };
}
