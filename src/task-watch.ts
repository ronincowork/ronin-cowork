/**
 * WHEN A SESSION'S TASK CHANGES, IT GETS THAT TASK'S READING — once, and through one path.
 *
 * Changing `session_task` used to be a relabel: the icon on the roster changed and
 * nothing else did. That made the mark decoration. A task is a statement about what the
 * session is doing, and the house has a shelf of reading for each one — so a session that
 * moves from `RiffOnIt` to `CutCode` should be handed `task/CutCode/`, at the moment it
 * moves, whether it re-marked itself or the owner re-marked it.
 *
 * TWO WRITERS, ONE OBSERVER. That is the ruling and it is the reason this file exists
 * rather than a few lines in the POST route:
 *
 *   agent-authored   `write_tegami` commits a new value; the poll below sees it.
 *   owner-authored   `POST /api/sessions/:name/session_task` writes the letter and then
 *                    calls `observeTaskChange` — the same function the poll calls.
 *
 * A second injection implementation in the route is exactly how the owner's change and
 * the agent's change drift into behaving differently, and nobody would notice until one
 * of them stopped delivering.
 *
 * THE TASK LEVEL ONLY. A change is not a rebirth: `all/`, the root's and the role's
 * reading were read at birth and have not changed. Role reading is birth-only by ruling —
 * a role cannot change while the session lives, so there is nothing to re-deliver.
 *
 * DELIVERED-ONCE IS A FILE, not a variable. `<session store>/task-delivered.json` records
 * which task was last delivered, so a re-scrape injects nothing, a restart of cowork does
 * not re-send what already landed, and the record dies with the session directory it
 * lives in.
 *
 * FIRST SIGHT IS A BASELINE, NEVER A TRANSITION. If there is no record at all, the current
 * task is written down and NOTHING is sent. An observer cannot observe a change it was not
 * present for, and the alternative — treating every session alive at boot as having just
 * changed — would inject into every tile on the box the first time Ronin restarted. Birth
 * does not rely on this: the launch records the birth task explicitly, because the brief
 * already carried that task's reading.
 *
 * FAILURE IS VISIBLE AND RETRYABLE. A delivery that does not land is NOT recorded as
 * delivered, so the next tick tries again; the reason is kept in the record and logged.
 * Automatic retries stop after `MAX_TRIES` so a dial the owner deliberately closed does
 * not produce an endless drip, and re-posting the task resets the count. A changed mark
 * with undelivered reading is a split state, and it is never allowed to pass silently.
 *
 * IT SENDS THROUGH `sendText`, the house's own server-side path (src/send.ts), and not
 * through raw tmux keys. That buys the literal-text-then-Enter split, the re-type until
 * the text is visibly there, the lost-Enter retry, and — the one that matters most here —
 * never pressing Enter into an open dialog. Because it is a real message into the
 * session, it lands in the tape like anything else the session was told.
 *
 * AND IT OBEYS THE DIAL. A 👤 session is the owner's own hands and a 👁 session is
 * watch-only; Ronin does not get an exemption from the rule it publishes, so a task
 * change on either is recorded as undelivered with the dial as its reason. Flipping the
 * dial and observing again delivers it.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { RIREKI_DIR, sessionKey } from './session-dir.js';
import { readSessionTask } from './tegami.js';
import { taskFiles } from './session-boot.js';
import { findDefinition } from './definitions.js';
import { getControl, listSessions } from './tmux.js';
import { sendText } from './send.js';

/** How often the letters are looked at. The same cadence as the membership poll, and
 *  unlike that one it runs whether or not a browser is listening: an agent that re-marks
 *  itself at 3am must still be handed its reading. */
const EVERY_MS = 3_000;

/** Automatic attempts before the watcher leaves it alone. A closed dial is a decision,
 *  not a transient fault, and retrying it forever would be noise rather than diligence. */
const MAX_TRIES = 3;

interface Delivery {
  /** The task this record is about. */
  task: string;
  /** Did its reading actually land in the session? */
  ok: boolean;
  /** Automatic attempts made for this task. Reset when the task changes again. */
  tries: number;
  /** The last refusal or error, kept so the failure can be read rather than guessed at. */
  error?: string;
  at: string;
}

const recordPath = async (name: string): Promise<string> =>
  path.join(RIREKI_DIR, await sessionKey(name), 'task-delivered.json');

async function readRecord(name: string): Promise<Delivery | null> {
  try {
    return JSON.parse(await fs.readFile(await recordPath(name), 'utf8')) as Delivery;
  } catch {
    return null; // absent, or written by a version that wrote something else
  }
}

async function writeRecord(name: string, d: Delivery): Promise<void> {
  try {
    const file = await recordPath(name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(d));
    await fs.rename(tmp, file);
  } catch (e) {
    // A record we could not write means the next tick re-delivers. Loud, because that is
    // the failure that turns "exactly once" into "every three seconds".
    console.error(`[ronin] task-watch: could not record delivery for ${name}:`, e);
  }
}

