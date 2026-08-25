/**
 * SESSION MAX — one number the owner sets, and the one place that decides on it.
 *
 * How many sessions may run at once. Not derived, not measured, not clever: the owner
 * types a number into the top of ⌂ Roster and that is the answer. An earlier version
 * computed it from RAM and was replaced on the owner's word — a machine that guesses your
 * limit for you is a machine you have to argue with.
 *
 * WHY A LIMIT AT ALL. Past the point where the sessions do not fit, the box does not queue
 * and it does not warn: the kernel OOM killer ends one, and it chooses by resident size —
 * the largest, which is the longest-lived, most-context-loaded session. That is the lead or
 * the watcher coordinating the others. Five went that way on 2026-08-13. Refusing a launch
 * is the cheap failure; letting the kernel pick is the expensive one.
 *
 * THE SHAPE. One number, written once, read by everyone:
 *
 *     ronin.json                    what the owner typed  (only the UI writes it)
 *         |
 *         v  Ronin, on boot and on every save
 *     @ronin-session-max            a tmux SERVER option — the bus
 *        /                \
 *   createSession()     libexec/ronin-may-spawn
 *   (Ronin's own door)  (the shim's door, for agents driving tmux themselves)
 *
 * A spawn either goes through Ronin or it does not, and no single process sees both:
 * Ronin's unit sets a PATH without `bin/shim`, so it calls real tmux; agents have the shim
 * first on PATH. So there are two doors — but ONE number, and it lives here.
 *
 * The bus is a tmux server option because it is the one place a Node server and a
 * zero-dependency bash shim can both read without two JSON parsers. `@ronin-url` already
 * works exactly this way (`publishRoninUrl`, and `ronin_bin/tejun-harakiri` reading it back).
 */
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { storeDir } from './stores.js';

const pexec = promisify(execFile);

/** The tmux SERVER option every door reads. Server-scoped: visible from every session. */
export const MAX_OPT = '@ronin-session-max';

/** The owner's display name, on the same bus, for the same reason: bash reads it too. */
export const OWNER_OPT = '@ronin-owner';

/** The file the owner's number lives in. `ronin-store config` gives bash the directory. */
export const configPath = (): string => path.join(storeDir('config'), 'ronin.json');

/**
 * NO LIMIT is 0, and it is also what a missing file means.
 *
 * An install that has never set a number must behave exactly as it did before this
 * existed. The alternative — treating absent as zero-allowed — would make a fresh install
 * refuse to start its first session, which is the worst possible first impression and the
 * kind of default that gets a feature reverted rather than fixed.
 */
export const NO_LIMIT = 0;

/** A number the owner typed, floored to a non-negative integer; anything else is NO_LIMIT. */
function clean(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : NO_LIMIT;
}

/* ------------------------------------------------- the one door onto the file */

/**
 * THE WHOLE DOCUMENT, or an empty one. Absent, unreadable and not-JSON all mean *empty*;
 * none of them mean throw. The owner's editor must never be able to take Ronin down.
 */
