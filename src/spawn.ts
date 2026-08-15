import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './config.js';
import { bootFiles, ensureShelf } from './session-boot.js';
import { listProjectRoots, type ProjectRootInfo } from './project-roots.js';
import { storeDir } from './stores.js';
import {
  listSessionJobs,
  type SessionJobInfo,
} from './catalog.js';

/**
 * The mechanical executor: a filled form in, a briefed session out.
 *
 * "Once the recipe is written, the cooking is mechanical" — spawning is Ronin's
 * own code, never an agent following tmux steps. Same shape in, same session out.
 * Nothing here calls a model: the smart fill (Koshi) is an upgrade that populates
 * this form, not a dependency of performing it.
 *
 * See co-working/user_repo/wip/buildouts/MACRO_LAUNCHER.md.
 */

/**
 * What the launcher sends: the session_job, plus whatever the user picked.
 * The field names are the three universal axes — the same keys that scope a
 * memory and address a macro, so one vocabulary spans the whole system.
 */
export interface SpawnForm {
  session_job: string;
  prompt: string;
  /**
   * What the session is called. MANDATORY in manual mode: manual means Ronin adds
   * no wording of its own, and a name derived from the first 28 characters of your
   * prompt is exactly that — wording. You are about to run many of these side by
   * side; the name is how you address one, so you name it. Left empty (assisted
   * only) the name is slugged from the session_job + prompt as before.
   */
  name?: string;
  /**
   * 'manual'   — your text is the ENTIRE prompt. Nothing is prepended, appended
   *              or templated. Ronin only does the mechanical part (directory,
   *              CLI, dial, tags). Adding "helpful" wording here would defeat the
   *              whole point of the mode.
   * 'assisted' — the composed boot brief: the kind's posture + reading list +
   *              the session_job's opening template + your inject + the ack rule.
   *              This is the seat Koshi will eventually fill from one big text.
   */
  mode?: 'manual' | 'assisted';
  project_root?: string;
  cmd?: string;
  tags?: string[];
  /** Files/dirs to read before anything else. */
  seed?: string[];
  /** One-off instruction appended verbatim — the "and don't touch the CSS" case. */
  inject?: string;
  /**
   * A specific session this one is pointed at — to review, to fork from, to watch.
   * A group says "these people"; this says "that one". Expanded at spawn into the
   * session's name AND its directory, so the new agent doesn't have to rediscover
   * where the work it is looking at actually lives.
   */
  reference?: string;
}

/** What the form resolves to once sentinels are filled from the catalogs. */
export interface Resolved {
  name: string;
  dir: string;
  cmd: string;
  tags: string[];
  dial: SessionJobInfo['dial'];
  lifecycle: string;
  session_job: string;
  project_root: string;
  mode: 'manual' | 'assisted';
  brief: string;
  /**
   * False for a `agent: none` session_job — a plain terminal. `cmd` and `brief` are
   * both empty in that case and the caller must type NEITHER into the pane; this flag
   * says so out loud rather than leaving the caller to infer it from an empty string.
   */
  agent: boolean;
  /** `cap: exempt` — born even at the session max. It still counts once it is. */
  capExempt: boolean;
}

const ACK_RULE =
  'Before doing anything else: report back in your own words what you understand this job to be, ' +
  'what you will NOT do (no code, no builds, no commits until the owner says go), and anything ' +
  'that is unclear or looks wrong. Then wait for the owner.';

/**
 * Assemble the boot brief — the one composed first message, identical whatever
 * CLI is in the tile. Pointer vs inline is deliberate: short load-bearing text
 * (the role's posture, the ack rule) is INLINED because that is the only way to
 * guarantee it is read; long repo docs stay POINTERS because the CLI pulls them
 * in anyway and a paste that runs past a screen helps nobody.
 */
export function buildBrief(
  kind: SessionJobInfo,
  root: ProjectRootInfo | undefined,
  form: SpawnForm,
  referenceDir?: string,
  boot: string[] = [],
): string {
  // MANUAL: what the owner typed, byte for byte. No posture, no reading list, no
  // opening template, no ack rule. If this ever grows a "just one helpful line",
  // the mode is a lie.
  if (form.mode === 'manual') return form.prompt.trim();

  const parts: string[] = [];
  if (kind.posture) parts.push(`You are the ${kind.label || kind.name}. ${kind.posture}`);
  // THE SESSION BOOT SHELF, listed at this instant rather than remembered. This replaced
  // the project_root's `read:` — a stored list of literal paths that went stale in silence
  // the moment a file moved. Nothing is written down now, so nothing can be wrong: a file
  // that is gone simply is not named. See src/session-boot.ts.
  const reading = [...boot, ...(form.seed ?? [])].filter(Boolean);
  if (reading.length) parts.push(`Read first: ${reading.join(', ')}.`);
  parts.push(kind.opening.replace(/\{prompt\}/g, form.prompt));
  if (form.reference) {
    parts.push(
      `The session in question is @${form.reference}` +
        (referenceDir ? ` (working in ${referenceDir})` : '') +
        `. Catch up on it with \`tejun-peek ${form.reference}\`, and control-check before touching it.`,
    );
  }
  if (form.inject?.trim()) parts.push(form.inject.trim());
  if (kind.ack) parts.push(ACK_RULE);
  return parts.join(' ');
}