/**
 * THE BIRTH BASELINE — the launch says what the session was born doing.
 *
 * Called from the launch route rather than inferred here, because at birth the task's
 * reading is already in the brief: the session has been told, so the record must say
 * delivered or the first tick would tell it again.
 */
export async function markTaskDelivered(name: string, task: string): Promise<void> {
  await writeRecord(name, { task, ok: true, tries: 0, at: new Date().toISOString() });
}

/**
 * The message. It names the new task, what that task is, and what to read for it — and it
 * says out loud what did NOT change, because the one thing an agent might otherwise infer
 * from being handed reading is that it has been re-briefed.
 *
 * ONE LINE, always: `sendText` types the text and then Enter, so an embedded newline
 * would submit half a message (the same rule src/lookup.ts follows).
 */
export async function taskChangeMessage(task: string, files: string[]): Promise<string> {
  const def = await findDefinition('session_tasks', task);
  const remit = def?.get('remit') ?? '';
  const parts = [`Your session_task is now ${task}.`];
  if (remit) parts.push(`${remit}.`);
  if (files.length) parts.push(`Read first: ${files.join(', ')}.`);
  parts.push('Your job_role and your project_root have not changed.');
  return parts.join(' ').replace(/\s+/g, ' ');
}

/**
 * How a message actually reaches a session. Injected so the observer can be tested
 * without a tmux server — a seam, not a test hook: everything above it is decisions and
 * everything below it is a pane, and the two were never the same job.
 */
export type Sender = (name: string, text: string) => Promise<void>;

const houseSender: Sender = async (name, text) => {
  const control = await getControl(name);
  if (control !== 'write') {
    // Ronin does not get an exemption from the dial it publishes. Thrown rather than
    // swallowed, so it lands in the record as the reason and can be retried after a flip.
    throw new Error(
      control === 'user'
        ? `"${name}" is 👤 owner-only — its task reading is not ours to type. Flip the dial to 🤖 to deliver it.`
        : `"${name}" is 👁 watch-only — its task reading is not ours to type. Flip the dial to 🤖 to deliver it.`,
    );
  }
  const { started } = await sendText(name, text);
  if (!started) throw new Error('the message did not submit — the prompt was not accepting input');
};

/**
 * Look at one session's letter and act if its task has moved.
 *
 * Safe to call from anywhere, as often as you like: everything it does is decided by
 * comparing the letter against the record, so a call with nothing to do costs one file
 * read and returns.
 *
 * `reset` is the owner re-posting the same task after a failure — it clears the attempt
 * count so a delivery the watcher had given up on is tried again.
 */
export async function observeTaskChange(name: string, reset = true, send: Sender = houseSender): Promise<void> {
  const task = await readSessionTask(name);
  const record = await readRecord(name);

  // First sight: write down where things stand and send nothing. See the header.
  if (!record) {
    await writeRecord(name, { task, ok: true, tries: 0, at: new Date().toISOString() });
    return;
  }
  const changed = record.task !== task;
  if (!changed && record.ok) return;
  if (!changed && !reset && record.tries >= MAX_TRIES) return;

  // A blank task updates the mark and injects nothing — it has no reading, and saying
  // "read nothing" into a session would be noise.
  if (!task) {
    await writeRecord(name, { task, ok: true, tries: 0, at: new Date().toISOString() });
    return;
  }

  const tries = (changed || reset ? 0 : record.tries) + 1;
  try {
    const files = await taskFiles(task);
    await send(name, await taskChangeMessage(task, files));
    await writeRecord(name, { task, ok: true, tries, at: new Date().toISOString() });
  } catch (e) {
    // A closed dial, a prompt that would not accept input, a session that went away
    // mid-send. Keep the reason where it can be read, and leave the record UNdelivered so
    // this is retried.
    const error = String((e as Error)?.message ?? e).trim();
    await writeRecord(name, { task, ok: false, tries, error, at: new Date().toISOString() });
    console.error(`[ronin] task-watch: ${name} → ${task} not delivered (try ${tries}/${MAX_TRIES}): ${error}`);
  }
}

/** What the tile can show about a delivery that did not land. Null when all is well. */
export async function taskDeliveryFault(name: string): Promise<Delivery | null> {
  const d = await readRecord(name);
  return d && !d.ok ? d : null;
}

/**
 * The poll. Called once at boot — a timer is a choice `index.ts` makes, not an import
 * side effect, the same rule `startSessionsBroadcast` follows.
 *
 * It is NOT gated on a browser being connected, and that is the whole difference between
 * this and the membership poll it sits beside. The sessions socket exists to redraw a
 * page nobody is looking at when nobody is looking; this exists to deliver reading to an
 * agent, which is worth doing at 3am with every tab closed.
 */
export function startTaskWatch(send: Sender = houseSender): void {
  setInterval(() => {
    void (async () => {
      for (const s of await listSessions()) await observeTaskChange(s.name, false, send);
    })().catch((e) => console.error('[ronin] task-watch:', e));
  }, EVERY_MS);
}