async function readDoc(): Promise<Record<string, unknown>> {
  try {
    const raw = JSON.parse(await readFile(configPath(), 'utf8')) as unknown;
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** One section, or the caller's fallback. The section's SHAPE belongs to its own module. */
export async function readSection<T>(key: string, fallback: T): Promise<T> {
  const v = (await readDoc())[key];
  return v && typeof v === 'object' ? (v as T) : fallback;
}

/**
 * READ, MUTATE, WRITE — and every writer goes through here.
 *
 * Two things this centralises that were previously copied per setting, and a third it adds:
 *
 *  1. **Preserve every key you did not come to change.** The file is the owner's, and a
 *     setting added later must survive a save from a caller that has never heard of it.
 *     Three hand-rolled copies of that is three chances to drop somebody else's section.
 *  2. **Atomic.** Temp file plus rename, so two tabs saving at once cannot interleave into
 *     a half-written config. `koshi-outlets.json` already had this guarantee before it
 *     moved in here; absorbing it must not quietly downgrade it.
 *  3. **One place a lock would go**, if the read-modify-write window ever needs one. It is
 *     a single owner and a tiny file today, so a lock would be ceremony — but there is now
 *     exactly one line to change rather than one per setting.
 */
async function updateConfig(mutate: (doc: Record<string, unknown>) => void): Promise<void> {
  const doc = await readDoc();
  mutate(doc);
  await mkdir(storeDir('config'), { recursive: true });
  const tmp = `${configPath()}.${process.pid}`;
  await writeFile(tmp, JSON.stringify(doc, null, 2) + '\n');
  await rename(tmp, configPath());
}

/* ------------------------------------------------------------ the settings */

/**
 * Read the number. Re-read per call rather than cached: editing your own setting and having
 * it take effect is worth more than the syscall, and a cache here would need an
 * invalidation story that a file this small does not deserve.
 */
export async function readMax(): Promise<number> {
  const s = await readSection<Record<string, unknown>>('sessions', {});
  return clean(s.max);
}

/**
 * Write it, then publish it. Both, always — a saved number the bus has not heard about is
 * a limit the shim does not enforce, and the two would disagree silently until the next
 * restart. Callers get the value back so the UI echoes what was actually stored.
 */
export async function writeMax(max: number): Promise<number> {
  const value = clean(max);
  await updateConfig((doc) => {
    const sessions = ((doc.sessions ?? {}) as Record<string, unknown>) || {};
    sessions.max = value;
    doc.sessions = sessions;
  });
  await publishMax(value);
  return value;
}

/**
 * Put the number on the bus. Best-effort by construction: no tmux server yet is a normal
 * state at boot, and failing to publish must never stop Ronin from starting.
 */
export async function publishMax(max?: number): Promise<void> {
  const value = max ?? (await readMax());
  try {
    await pexec('tmux', ['set-option', '-s', MAX_OPT, String(value)]);
  } catch {
    /* no server — the next boot or the next save publishes it */
  }
}

/**
 * THE OWNER'S NAME — JUSHO's third clause, the one about people.
 *
 * `user: glen` was a literal in `src/wipeboards.ts` and `ronin_bin/tejun-wipeboard`, so every
 * post any owner wrote on any install was signed with OUR owner's first name. Nothing
 * shipped may name a person; this is where the name comes from instead.
 *
 * THE DEFAULT IS THIS MACHINE'S OWN USER, not a setting anyone must find. A fresh install
 * is already correct and already theirs — a config you have to fill in before the product
 * stops lying about who you are is a config that ships wrong.
 */
const machineUser = (): string => {
  try {
    return os.userInfo().username || 'owner';
  } catch {
    return 'owner'; // no passwd entry (a container, a stripped image) — never throw over a name
  }
};

export async function readOwner(): Promise<string> {
  const owner = await readSection<Record<string, unknown>>('owner', {});
  const name = typeof owner.name === 'string' ? owner.name.trim() : '';
  return name || machineUser();
}

/** Write it, then publish it — same contract as writeMax, and for the same reason. */
export async function writeOwner(name: string): Promise<string> {
  const value = String(name ?? '').trim().slice(0, 64) || machineUser();
  await updateConfig((doc) => {
    const owner = ((doc.owner ?? {}) as Record<string, unknown>) || {};
    owner.name = value;
    doc.owner = owner;
  });
  await publishOwner(value);
  return value;
}

/**
 * KOSHI'S OUTLET CHOICES — which model each koshi job asks. SETTEI, and it lives here now.
 *
 * It used to be `koshi-outlets.json` under `storeDir('session')` — the **data** root, the
 * one DAIKUSAN promises uninstall deletes. `docs/stores.md` settles it in one sentence:
 * *"if deleting it would lose the user's own work or their choices, it is `user`."* Which
 * model a koshi asks is a choice, made in a UI built for making it (目 Koshi).
 *
 * **The shape stays koshi's.** `src/koshi-model.ts` owns `Choice` and validates it; this
 * module owns the file and nothing else. That is why these two are generic — a settings
 * file should not have to import the types of every subsystem that keeps a setting in it.
 *
 * **No bus publish, and that is checked, not assumed:** nothing in `bin/` parses an outlet
 * choice. `docs/user-config.md`'s rule is *if a bash tool needs a setting, publish it* — so
 * a `@ronin-koshi` option would be a bus entry with no reader, which is worse than none.
 */
/** @service — KOSHI reads its own SETTEI section through this. */
export const readKoshiSection = (): Promise<Record<string, unknown>> =>
  readSection<Record<string, unknown>>('koshi', {});

/** @service — the 目 Koshi tab writes it back through KOSHI. */
export const writeKoshiSection = (value: Record<string, unknown>): Promise<void> =>
  updateConfig((doc) => {
    doc.koshi = value;
  });

/**
 * AUTH's section — the owner's login record. The SHAPE is src/auth.ts's (scrypt
 * params + signing secret); this module owns only the file, same bargain as koshi's
 * section above. `null` removes it — that is `ronin-passwd --clear`, back to
 * tailnet/Basic only. No bus publish: nothing in bash logs anyone in.
 */
export const updateAuthSection = (value: Record<string, unknown> | null): Promise<void> =>
  updateConfig((doc) => {
    if (value === null) delete doc.auth;
    else doc.auth = value;
  });

/**
 * PASSKEY's section — registered authenticators and the one-shot recovery code. The
 * SHAPE is src/passkey.ts's, same bargain as `auth` above.
 *
 * SEPARATE FROM `auth` ON PURPOSE (2026-08-17). `updateAuthSection` REPLACES the auth
 * object wholesale, which is what `ronin-passwd` wants — and if passkeys lived inside
 * it, changing the password would silently delete every registered device. A password
 * change is supposed to end SESSIONS, not confiscate the owner's phone. Two sections,
 * two lifetimes. `null` removes it. No bus publish: nothing in bash logs anyone in.
 */
export const updatePasskeysSection = (value: Record<string, unknown> | null): Promise<void> =>
  updateConfig((doc) => {
    if (value === null) delete doc.passkeys;
    else doc.passkeys = value;
  });

/* ------------------------------------------------ SETTEI's own sections (⚙ Setup) */

/**
 * THE SECTIONS THE ⚙ SETUP TAB OWNS, and it owns them BY NAME.
 *
 * Four writers rather than one generic "save the config", and that is the whole safety
 * property: `ronin.json` also carries `auth` — a scrypt record and the secret that signs
 * session tokens — and `passkeys`. A route that took a document and wrote it would let a
 * browser post a new signing secret; a route that takes `{ name, where }` cannot, no
 * matter what else is in the body. `updateConfig` then preserves every section the caller
 * never heard of, which is why adding one here costs nobody a migration.
 *
 * NO BUS PUBLISH ON ANY OF THESE, and it is checked rather than assumed: nothing in
 * `bin/` or `ronin_bin/` parses a machine name, an outlet choice or an entitlement.
 * `docs/user-config.md`'s rule is *if a bash tool needs a setting, publish it* — so a
 * `@ronin-machine` option today would be a bus entry with no reader, which rots faster
 * than no entry at all. Publish when a reader appears.
 */

/** What the owner calls this box, and where it is. Absent = fall back to the hostname. */
export const readMachineSection = (): Promise<Record<string, unknown>> =>
  readSection<Record<string, unknown>>('machine', {});

/**
 * `where` IS FREE TEXT BY RULING (owner, 2026-08-17): *you know where your box is, the
 * box does not.* Detecting a region means a cloud metadata call, and no outbound call
 * belongs in a record that renders on page load.
 */
/**
 * WATCHING THE BOX IS ON BY DEFAULT for an install that holds Ronin Services (owner,
 * 2026-08-25). The capability is part of what Services is for, so it arrives working
 * rather than arriving as a switch somebody has to find. Absent key = on; only an
 * explicit `false` turns it off, so an older config gains the gauge on upgrade instead
 * of silently opting out of it.
 *
 * Off means the reading is not gathered and the gauge is not drawn. Nothing was ever
 * installed on the machine, so there is nothing to undo — this is a display choice, not
 * a consent record.
 */
export const readMachineMonitor = async (): Promise<boolean> =>
  (await readMachineSection()).monitor !== false;

export const writeMachineSection = (v: { name?: string; where?: string; monitor?: boolean }): Promise<void> =>
  updateConfig((doc) => {
    const m = ((doc.machine ?? {}) as Record<string, unknown>) || {};
    if (v.monitor !== undefined) m.monitor = Boolean(v.monitor);
    if (v.name !== undefined) m.name = String(v.name).trim().slice(0, 64);
    if (v.where !== undefined) m.where = String(v.where).trim().slice(0, 120);
    doc.machine = m;
  });

/**
 * HOW WORK GETS A MODEL — two different questions, and merging them is the trap.
 *
 * `sessions.default` is what a NEW SESSION launches as: a CLI in a tile. It is THE
 * default — one, for the whole install (owner, 2026-08-18); a root does not choose a
 * model for you.
 *
 * `jobs` is the house's own model-fed work: one question, one answer, over an API. Not a
 * session, so each needs a key — and what is stored is the env var's NAME. Never a key.
 */
export const readAgentsSection = (): Promise<Record<string, unknown>> =>
  readSection<Record<string, unknown>>('agents', {});

export const writeAgentsSection = (value: Record<string, unknown>): Promise<void> =>
  updateConfig((doc) => {
    doc.agents = value;
  });

/** Whether the owner turned gbrain on. Services-only; the toggle is not the installer. */
export const writeGbrainSection = (enabled: boolean): Promise<void> =>
  updateConfig((doc) => {
    doc.gbrain = { enabled: Boolean(enabled) };
  });

/**
 * THE WANT LIST — the owner's typed intents, each judged against the found half per
 * read to produce a needed[] entry until the box satisfies it. The want persists (it
 * is intent); the needed entry never does (it is computed). Narrow shape, whole-list
 * replace: a short list the owner curates from ⚙, not a log.
 */
export const writeWantedSection = (list: Array<{ kind: string; name: string }>): Promise<void> =>
  updateConfig((doc) => {
    doc.wanted = list.slice(0, 50).map((w) => ({ kind: String(w.kind), name: String(w.name).slice(0, 80) }));
  });

/**
 * HAS THIS BOX BEEN THROUGH FIRST RUN? — and the answer must never be inferred.
 *
 * THE REGRESSION THIS EXISTS TO PREVENT (2026-08-17): a first-load surface gated on
 * *"`owner.name` is unset"*, which is true of a box with months of sessions and five
 * project roots on it, and it replaced the workspace at the workspace's own URL. The
 * owner's ruling: **do not guesstimate from a key that means something else — have a
 * specific key that means this.**
 *
 * THE TRAP INSIDE THAT RULING, and it is the whole reason this reads the way it does:
 * **absence must mean DO NOT SHOW.** A missing key is the normal state of every install
 * that predates the key, so a condition firing on absence breaks every existing box the
 * day it ships. So the key asserts *show me*, never *hide me*, and nothing anywhere is
 * allowed to invert it:
 *
 *   setup.pending === true     a genuinely fresh install, stamped at birth → show it
 *   setup.completed_at         it was done, and when → quiet
 *   no `setup` key at all      an install older than this key → quiet, forever
 *
 * **Birth is the absence of the FILE, not of a value.** `stampFreshInstall()` writes only
 * when `ronin.json` does not exist, which is the same signal the project-root floor
 * already uses, and it is the one moment a box is unambiguously new.
 */
export const readSetupSection = (): Promise<Record<string, unknown>> =>
  readSection<Record<string, unknown>>('setup', {});

/**
 * Stamp a brand-new install, once, at boot. **Writes nothing if the file exists** — an
 * install that has ever saved a setting is not new, and this must be safe to call on
 * every start forever. Best-effort by construction: failing to stamp costs a first-run
 * offer, and throwing here would cost the whole boot.
 */
export async function stampFreshInstall(): Promise<void> {
  try {
    await readFile(configPath(), 'utf8');
    return; // the file exists — this box has settings, so it is not being born
  } catch {
    /* no file: a fresh install, and the only moment this is knowable */
  }
  try {
    await updateConfig((doc) => {
      doc.setup = { pending: true, stamped_at: new Date().toISOString() };
    });
  } catch {
    /* a config store we cannot write is a different failure, and not this one's to raise */
  }
}

/** First run finished. `pending` goes, and when it happened stays — a record, not a flag. */
export const completeSetup = (): Promise<void> =>
  updateConfig((doc) => {
    doc.setup = { completed_at: new Date().toISOString() };
  });

/** Put the name on the bus for the bash half. Best-effort, exactly like publishMax. */
export async function publishOwner(name?: string): Promise<void> {
  const value = name ?? (await readOwner());
  try {
    await pexec('tmux', ['set-option', '-s', OWNER_OPT, value]);
  } catch {
    /* no server — the next boot or the next save publishes it */
  }
}

/** Real sessions, as the roster counts them: viewers are Ronin's plumbing, not your work. */
export async function liveCount(): Promise<number> {
  try {
    const { stdout } = await pexec('tmux', ['list-sessions', '-F', '#{session_name}']);
    return stdout.split('\n').filter((n) => n && !n.startsWith('grid_')).length;
  } catch {
    return 0; // no server: nothing is running, so nothing is at the limit
  }
}

/** Thrown by the guard so a route can answer 429 and a caller can tell it from a real fault. */
export class AtSessionMax extends Error {
  readonly max: number;
  readonly live: number;
  constructor(max: number, live: number) {
    super(
      `At the session max: ${live} of ${max} running. ` +
        `The owner sets this number at the top of the ⌂ Roster tab in Ronin. ` +
        `End a session, or raise the max — nothing else will let this start. ` +
        `The limit exists because past it the kernel chooses which session dies, and it chooses the largest, which is the lead.`,
    );
    this.name = 'AtSessionMax';
    this.max = max;
    this.live = live;
  }
}

/**
 * THE DECISION. Everything Node-side that makes a real session asks this.
 *
 * Throws `AtSessionMax` when the box is full. Silent when there is room, and silent when
 * no limit is set, so an install that never touched the setting never notices this exists.
 */
export async function assertUnderMax(): Promise<void> {
  const max = await readMax();
  if (max === NO_LIMIT) return;
  const live = await liveCount();
  if (live >= max) throw new AtSessionMax(max, live);
}

/* ---------------------------------------------------------------- WIPEBOARD FLUIDITY */

/**
 * HOW LONG A POST LIVES. SETTEI, because it is a thing the owner has SET about how this
 * install behaves — not a recipe and not code.
 *
 * A wipeboard is a transport, not a record (owner, 2026-08-23). One number says how
 * fluid: the TTL that retires a post whoever has read it (owner, 2026-08-25 — read-reaping was
 * dropped so the board holds its 48 hours of history for everyone). `ttl_hours: 0`
 * means never reap on age.
 *
 * A single wipeboard may override both by name, which is how one noisy surface can be
 * made shorter-lived than the house default without a second mechanism.
 *
 * NO TMUX BUS COPY, deliberately. `@ronin-session-max` and `@ronin-owner` are published
 * onto the server bus because a zero-dependency bash tool needs them without a second
 * JSON parser. `tejun-wipeboard` is not that: it runs `src/wipeboard-cli.ts` through tsx
 * and reads this file directly, so a published copy would be a second home for one fact
 * with nothing reading it. The owner edits `ronin.json`; there is no writer here until
 * a surface asks for one.
 */
const DEFAULT_TTL_HOURS = 48;

/** A number the owner typed, floored to non-negative; anything else is the default. */
const hours = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export async function readWipeboardSettings(board?: string): Promise<{ ttlMs: number }> {
  const sec = await readSection<Record<string, unknown>>('wipeboard', {});
  const per = (board && (sec[board] as Record<string, unknown> | undefined)) || {};
  const ttlH = hours(per.ttl_hours ?? sec.ttl_hours, DEFAULT_TTL_HOURS);
  return { ttlMs: ttlH * 3600_000 };
}
