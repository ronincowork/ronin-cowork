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
  setProjectRoot,
  setTags,
} from '../tmux.js';
import { launchArgv } from '../agents.js';
import { AtSessionMax, liveCount, readMax, readOwner, writeMax, writeOwner } from '../user-config.js';
import { resolveForm, appendLedger, type SpawnForm } from '../spawn.js';
import { classifyStatus, type SessionStatus } from '../status.js';
import { scanContext, scanModel } from '../ctx.js';

import { count } from '../counts.js';
import { announceTeamChanges } from './wipeboards-api.js';
import { markRoleDelivered } from '../role-watch.js';
import { checkoutAt, deriveTeams, parkBrief, seedTegami, withAxes, writeGate } from '../tegami.js';
import { emitSessionBorn, emitSessionWillBorn, collectBirthLines, collectRowFields } from '../sockets.js';

/* ---------- ONE door to a new session: POST /api/launch ----------
 * Two variants, chosen by what the body carries — never two endpoints:
 *   launch_job    a session_role (and/or a team) + prompt   the ＋ New tab
 *   launch_bare   a name and nothing else                   the tile picker
 *
 * A body naming a `session_role` or a `team` is the catalog variant; one naming neither
 * is not a catalog launch at all and falls through rather than being guessed at. The
 * RETIRED axis keys are refused by name below — a caller still sending `role_family` or
 * `session_task` deserves to be told the model moved, not a bare session with its words
 * ignored. Express walks the handlers in order; the first hands on what is not its shape.
 *
 * There was a third, launch_quick (a name plus a cmd/prompt/tags/dir), fed by the
 * Roster's own Start row. The owner removed that launcher on 2026-08-12 — one
 * launcher, and it is ＋ New session — which left the route with no caller, so it
 * went too. A body carrying cmd/prompt/tags/dir but neither launch axis now lands on
 * launch_bare: the session is created under that name and the extras are ignored.
 */
