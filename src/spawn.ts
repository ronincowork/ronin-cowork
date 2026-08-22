import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './config.js';
import { bootFiles, ensureShelf } from './session-boot.js';
import { listProjectRoots, listSessionLaunchSpecs, type ProjectRootInfo } from './project-roots.js';
import { readAgentsSection } from './user-config.js';
import { storeDir } from './stores.js';
import { findDefinition } from './definitions.js';
import { resolveLaunchProfile, type Dial, type LaunchProfile } from './launch-profile.js';

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
 * What the launcher sends: the two optional launch axes, plus whatever the user picked.
 * The field names are the three universal axes — the same keys that scope a memory and
 * address a macro, so one vocabulary spans the whole system.
 */
export interface SpawnForm {
  /**
   * WHO the session is, and it does not change again. Optional: a blank role is a real
   * launch, not a gap, and it simply contributes no role reading and no role defaults.
   */
  family_role?: string;
  /**
   * WHAT it is doing right now. Optional and mutable — the session rewrites it with
   * `write_tegami` and the owner rewrites it from the tile, and either write injects the
   * new task's reading into the running session.
   *
   * A launch naming NEITHER axis is not a catalog launch at all; the route hands it to
   * `launch_bare` instead of guessing which one was meant.
   */
  session_task?: string;
  prompt: string;
  /**
   * What the session is called. MANDATORY in manual mode: manual means Ronin adds
   * no wording of its own, and a name derived from the first 28 characters of your
   * prompt is exactly that — wording. You are about to run many of these side by
   * side; the name is how you address one, so you name it. Left empty (assisted
   * only) the name is slugged from the role or task + prompt as before.
   */
  name?: string;
  /**
   * 'manual'   — your text is the ENTIRE prompt. Nothing is prepended, appended
   *              or templated. Ronin only does the mechanical part (directory,
   *              CLI, dial, tags). Adding "helpful" wording here would defeat the
   *              whole point of the mode.
   * 'assisted' — the composed boot brief: the role's and task's postures + the
   *              reading list + the resolved opening template + your inject + the
   *              ack rule.
   *              This is the seat Koshi will eventually fill from one big text.
   */
  mode?: 'manual' | 'assisted';
  project_root?: string;
  cmd?: string;
  /**
   * MCP on or off for THIS session — a mechanical pick like the cmd, present in both
   * modes. True: the CLI's own config applies, untouched. False appends the provider's
   * declared `mcp_off` flags to the cmd, so the session launches with no MCP servers at
   * all; a provider that declares none REFUSES the launch rather than silently launching
   * connected. Ronin never learns what was disconnected — the flags are catalog data,
   * the servers are the CLI's own business.
   *
   * **Absent means "whatever the resolved profile says"** — the cascade's `mcp:` default,
   * which is off for every ordinary launch (owner, 2026-08-22). Only an explicit true or
   * false here overrides the definitions, so a caller that has no opinion cannot
   * accidentally connect a session by staying silent.
   */
  mcp?: boolean;
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
  dial: Dial;
  lifecycle: string;
  /** Both axes as resolved, either possibly ''. These are what TEGAMI is seeded with. */
  family_role: string;
  session_task: string;
  /** Never '' — a session must be born somewhere, and the resolver refuses otherwise. */
  project_root: string;
  mode: 'manual' | 'assisted';
  brief: string;
  /**
   * False when the profile resolves `agent: none` — a plain terminal. `cmd` and `brief` are
   * both empty in that case and the caller must type NEITHER into the pane; this flag
   * says so out loud rather than leaving the caller to infer it from an empty string.
   */
  agent: boolean;
  /** `cap: exempt` — born even at the session max. It still counts once it is. */
  capExempt: boolean;
  /** What the receipt reports: false only when the launch asked for MCP off AND the
   * provider declared how (`mcp_off` appended to cmd). */
  mcp: boolean;
  /**
   * THE CLI ACTUALLY LAUNCHED — `claude`, `codex` — the first word of `cmd`, basenamed.
   * Empty for an `agent: none` kind, which launches nothing at all.
   *
   * Stamped onto the session as `@ronin-agent` (src/tmux.ts) because this is the only
   * moment it is known for certain: after the spawn, all tmux can say is what the pane's
   * process is called, and for Codex that is `node`.
   */
  launchAgent: string;
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
  profile: LaunchProfile,
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
  // WHO FIRST, THEN WHAT. The postures are ADDITIVE (src/launch-profile.ts): a role's
  // posture and its task's posture are both true of this session, so the task's follows
  // the role's rather than displacing it. `profile.label` names the role when there is
  // one, because that is the durable answer to "who are you"; with no role it names the
  // task, which is the old wording exactly.
  if (profile.posture.length) parts.push(`You are the ${profile.label}. ${profile.posture.join(' ')}`);
  // THE SESSION BOOT SHELF, listed at this instant rather than remembered. This replaced
  // the project_root's `read:` — a stored list of literal paths that went stale in silence
  // the moment a file moved. Nothing is written down now, so nothing can be wrong: a file
  // that is gone simply is not named. See src/session-boot.ts.
  const reading = [...boot, ...(form.seed ?? [])].filter(Boolean);
  if (reading.length) parts.push(`Read first: ${reading.join(', ')}.`);
  parts.push(profile.opening.replace(/\{prompt\}/g, form.prompt));
  if (form.reference) {
    parts.push(
      // RIREKI's tape is the taught-normal catch-up (owner's ruling, 2026-08-20): it is
      // durable and answers without a tile. Pane peek stays as the no-tape fallback only.
      `The session in question is @${form.reference}` +
        (referenceDir ? ` (working in ${referenceDir})` : '') +
        `. Catch up on it with \`tejun-rireki ${form.reference} since\` ` +
        `(\`tejun-peek ${form.reference}\` if it has no tape), and control-check before touching it.`,
    );
  }
  if (form.inject?.trim()) parts.push(form.inject.trim());
  if (profile.ack) parts.push(ACK_RULE);
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

/**
 * tmux-safe, collision-free session name derived from what was launched and the intent.
 *
 * `intentKind` is the task when there is one and the role otherwise — the more specific
 * of the two, so a board full of `developer_*` sessions does not happen.
 */
export function slugName(intentKind: string, prompt: string, taken: Set<string>): string {
  const base = sanitizeName(`${intentKind}_${prompt}`, 28) || intentKind;
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * The profile's own working directory, if the cascade fixed one. `{install}` — the only
 * value a definition may carry, enforced in `src/launch-profile.ts` — is this Ronin's own
 * directory, resolved here at launch.
 *
 * A sentinel rather than a path, because a shipped definition naming a directory would be
 * a shipped file naming a machine (JUSHO).
 */
function profileDir(profile: LaunchProfile): string {
  return profile.dir === '{install}' ? REPO_ROOT : '';
}

export async function resolveForm(
  form: SpawnForm,
  taken: Set<string>,
  referenceDir?: string,
): Promise<Resolved> {
  const [roleDef, taskDef, roots, launchSpecs, agentsSet] = await Promise.all([
    findDefinition('family_roles', form.family_role ?? ''),
    findDefinition('session_tasks', form.session_task ?? ''),
    listProjectRoots(),
    listSessionLaunchSpecs(),
    readAgentsSection(),
  ]);
  // A NAMED axis that does not resolve is a refusal, never a silent blank. Blank and
  // wrong are different launches, and only one of them is what the caller asked for.
  if (form.family_role && !roleDef) {
    throw new Error(`Unknown family_role "${form.family_role}" (see ronin_catalogs/family_roles/).`);
  }
  if (form.session_task && !taskDef) {
    throw new Error(`Unknown session_task "${form.session_task}" (see ronin_catalogs/session_tasks/).`);
  }
  // THE CASCADE, and every refusal it makes happens here — before a session exists.
  const profile = resolveLaunchProfile(roleDef, taskDef);

  // PROJECT_ROOT IS REQUIRED, and omission is not a third answer: it selects the top
  // ACTIVE root, exactly as the launcher's picker does. An archived root stays
  // resolvable BY NAME (a name that used to launch must never stop meaning what it
  // meant); it is only the default that skips them.
  const active = roots.filter((r) => !r.archived);
  const root = form.project_root ? roots.find((r) => r.name === form.project_root) : active[0];
  if (form.project_root && !root) {
    throw new Error(`Unknown project_root "${form.project_root}" (see your PROJECT_ROOTS.md).`);
  }
  if (!root) {
    throw new Error(
      'This box has no active project_root, so there is nowhere to be born. ' +
        'Add or unarchive one in ⚙ Configuration, then launch again.',
    );
  }
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
  // `claude`: the tile is meant to be left at a shell prompt, untouched.
  const agent = profile.agent;
  // An explicit command for a launch that launches nothing is a contradiction somebody
  // typed, as against a default that merely cannot apply — so it is refused rather than
  // dropped. (`mcp` is not: it is meaningless without a CLI and has always been ignored.)
  if (!agent && form.cmd) {
    throw new Error(
      `This launch starts no agent (\`agent: none\`), so it cannot be given the command "${form.cmd}".`,
    );
  }

  // MCP off: append the provider's own declared flags to the cmd — data from the same
  // table the cmd came from, matched by the cmd string itself so a hand-typed cmd
  // (no table row) is honestly unsupported. No flags declared = REFUSE, because a
  // session the owner asked to launch disconnected must never launch connected.
  // THE INSTALL DEFAULT — what a new session launches as when the form names none.
  // A root never chooses a model (owner, 2026-08-18: one default, one place).
  // It is stored as `provider` + `model` and resolved through the
  // launch table HERE, never as a command string: the table is the one place a provider
  // is a row and a model is a column, and a stored cmd would freeze a vendor's flags into
  // the owner's config where no table edit could reach them.
  //
  // Before this existed the fallback was a bare `claude` — a string matching no table
  // row, so MCP-off refused it and a fresh box launched wrong. The bare literal stays as
  // the last resort for a box with no table at all, and it is the only Anthropic name in
  // this file for that reason.
  const dflt = (agentsSet.sessions as { default?: { provider?: string; model?: string } } | undefined)?.default;
  const defaultCmd = dflt?.provider && dflt?.model
    ? launchSpecs.find((s) => s.provider === dflt.provider && s.model === dflt.model)?.cmd
    : undefined;
  // THE `model:` BIAS, RESOLVED — and until 2026-08-22 it was decorative. Every definition
  // carried one ("which model this way of working usually deserves"), the cascade resolved
  // one, and nothing whatever read it: the install default won every launch that did not
  // name a command explicitly. So the field said one thing and the box did another.
  //
  // It sits BETWEEN the install default and the explicit pick, which is the cascade's own
  // order — system < family_role < session_task < this launch. The bias is a model NAME and
  // is matched against the launch table's own model column, never turned into a command
  // string here: the table is the one place a provider is a row and a model is a column.
  // The owner's default provider is preferred when two of them offer the same name, so
  // biasing toward `sonnet` on a Codex box stays on Codex.
  const biasCmd = profile.model
    ? (launchSpecs.find((s) => s.model === profile.model && s.provider === dflt?.provider)
        ?? launchSpecs.find((s) => s.model === profile.model))?.cmd
    : undefined;
  let cmd = agent ? form.cmd || biasCmd || defaultCmd || 'claude' : '';
  // The row this cmd came out of, matched BEFORE the MCP-off flags are appended below —
  // appending changes the very string the match is on, and looking it up afterwards would
  // find nothing for exactly the launches that asked for something unusual. It carried the
  // provider too until 2026-08-17, for a roster column the owner then cut to the model
  // alone; the mcp_off flags are what is left, and they were always the load-bearing use.
  const spec = launchSpecs.find((b) => b.cmd === cmd);
  // The launch's own say, and failing that the kind's default from the catalog. A kind
  // marked `mcp: always` is connected whatever anyone asked; the contradicting ask is
  // caught below rather than quietly overridden.
  const mcpWanted = profile.mcpAlways ? true : (form.mcp ?? profile.mcpDefault);
  // Somebody ASKED for off, as against off being merely what this kind defaults to. The
  // two are refused differently below, and only this one is a promise Ronin made.
  const askedOff = agent && form.mcp === false;
  let mcpOffWanted = agent && !mcpWanted;
  // A kind marked `mcp: always` is BORN connected (owner's ruling, 2026-08-17): the
  // launcher never offers the toggle for it, and a launch that asks anyway (a macro, a
  // hand-built request) is refused rather than silently connected or disconnected.
  if (askedOff && profile.mcpAlways) {
    throw new Error(
      `${profile.family_role || profile.session_task} is born connected (\`mcp: always\`) — ` +
        'it cannot be launched with MCP off.',
    );
  }
  if (mcpOffWanted && !spec?.mcpOff) {
    // Asked for and undeliverable is a broken promise: refuse, rather than launch a
    // session the receipt would call disconnected.
    if (askedOff) {
      throw new Error(
        'This launch command declares no `mcp_off:` flags in the launch table, ' +
          'so it cannot be launched with MCP off (see ronin_catalogs/PROJECT_ROOTS.md).',
      );
    }
    // Merely the profile's default, and this provider cannot do it. Since 2026-08-22 that
    // default is off for every ordinary launch, so refusing here would leave a box whose
    // launch table has no `mcp_off:` row — or that fell through to the bare fallback cmd —
    // unable to launch ANYTHING. The launch goes ahead connected and the receipt says
    // `mcp: true`, which is the truth; a default may degrade, a promise may not.
    mcpOffWanted = false;
  }
  if (mcpOffWanted) cmd = `${cmd} ${spec!.mcpOff}`;

  return {
    name: wanted || slugName(profile.session_task || profile.family_role, form.prompt, taken),
    // The profile's own `dir:` WINS over the project_root's, because it is a constant of
    // the launch — the same category as its dial, and a launch must not be able to leave
    // it to chance. Exactly one definition carries one (`mikaassist`, `{install}`): she
    // works on Ronin's own business, so she starts where Ronin's documents are whatever
    // root was picked.
    dir: profileDir(profile) || root.dir || '',
    cmd,
    tags: (form.tags ?? []).filter(Boolean).slice(0, 16),
    dial: profile.dial,
    lifecycle: profile.lifecycle,
    family_role: profile.family_role,
    session_task: profile.session_task,
    project_root: root.name,
    mode: form.mode === 'manual' ? 'manual' : 'assisted',
    // The shelf follows the toggle (owner's ruling, 2026-08-17): a session launched with
    // MCP off reads no *_connected shelf — the tools and the reading list about them ride
    // the same choice. The root, role and task shelves are untouched by it.
    brief: agent
      ? buildBrief(
          profile,
          root,
          form,
          referenceDir,
          await bootFiles(root.name, profile.family_role, profile.session_task, !mcpOffWanted),
        )
      : '',
    agent,
    capExempt: profile.capExempt,
    mcp: !mcpOffWanted,
    // `claude --model opus` -> `claude`; `/opt/homebrew/bin/codex --model …` -> `codex`.
    // The first word, basenamed, because the launch table's cells are commands and a cell
    // is free to name a path. RIREKI's decoder keys are bare binary names, and this value
    // is written into the option RIREKI reads, so it has to arrive in RIREKI's spelling.
    launchAgent: agent ? path.basename(cmd.trim().split(/\s+/)[0] ?? '') : '',
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
        family_role: form.family_role ?? '',
        session_task: form.session_task ?? '',
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
    console.error('[ronin] ledger:', (e as Error)?.message ?? e);
  }
}
