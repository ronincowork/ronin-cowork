/**
 * Spawn a new session from a filled form — the mechanical executor.
 *
 * The resolved launch profile fixes the constants: the dial the session is born on, its
 * lifecycle, whether it acknowledges before acting. They come from the cascade —
 * system < team_roster < session_role < this launch (`src/launch-profile.ts`). The user picks
 * project_root / session_launch_spec / tags. Nothing here calls a model — the smart fill populates this form,
 * it does not perform it. Order matters: create -> tag -> DIAL -> reply, so the
 * session is addressable and correctly locked from its first breath; the CLI
 * launch and the brief happen after the reply so the receipt is instant and a
 * spawn failure can never reach the event loop.
 */
import type express from 'express';
import {
  capturePane,
  createSession,
  isValidName,
  listSessions,
  sessionDir,
  sessionExists,
  setControl,
  setLaunchStamp,
  setLeads,
  setProviderSessionId,
  setCampaign,
  setProjectRoot,
  setTags,
} from '../tmux.js';
import { launchArgv, newProviderSession } from '../agents.js';
import { AtSessionMax, liveCount, readMax, readOwner, writeMax, writeOwner } from '../user-config.js';
import { resolveForm, appendLedger, type SpawnForm } from '../spawn.js';
import { mandate } from '../agent-defaults.js';
import { projectRoutineTools } from '../routine-tools.js';
import { classifyStatus, type SessionStatus } from '../status.js';
import { scanContext, scanModel } from '../ctx.js';

import { count } from '../counts.js';
import { listTeamRosters } from '../team-rosters.js';
import { announceTeamChanges } from './wipeboards-api.js';
import { markRoleDelivered } from '../role-watch.js';
import { checkoutAt, deriveTeams, parkBrief, seedTegami, withAxes, writeGate } from '../tegami.js';
import { emitSessionBorn, emitSessionWillBorn, collectBirthLines, collectRowFields } from '../sockets.js';
import { DESK_LIFECYCLES, prepareLaunchDesks } from '../launch-desks.js';
import { readArrangement } from '../desks/arrangement.js';
import { listProjectRoots } from '../project-roots.js';
import { initialCampaignId } from '../campaign-scope.js';
import { readTeamRoster } from '../team-rosters.js';

/**
 * The Campaign a newborn Agent joins: its Cowork's when it is born onto one, else the
 * initial Campaign. A rōnin gets a real Campaign rather than a blank, because the plan
 * requires every Agent to filter correctly whether or not it belongs to a Cowork.
 */
async function birthCampaign(team: string, explicit = ''): Promise<string> {
  if (explicit) return explicit;
  const roster = team ? await readTeamRoster(team).catch(() => null) : null;
  return roster?.campaign_id || (await initialCampaignId());
}

/**
 * Why a coding launch got no desk, in one line — or '' when it got one, or wanted none.
 * The file in the repository is the gate; when it is absent or says none, say so.
 */
async function deskNote(r: { assignment?: unknown; lifecycle?: string; project_root?: string; agent?: unknown; cmd?: string }): Promise<string> {
  if (r.assignment || !r.cmd || !DESK_LIFECYCLES.has(r.lifecycle ?? '') || !r.project_root) return '';
  const root = (await listProjectRoots()).find((x) => x.name === r.project_root);
  if (!root) return '';
  const a = await readArrangement(root.name, root.dir).catch(() => null);
  if (!a) return `no desk — ${root.name}'s RONIN_REPO could not be read`;
  if (a.source === 'absent') return `no desk — ${root.name} has no RONIN_REPO (add one: mode=reviewed working=dev stable=master desks=managed)`;
  if (a.desks !== 'managed') return `no desk — ${root.name} is declared ${a.mode}, desks ${a.desks}`;
  return '';
}

/* ---------- ONE door to a new session: POST /api/launch ----------
 * Three births, selected only by `session_type`:
 *   cowork_agent · bare_metal_agent · terminal
 *
 * Blank `session_role` is an ordinary value and never changes the birth path. The
 * RETIRED axis keys are refused by name below — a caller still sending `role_family` or
 * `session_task` deserves to be told the model moved, not a different kind of session
 * with its words ignored.
 */