export function registerLaunch(app: express.Express): void {
  // launch_job — the catalog variant.
  app.post('/api/launch', async (req, res, next) => {
    // The retired keys, refused by name (410-shaped, but a launch is a POST that never
    // existed per-key, so 400 with the teaching text is the honest shape here).
    if (req.body?.role_family !== undefined || req.body?.family_role !== undefined || req.body?.session_task !== undefined) {
      return res.status(400).json({
        error:
          'This launch names a retired axis. The model moved on 2026-08-23 (R35): a session is ' +
          'a mutable `session_role` born onto an optional `team` — there is no per-session ' +
          'role_family, and `session_task` is now `session_role`.',
      });
    }
    const sessionRole = String(req.body?.session_role ?? '').trim();
    const team = String(req.body?.team ?? '').trim();
    if (!sessionRole && !team) return next();
    const form: SpawnForm = {
      session_role: sessionRole,
      team: team || undefined,
      prompt: String(req.body?.prompt ?? '').trim(),
      name: String(req.body?.name ?? '').trim() || undefined,
      mode: req.body?.mode === 'manual' ? 'manual' : 'assisted',
      project_root: String(req.body?.project_root ?? '').trim() || undefined,
      cmd: String(req.body?.cmd ?? '').trim() || undefined,
      // Only an explicit boolean is an opinion. Absent hands the choice to the resolved
      // profile's `mcp:` default (off for every ordinary launch, owner 2026-08-22)
      // rather than meaning "on", so a caller with nothing to say cannot connect a
      // session by omission.
      mcp: typeof req.body?.mcp === 'boolean' ? req.body.mcp : undefined,
      tags: Array.isArray(req.body?.tags) ? req.body.tags.map(String) : [],
      seed: Array.isArray(req.body?.seed) ? req.body.seed.map(String) : [],
      inject: String(req.body?.inject ?? '').trim() || undefined,
      reference: String(req.body?.reference ?? '').trim() || undefined,
    };
    // Manual adds no wording of ours — including the name. You name it.
    if (form.mode === 'manual' && !form.name) return res.status(400).json({ error: 'Name the session.' });
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
    // The prompt IS the agent's first message, so an agent launch cannot start without one.
    // A plain terminal needs only a name — demanding a sentence nobody will ever read
    // would be a form asking a question it then throws away.
    if (resolved.agent && !form.prompt) return res.status(400).json({ error: 'Say what the session is for.' });

    // The session max is NOT checked here. It lives in createSession(), which both launch
    // handlers funnel through — a check in this handler alone is bypassed by posting a body
    // naming neither axis, which falls through to launch_bare.
    if (!isValidName(resolved.name)) return res.status(400).json({ error: 'Could not derive a session name.' });
    if (await sessionExists(resolved.name)) return res.status(409).json({ error: `Session "${resolved.name}" already exists.` });

    try {
      await emitSessionWillBorn(resolved.name); // rireki resets a reused name's stale tape here
      // THE CLI IS THE TILE'S PROCESS, and the brief rides on its command line. There is no
      // shell in an agent tile, so there is nothing for a machine to type at — which is the
      // whole ruling (wip/buildouts/LAUNCH_READY.md). An `agent: none` kind passes no argv
      // and gets the login shell, exactly as before: OpenShell is untouched.
      launch = resolved.agent ? await launchArgv(resolved.cmd, resolved.brief) : { argv: [], parked: false };
      if (resolved.agent && !launch.argv.length) {
        return res.status(400).json({
          error: `Could not find ${resolved.cmd.trim().split(/\s+/)[0]} on this machine. Install it from ⚙ Configuration, then launch again.`,
        });
      }
      await createSession(resolved.name, resolved.dir, {
        agent: resolved.agent,
        exempt: resolved.capExempt,
        argv: launch.argv,
      });
      if (resolved.tags.length) {
        await setTags(resolved.name, resolved.tags);
        // Born onto a team whose wipeboard is already a conversation? Then the newborn
        // is told, same as any tag change — and a failed notice never costs a launch.
        await announceTeamChanges(resolved.name, [], resolved.tags).catch(() => {});
      }
      // The project_root the session serves, written at birth — the one moment tagging
      // reliably happens. Two shipped tools (tejun-recall, tejun-remember) read this to
      // scope a memory and nothing used to set it.
      if (resolved.project_root) await setProjectRoot(resolved.name, resolved.project_root);
      // WHICH CLI, written at birth for the same reason the project_root is: this is the
      // one moment it is known. The cmd names the CLI, and a minute from now tmux can only
      // say the pane is running `node`. NOT for the roster — that column is the scraped
      // model alone now — but for RIREKI, which picks a tape decoder from `@ronin-agent`
      // and has expected this stamp since it was written, guessing until today.
      await setLaunchStamp(resolved.name, resolved.launchAgent);
      // THE AXIS AND THE TEAMS BLOCK, SET MECHANICALLY. The button the owner pressed IS
      // what this session is for, so the letter is written with `session_role` already
      // filled — and the derived `teams` block rendered from the birth tags — rather
      // than left for the agent to guess at facts that were never in doubt. The role is
      // the session's from here (`write_tegami`); the teams block is the machinery's.
      // We never overwrite a letter that exists. See src/tegami.ts.
      await seedTegami(
        resolved.name,
        resolved.session_role,
        await checkoutAt(resolved.dir),
        await deriveTeams(resolved.tags),
      );
      // THE BIRTH BASELINE for the task observer: this task's reading is already in the
      // brief, so it is recorded as delivered and the first tick does not send it again
      // (src/role-watch.ts).
      await markRoleDelivered(resolved.name, resolved.session_role);
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
    // mode here; a forkit-spawned session is marked by the macro, and anything Ronin never
    // spawned shows up as `hand` at the next census — the absence being the datum.
    count('born', {
      name: resolved.name,
      born: resolved.mode === 'manual' ? 'manual' : 'assisted',
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

    res.json({
      ok: true,
      name: resolved.name,
      receipt: {
        session_role: resolved.session_role,
        team: resolved.team,
        team_role: resolved.team_role,
        mode: resolved.mode,
        project_root: resolved.project_root,
        dir: resolved.dir,
        cmd: resolved.cmd,
        dial: resolved.dial,
        lifecycle: resolved.lifecycle,
        tags: resolved.tags,
        mcp: resolved.mcp,
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
      const birthLines = await collectBirthLines(resolved.name, !!resolved.agent);
      if (!resolved.agent) return;
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
  });

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
  // THE MODEL IS THE WHOLE COLUMN. It shipped for one commit as `agent · provider · model`,
  // read from a birth stamp; the owner cut it to the model alone, because `opus 5` already
  // says Claude and `gpt-5.6-sol` already says Codex. The `launchStamps()` board read that
  // served the other two went with them. The upside of what is left is that scraping needs
  // no stamp, so this is right for every session on the box today rather than only for
  // those born after a restart.
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

  // launch_bare — a name and nothing else.
  app.post('/api/launch', async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!isValidName(name)) {
      return res.status(400).json({ error: 'Invalid name. Use letters, digits, _ or - (no spaces, . or :).' });
    }
    if (await sessionExists(name)) {
      return res.status(409).json({ error: `Session "${name}" already exists.` });
    }
    try {
      await emitSessionWillBorn(name);
      // A bare shell: never refused at the max (see CreateOpts), still counted.
      await createSession(name, undefined, { agent: false });
      // The other creation path, and it is a birth like launch_job's — seed as newborn, not
      // as backfill, so the session starts held at its go/no-go rather than blank.
      void collectBirthLines(name, true);
      res.json({ ok: true, name });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