/**
 * Free text -> a name tmux and `tejun-send` can both address. The transform is
 * character-for-character (each disallowed char becomes `_`), which is what lets
 * the browser show the real name as you type without the caret jumping.
 */
export function sanitizeName(raw: string, max = 40): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, max)
    .replace(/[_-]+$/, '');
}

/** tmux-safe, collision-free session name derived from the kind and the intent. */
export function slugName(intentKind: string, prompt: string, taken: Set<string>): string {
  const base = sanitizeName(`${intentKind}_${prompt}`, 28) || intentKind;
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Resolve a form against the catalogs. Every sentinel is filled here, mechanically:
 * the session_job supplies its constants (dial, ladder, posture), the
 * project_root supplies the directory and the CLI, and nothing is invented.
 */
/**
 * A session_job's own working directory, if it has one. `{install}` — the only value the
 * catalog may carry — is this Ronin's own directory, resolved here at launch.
 *
 * A sentinel rather than a path, because a shipped catalog naming a directory would be a
 * shipped file naming a machine (JUSHO). Anything else is ignored rather than trusted:
 * a catalog is data, and data that turned into an arbitrary filesystem path would be a
 * quiet way to start a session anywhere.
 */
function kindDir(kind: SessionJobInfo): string {
  return kind.dir.trim() === '{install}' ? REPO_ROOT : '';
}

export async function resolveForm(
  form: SpawnForm,
  taken: Set<string>,
  referenceDir?: string,
): Promise<Resolved> {
  const [kinds, roots] = await Promise.all([
    listSessionJobs(),
    listProjectRoots(),
  ]);
  const kind = kinds.find((k) => k.name === form.session_job);
  if (!kind) throw new Error(`Unknown session_job "${form.session_job}" (see ronin_catalogs/SESSION_JOBS.md).`);

  const root = roots.find((r) => r.name === form.project_root);
  // Made here, on the way past, because this is the one place that knows every root by
  // name — so a shelf folder exists for each of them without anything having to remember.
  await ensureShelf(roots.map((r) => r.name));

  // A name you typed is used as typed (sanitized, never de-duplicated): if it is
  // taken you get told, rather than quietly ending up in `foo-2` and sending your
  // next instruction to `foo`. Only a derived name is allowed to grow a suffix.
  const wanted = form.name ? sanitizeName(form.name) : '';
  if (form.name && !wanted) {
    throw new Error(`"${form.name}" has no usable characters for a session name.`);
  }

  // `agent: none` — a plain terminal. There is no CLI to launch and no brief to
  // compose, so both resolve EMPTY here rather than falling through to the default
  // `claude`: the pane is meant to be left at a shell prompt, untouched.
  const agent = kind.agent;

  return {
    name: wanted || slugName(kind.name, form.prompt, taken),
    // A kind's own `dir:` WINS over the project_root's, because it is a constant of the
    // kind — the same category as its dial, and a launch must not be able to leave it to
    // chance. Exactly one kind has one (`MikaAssist`, `{install}`): she works on Ronin's
    // own business, so she starts where Ronin's documents are whatever root was picked.
    dir: kindDir(kind) || root?.dir || '',
    cmd: agent ? form.cmd || root?.cmd || 'claude' : '',
    tags: (form.tags ?? []).filter(Boolean).slice(0, 16),
    dial: kind.dial,
    lifecycle: kind.lifecycle && kind.lifecycle !== 'none' ? kind.lifecycle : '',
    session_job: kind.name,
    project_root: root?.name ?? '',
    mode: form.mode === 'manual' ? 'manual' : 'assisted',
    brief: agent ? buildBrief(kind, root, form, referenceDir, await bootFiles(root?.name ?? '', kind.name)) : '',
    agent,
    capExempt: kind.capExempt,
  };
}

/**
 * The ledger: one line per spawn, from day one, even though nothing reads it yet.
 * History cannot be retro-fitted — a ledger started later starts empty — and it is
 * what later teaches Koshi this user's habits. Local, append-only, gitignored,
 * outside the repo: it is the owner's record of their own words. Nothing phones home.
 */
const LEDGER = path.join(storeDir('ledger'), 'spawns.jsonl');

export async function appendLedger(form: SpawnForm, resolved: Resolved, ok: boolean): Promise<void> {
  try {
    await mkdir(path.dirname(LEDGER), { recursive: true });
    await appendFile(
      LEDGER,
      JSON.stringify({
        ts: new Date().toISOString(),
        session_job: form.session_job,
        mode: form.mode ?? 'assisted',
        intent: form.prompt,
        picks: {
          project_root: form.project_root,
          tags: form.tags,
          seed: form.seed,
          reference: form.reference,
        },
        fill: null, // reserved: what Koshi filled, once the smart fill exists
        resolved: { name: resolved.name, dir: resolved.dir, cmd: resolved.cmd, dial: resolved.dial },
        spawn: { name: resolved.name, ok },
        outcome: null, // reserved: the evaluation loop
      }) + '\n',
      'utf8',
    );
  } catch (e) {
    // A ledger failure must never cost the user their session.
    console.error('[tmux-ronin] ledger:', (e as Error)?.message ?? e);
  }
}