export function registerLaunch(app: express.Express): void {
  // launch_job — the catalog variant. NAMED, not inlined, since 2026-08-26: `/api/session`
  // below is a second DOOR onto this same body, never a second launch path (the parity
  // invariant, tests/launch-parity.test.ts).
  const launchJob: express.RequestHandler = async (req, res) => {
    // The retired keys, refused by name (410-shaped, but a launch is a POST that never
    // existed per-key, so 400 with the teaching text is the honest shape here).
    if (['role_family', 'family_role', 'session_task', 'team_role', 'campaign_kind', 'lifecycle']
      .some((key) => req.body?.[key] !== undefined)) {
      return res.status(400).json({
        error:
          'This launch names a retired axis. The model moved on 2026-08-23 (R35): a session is ' +
          'a mutable `session_role` born onto an optional `team` — there is no per-session ' +
          'role_family, `team_role`, `campaign_kind`, or `lifecycle`; `session_task` is now `session_role`.',
      });
    }
    const sessionType = String(req.body?.session_type ?? '').trim();
    if (!['cowork_agent', 'bare_metal_agent', 'terminal'].includes(sessionType)) {
      return res.status(400).json({
        error: 'Send `session_type`: `cowork_agent`, `bare_metal_agent`, or `terminal`. Ronin does not infer a session type from `session_role`, `team`, or `agent`.',
      });
    }
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: '`name` is required for every session type.' });
    if (!isValidName(name)) return res.status(400).json({ error: 'Use letters, digits, _ or - (no spaces, . or :).' });

    const forbidden = (keys: string[], teaching: string): express.Response | undefined => {
      const sent = keys.filter((key) => req.body?.[key] !== undefined);
      if (!sent.length) return undefined;
      return res.status(400).json({ error: `${teaching} Remove: ${sent.map((key) => `\`${key}\``).join(', ')}.` });
    };
    if (sessionType === 'terminal') {
      const refusal = forbidden(
        ['provider', 'model', 'instructions', 'prompt', 'kind', 'mandate', 'behaviours', 'routines', 'sops', 'cmd', 'mcp', 'seed', 'inject', 'reference', 'session_role'],
        'A `terminal` starts no Agent, so Agent fields do not apply.',
      );
      if (refusal) return refusal;
    }
    if (sessionType === 'bare_metal_agent') {
      const refusal = forbidden(
        ['kind', 'mandate', 'behaviours', 'routines', 'sops', 'seed', 'inject', 'reference', 'session_role', 'team_lead'],
        'A `bare_metal_agent` starts the provider CLI directly: it has no Ronin reading, Routines, brief, or managed desk.',
      );
      if (refusal) return refusal;
      if (req.body?.desk === 'own') {
        return res.status(400).json({ error: 'A `bare_metal_agent` has no managed repository desk; use `desk: none` or omit `desk`.' });
      }
      if (!String(req.body?.project_root ?? '').trim()) {
        return res.status(400).json({ error: 'A `bare_metal_agent` requires `project_root` for its working directory; it is placement, not Ronin birth material.' });
      }
    }
    const returnedOnly = forbidden(
      ['assignment', 'posture', 'opening', 'ack', 'capExempt', 'launchAgent', 'stated_by', 'birth_reading'],
      'These fields are resolved and returned by the server, never accepted from a launch caller.',
    );
    if (returnedOnly) return returnedOnly;
    const sessionRole = String(req.body?.session_role ?? '').trim();
    const team = String(req.body?.team ?? '').trim();
    const form: SpawnForm = {
      session_type: sessionType as SpawnForm['session_type'],
      session_role: sessionRole,
      team: team || undefined,
      team_lead: req.body?.team_lead === true,
      prompt: String(req.body?.instructions ?? req.body?.prompt ?? '').trim(),
      name,
      dial: req.body?.dial === 'user' || req.body?.dial === 'read' || req.body?.dial === 'write' ? req.body.dial : undefined,
      project_root: String(req.body?.project_root ?? '').trim() || undefined,
      cmd: String(req.body?.cmd ?? '').trim() || undefined,
      model: String(req.body?.model ?? '').trim() || undefined,
      // Whose CLI, without naming a model — resolved through that provider's preferred
      // model in ⚙ Configuration (owner, 2026-08-29).
      provider: String(req.body?.provider ?? '').trim() || undefined,
      mandate: sessionType === 'cowork_agent' && req.body?.mandate !== undefined
        ? mandate(req.body.mandate)
        : undefined,
      campaign_id: String(req.body?.campaign_id ?? '').trim() || undefined,
      // Only an explicit boolean is an opinion. Absent hands the choice to the resolved
      // profile's `mcp:` default (off for every ordinary launch, owner 2026-08-22)
      // rather than meaning "on", so a caller with nothing to say cannot connect a
      // session by omission.
      mcp: typeof req.body?.mcp === 'boolean' ? req.body.mcp : undefined,
      tags: Array.isArray(req.body?.tags) ? req.body.tags.map(String) : [],
      seed: Array.isArray(req.body?.seed) ? req.body.seed.map(String) : [],
      inject: String(req.body?.inject ?? '').trim() || undefined,
      reference: String(req.body?.reference ?? '').trim() || undefined,
      desk: req.body?.desk === 'own' || req.body?.desk === 'none' ? req.body.desk : undefined,
    };
    // What the session is for is checked AFTER the resolve, because whether it is
    // required depends on the resolved profile: it is the agent's first message, and an
    // `agent: none` launch has no agent to tell. See below.

    let resolved;
    let launch: { argv: string[]; parked: boolean } = { argv: [], parked: false };
    try {
      const live = await listSessions();
      const taken = new Set(live.map((s) => s.name));
      // Point-at-a-session is revalidated here, not trusted from the browser: the
      // pick was made when the form opened and the session may since have died.
      if (form.reference && !taken.has(form.reference)) {
        return res.status(409).json({ error: `Session "${form.reference}" is gone — pick another.` });
      }
      const referenceDir = form.reference ? await sessionDir(form.reference) : undefined;
      resolved = await resolveForm(form, taken, referenceDir);
    } catch (e) {
      return res.status(400).json({ error: String((e as Error)?.message ?? e) });
    }
    // The session max is NOT checked here. It lives in createSession(), which both launch
    // handlers funnel through — a check in this handler alone is bypassed by posting a body
    // naming neither axis, which falls through to launch_bare.
    if (!isValidName(resolved.name)) return res.status(400).json({ error: 'Could not derive a session name.' });
    if (await sessionExists(resolved.name)) return res.status(409).json({ error: `Session "${resolved.name}" already exists.` });
    const teams = new Set((await listTeamRosters()).filter((item) => item.state !== 'archived').map((item) => item.name));
    const unknownTeams = resolved.tags.filter((name) => !teams.has(name));
    if (unknownTeams.length) return res.status(400).json({ error: `Unknown Team: ${unknownTeams.join(', ')}.` });

    // THE DESKS ARE OPENED BEFORE THE CLI EXISTS, so its first command runs at a desk. A
    // failure here is the launch's answer — 409, the reason, no session — never a quiet
    // start in the root's funnel checkout with a brief that says otherwise
    // (docs/control-surface.md §2). Nothing was created yet, so there is nothing to undo.
    if (resolved.assignment) {
      try {
        resolved.assignment = await prepareLaunchDesks(resolved.assignment);
      } catch (e) {
        void appendLedger(form, resolved, false);
        return res.status(409).json({ error: String((e as Error)?.message ?? e) });
      }
    }

    try {
      await emitSessionWillBorn(resolved.name); // rireki resets a reused name's stale tape here
      // THE CLI IS THE TILE'S PROCESS, and the brief rides on its command line. There is no
      // shell in an agent tile, so there is nothing for a machine to type at — which is the
      // whole ruling (wip/buildouts/LAUNCH_READY.md). An `agent: none` kind passes no argv
      // and gets the login shell, exactly as before: OpenShell is untouched.
      const launchWords = resolved.session_type === 'bare_metal_agent' ? (form.prompt ?? '') : resolved.brief;
      launch = resolved.agent ? await launchArgv(resolved.cmd, launchWords) : { argv: [], parked: false };
      if (resolved.agent && !launch.argv.length) {
        return res.status(400).json({
          error: `Could not find ${resolved.cmd.trim().split(/\s+/)[0]} on this machine. Install it from ⚙ Configuration, then launch again.`,
        });
      }
      const providerSession = newProviderSession(resolved.launchAgent, launch.argv);
      launch.argv = providerSession.argv;
      // The Agent does not run through a login or interactive shell. Project its commands
      // into PATH here, at process birth, instead of hoping an rc file was sourced.
      const routineTools = resolved.agent
        ? await projectRoutineTools(resolved.name, resolved.routines)
        : null;
      await createSession(resolved.name, resolved.dir, {
        agent: resolved.agent,
        exempt: resolved.capExempt,
        argv: launch.argv,
        env: routineTools ? { PATH: routineTools.path } : undefined,
        // Closed atomically with birth. The resolved Control opens only after the brief,
        // identity, Team, Campaign, letter and role-delivery baseline are all installed.
        control: resolved.agent ? 'user' : undefined,
      });
      if (resolved.tags.length) {
        await setTags(resolved.name, resolved.tags);
        // Born onto a team whose wipeboard is already a conversation? Then the newborn
        // is told, same as any tag change — and a failed notice never costs a launch.
        await announceTeamChanges(resolved.name, [], resolved.tags).catch(() => {});
      }
      // BORN AS THE 人: the same column the hand-set route writes, written at birth. The
      // teams SOP is already in the brief (`bootReading`), so no message is sent here.
      if (form.team_lead && resolved.team) await setLeads(resolved.name, [resolved.team]);
      // The project_root the session serves, written at birth — the one moment tagging
      // reliably happens. Two shipped tools (tejun-recall, tejun-remember) read this to
      // scope a memory and nothing used to set it.
      if (resolved.project_root && resolved.session_type !== 'bare_metal_agent') await setProjectRoot(resolved.name, resolved.project_root);
      // THE CAMPAIGN, beside the project_root and for the same reason: one value, known at
      // birth, and the axis every view filters on. It is taken from the Cowork the Agent is
      // born onto when there is one, and otherwise from the initial Campaign — a rōnin has
      // a Campaign too, which is exactly why this is not derived from membership.
      const campaignId = resolved.session_type === 'bare_metal_agent'
        ? (form.campaign_id || await initialCampaignId())
        : await birthCampaign(resolved.team, form.campaign_id);
      await setCampaign(resolved.name, campaignId);
      // WHICH CLI, written at birth for the same reason the project_root is: this is the
      // one moment it is known. The cmd names the CLI, and a minute from now tmux can only
      // say the pane is running `node`. NOT for the roster — that column is the scraped
      // model alone now — but for RIREKI, which picks a tape decoder from `@ronin-agent`
      // and has expected this stamp since it was written, guessing until today.
      await setLaunchStamp(resolved.name, resolved.launchAgent);
      if (providerSession.id) await setProviderSessionId(resolved.name, providerSession.id);
      // THE AXIS AND THE TEAMS BLOCK, SET MECHANICALLY. The button the owner pressed IS
      // what this session is for, so the letter is written with `session_role` already
      // filled — and the derived `teams` block rendered from the birth tags — rather
      // than left for the agent to guess at facts that were never in doubt. The role is
      // the session's from here (`write_tegami`); the teams block is the machinery's.
      // We never overwrite a letter that exists. See src/tegami.ts.
      if (resolved.session_type === 'cowork_agent') {
        await seedTegami(
          resolved.name,
          resolved.session_role,
          resolved.assignment?.desks.length
            ? resolved.assignment.desks.map((d) => ({ repo: d.repo, branch: d.branch, worktree: d.worktree, line: d.line }))
            : await checkoutAt(resolved.dir),
        await deriveTeams(resolved.tags),
        resolved.mandate,
      );
      }
      // THE BIRTH BASELINE for the task observer: this task's reading is already in the
      // brief, so it is recorded as delivered and the first tick does not send it again
      // (src/role-watch.ts).
      if (resolved.session_type === 'cowork_agent') await markRoleDelivered(resolved.name, resolved.session_role);
      await setControl(resolved.name, resolved.dial);
    } catch (e) {
      void appendLedger(form, resolved, false);
      // A full box is not a server fault: 429 so the launcher shows the reason as a refusal
      // rather than a crash, and so a caller can tell "try later" from "this is broken".
      if (e instanceof AtSessionMax) {
        return res.status(429).json({ error: e.message, max: e.max, live: e.live });
      }
      return res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }

    // The receipt: what the session was actually born with, so a wrong fill is
    // visible immediately and killable — the price of launching without a confirm.
    // TOMODACHI: how it was born and what job it was launched as. `born` is the launcher
    count('born', {
      name: resolved.name,
      born: 'launch',
      role: resolved.session_role,
    });
    // THE LAUNCH SOCKET: services that care about a birth hear it here (fire-and-forget).
    emitSessionBorn({
      name: resolved.name,
      role: resolved.session_role,
      team: resolved.team,
      root: resolved.project_root,
      cmd: resolved.cmd,
    });

    if (resolved.session_type === 'bare_metal_agent') {
      res.json({
        ok: true,
        name: resolved.name,
        session_type: resolved.session_type,
        dir: resolved.dir,
        cmd: resolved.cmd,
        tags: resolved.tags,
        campaign_id: form.campaign_id || await initialCampaignId(),
        birth: 'none',
      });
    } else res.json({
      ok: true,
      name: resolved.name,
      receipt: {
        session_type: resolved.session_type,
        session_role: resolved.session_role,
        team: resolved.team,
        project_root: resolved.project_root,
        dir: resolved.dir,
        cmd: resolved.cmd,
        dial: resolved.dial,
        lifecycle: resolved.lifecycle,
        tags: resolved.tags,
        mcp: resolved.mcp,
        team_lead: !!form.team_lead && !!resolved.team,
        ...(resolved.session_type === 'cowork_agent'
          ? { boot: { state: 'open', brief: launch.parked ? 'parked' : 'argv' } }
          : {}),
        // The receipt says which desks this session was born with — repo, branch, path,
        // line — or an empty list, which is the honest receipt for most launches.
        desks: resolved.assignment?.desks.map((d) => ({ repo: d.repo, branch: d.branch, worktree: d.worktree, line: d.line })) ?? [],
        // And WHY a coding launch got none, when it did — "off by absence" is never silent
        // (owner, 2026-08-29): the receipt names the file that decides.
        desk_note: await deskNote(resolved),
      },
    });
    void appendLedger(form, resolved, true);
    void (async () => {
      // NOTHING IS TYPED HERE, and there is no longer anywhere to type. The session was
      // born running the CLI with its brief already on the command line; from this moment
      // the tile belongs to the person. They walk the first run, answer whatever the vendor
      // asks, and sign in with whatever account or key is theirs — none of which is Ronin's
      // business and none of which is Ronin's keystroke.
      //
      // What is left is the one case words could not ride argv: a vendor that takes no
      // initial prompt, and anything only knowable after the session exists — a services
      // birth line names the letter, and the letter's path is keyed on the session's own
      // creation time, so it cannot be known before there is a session. Those go on the
      // shelf, and the ladder says where. On a build with no services and a vendor that
      // takes a prompt — which is every vendor today — this does nothing at all.
      if (resolved.session_type !== 'cowork_agent' || !resolved.agent) return;
      const birthLines = await collectBirthLines(resolved.name, true);
      const shelved = [launch.parked ? resolved.brief : '', birthLines].filter(Boolean).join('\n');
      if (!shelved) return;
      const at = await parkBrief(resolved.name, shelved);
      if (at) {
        await writeGate(
          resolved.name,
          launch.parked
            ? 'Your brief could not be handed to this agent at launch, so it is parked in brief.md beside this session. Read it there.'
            : 'There is a note for this session in brief.md beside it.',
        );
      }
    })().catch((e) => console.error(`[ronin] spawn ${resolved.name}:`, e));
  };
  app.post('/api/launch', launchJob);

  app.get('/api/sessions', async (_req, res) => {
    try {
      res.json(await withAxes(await listSessions()));
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // Home-panel feed: the session list enriched with a status-probe classification
  // (ready / thinking / awaiting-input, patterns in src/status.ts), the context-gauge
  // reading and the MODEL beside it — one capture-pane per session, shared by all three
  // scrapes. The model rides this capture rather than earning its own tmux call: it sits
  // on the very status line the gauge is read off (src/ctx.ts), so it is free here.
  //
  // Model is scraped from the live pane; the selected Agent rides listSessions' birth
  // stamp. League View shows both because they answer different operational questions.
  app.get('/api/home', async (_req, res) => {
    try {
      const list = await withAxes(await listSessions());
      const out = await Promise.all(
        list.map(async (s) => {
          let status: SessionStatus | null = null;
          let ctx: number | null = null;
          let model: string | null = null;
          try {
            const text = await capturePane(s.name, 0);
            status = classifyStatus(text);
            ctx = scanContext(text);
            model = scanModel(text);
          } catch {
            // session vanished mid-scan — plain row, no readings
          }
          // THE ROW SOCKET: services contribute their fields (michi's tegami ladder
          // column among them); none registered = nothing added and the board prints "—".
          return {
            ...s,
            status,
            ctx,
            model,
            ...(await collectRowFields(s.name)),
          };
        }),
      );
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  /**
   * THE SESSION MAX — the owner's number, read and written by the ⌂ Roster tab.
   *
   * One number, one pair of routes. `live` rides along on the GET because the field that
   * shows the max also shows what is running beside it, and asking twice for one line would
   * be two round-trips for one row.
   */
  app.get('/api/session-max', async (_req, res) => {
    try {
      res.json({ max: await readMax(), live: await liveCount() });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  /**
   * THE OWNER'S NAME — read and set. The wipeboard watermark used to be the literal
   * `user: glen`, so every install signed its owner's posts with ours (JUSHO: nothing
   * shipped names a person). Unset, this answers with the machine's own user, so a fresh
   * install is already correct and this route is a preference, never a required step.
   *
   * No UI yet, by decision: the name had to stop being a literal today, and the field it
   * eventually sits in belongs with the rest of the owner's settings rather than bolted
   * beside the session max.
   */
  app.get('/api/owner', async (_req, res) => {
    try {
      res.json({ name: await readOwner() });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // The owner's name is WRITTEN through the settei door (`PUT /api/settei/owner`,
  // routes/settei-api.ts) — its only writers were the setup surfaces, so it folded in
  // (2026-08-18). The read stays here beside the fallback rule it documents.

  app.put('/api/session-max', async (req, res) => {
    const raw = req.body?.max;
    const n = typeof raw === 'number' ? raw : Number(raw);
    // Reject what we cannot honour rather than silently flooring it: a field that shows a
    // different number from the one you typed is worse than one that says no.
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return res.status(400).json({ error: 'The session max is a whole number, 0 or more (0 = no limit).' });
    }
    try {
      // writeMax republishes to the tmux option, so the shim's door agrees with this one
      // from the moment the field is saved rather than from the next restart.
      res.json({ max: await writeMax(n), live: await liveCount() });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  /**
   * THE SESSION DOOR — `POST /api/session { name, caller?, team?, team_lead?, …launch keys }`
   * (owner, 2026-08-26). Every key is optional and falls
   * through the profile ladder exactly as a ＋ New launch does, because this IS that
   * launch: the body is filled in and handed to `launchJob` / `launchBare` above. A
   * second door, never a second path.
   *
   * WHAT IT ADDS IS THE TEAM DEFAULT. Nearly every call comes from a session growing its
   * own team, so `team` absent means THE CALLER'S TEAM — the first tag the calling
   * session carries (owner: *"just take the first one, and then if people don't like
   * it, they just drag it and drop it. It's not a big deal"*). A caller on no team, or no
   * caller at all (the browser), births a rōnin. Nothing here is a refusal: a session
   * landing in the rōnin column is a session that exists, and the nag this door removes
   * is an agent flip-flopping between "create the team" and "add the member".
   *
   * `caller` is the session's own name, resolved by the CLI from its pane
   * (`ronin_bin/tejun-session-set`, the same `me()` every tejun uses) — the server cannot
   * see which pane an HTTP request came from. `team_from` in the receipt says which
   * rule fired, so the agent never has to guess what it got.
   */
  app.post('/api/session', async (req, res, next) => {
    const name = String(req.body?.name ?? '').trim();
    if (name && !isValidName(name)) return res.status(400).json({ error: 'Use letters, digits, _ or - (no spaces, . or :).' });
    const caller = String(req.body?.caller ?? '').trim();
    let team = String(req.body?.team ?? '').trim();
    let teamFrom: 'explicit' | 'caller' | 'none' = team ? 'explicit' : 'none';
    let campaignId = String(req.body?.campaign_id ?? '').trim();
    if (caller) {
      const origin = (await listSessions()).find((s) => s.name === caller);
      const mine = origin?.tags ?? [];
      if (mine.length) {
        if (!team) {
          team = mine[0];
          teamFrom = 'caller';
        }
      }
      if (!campaignId) campaignId = origin?.campaign_id ?? '';
    }
    req.body = { ...req.body, session_type: req.body?.session_type ?? 'cowork_agent', name: name || undefined, team: team || undefined, campaign_id: campaignId || undefined };
    // The receipt is launchJob's; `team_from` rides on top of it so the two doors never
    // disagree about what a launch is — only about how the team was chosen.
    const send = res.json.bind(res);
    res.json = (body: unknown) =>
      send(body && typeof body === 'object' && (body as { ok?: boolean }).ok ? { ...body, team_from: teamFrom } : body);
    return launchJob(req, res, next);
  });
}
