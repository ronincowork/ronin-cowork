/**
 * A WATCHED AGENT'S JOURNAL, HEARD THE MOMENT THE CLI WRITES IT (KAN-453).
 *
 * A tile opens on Chat as soon as an Agent is born, usually before its CLI has written a
 * journal. The transcript part follows journals that exist; one still pending has nothing to
 * follow, so the open Chat would hear nothing until a reload. Asking again on a timer is the
 * polling the owner ruled out. Instead, while a reader watches an Agent whose journal is
 * pending, Core watches the journal's declared root for that file and, when it appears, says
 * so the ordinary way: `emitTranscriptWatch`, as if the tab had just asked. The part then
 * installs its watcher, catches up and pushes, and the Chat fills.
 *
 * One OS watcher per root, held only while some watched Agent is pending there: a written
 * journal, or the Agent ending, lets it go.
 */
import { mkdirSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { readLaunchIdentity } from './launch-binding.js';
import { matches, paneKey, resolveTranscriptSource } from './launch-journal.js';
import { emitTranscriptWatch, sockets } from './sockets.js';

interface Waiting { root: string; pattern: string; checking: boolean }
const waiting = new Map<string, Waiting>(); // session → the journal it is waiting for
const roots = new Map<string, FSWatcher>();

function forget(name: string): void {
  const held = waiting.get(name);
  if (!held) return;
  waiting.delete(name);
  if ([...waiting.values()].some((w) => w.root === held.root)) return;
  try { roots.get(held.root)?.close(); } catch { /* already closed */ }
  roots.delete(held.root);
}

/** Something matching this Agent's journal moved: is it there now? */
async function check(name: string): Promise<void> {
  const held = waiting.get(name);
  if (!held || held.checking) return;
  held.checking = true;
  try {
    const lookup = await resolveTranscriptSource(name);
    if ('gap' in lookup && lookup.gap === 'journal_pending') return; // the next write asks again
    forget(name);
    if ('source' in lookup) emitTranscriptWatch(name);
  } finally {
    held.checking = false;
  }
}

function listen(root: string): void {
  if (roots.has(root)) return;
  try {
    // The CLI's own folder, which it creates with its first write; making it first is
    // harmless and lets the watch begin before that write rather than miss it.
    mkdirSync(root, { recursive: true });
    const watcher = watch(root, { persistent: false, recursive: true }, (_event, filename) => {
      const base = filename ? path.basename(String(filename)) : '';
      for (const [name, w] of waiting) if (w.root === root && (!base || matches(base, w.pattern))) void check(name);
    });
    // Log and close: what was missed is read when a tab next watches, or at the next start.
    watcher.on('error', (e) => {
      console.error('[journal-arrival]', root, e);
      for (const [name, w] of [...waiting]) if (w.root === root) forget(name);
    });
    roots.set(root, watcher);
  } catch (e) {
    console.error('[journal-arrival]', root, e);
  }
}

/** A reader is watching this Agent: if its journal is still pending, wait for it. */
export async function awaitJournal(name: string): Promise<void> {
  if (waiting.has(name)) return;
  const lookup = await resolveTranscriptSource(name);
  if (!('gap' in lookup) || lookup.gap !== 'journal_pending') return;
  const identity = await readLaunchIdentity((await paneKey(name)).trim());
  const declaration = identity?.journal;
  if (!identity || !declaration || waiting.has(name)) return;
  waiting.set(name, { root: declaration.root, pattern: declaration.pattern.replaceAll('{session_id}', identity.providerSession), checking: false });
  listen(declaration.root);
  if (!roots.has(declaration.root)) { forget(name); return; }
  // Written between the lookup and the watch: nothing will move again to say so.
  void check(name);
}

sockets.onSessionEnd((name) => forget(name));
