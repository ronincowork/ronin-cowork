/**
 * Spawn a new session from a filled form — the mechanical executor.
 *
 * The session_job fixes the constants: the dial the session is born on, its
 * lifecycle, whether it acknowledges before acting. The user picks
 * project_root / brain / tags. Nothing here calls a model — the smart fill populates this form,
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
  runCommand,
  sendText,
  sessionDir,
  sessionExists,
  setControl,
  setProjectRoot,
  setTags,
} from '../tmux.js';
import { AtSessionMax, liveCount, readMax, readOwner, writeMax, writeOwner } from '../user-config.js';
import { resolveForm, appendLedger, type SpawnForm } from '../spawn.js';
import { classifyStatus, waitReady, type SessionStatus } from '../status.js';
import { scanContext } from '../ctx.js';

import { count } from '../counts.js';
import { emitSessionBorn, emitSessionWillBorn, collectBirthLines, collectRowFields } from '../sockets.js';

/* ---------- ONE door to a new session: POST /api/launch ----------
 * Two variants, chosen by what the body carries — never two endpoints:
 *   launch_job    a session_job + prompt      the ＋ New tab, the full catalog fill
 *   launch_bare   a name and nothing else     the tile picker
 * Express walks them in order; the first hands on what is not its shape.
 *
 * There was a third, launch_quick (a name plus a cmd/prompt/tags/dir), fed by the
 * Roster's own Start row. The owner removed that launcher on 2026-08-12 — one
 * launcher, and it is ＋ New session — which left the route with no caller, so it
 * went too. A body carrying cmd/prompt/tags/dir but no session_job now lands on
 * launch_bare: the session is created under that name and the extras are ignored.
 */
export function registerLaunch(app: express.Express): void {
  // launch_job — the catalog variant.
  app.post('/api/launch', async (req, res, next) => {
    if (!String(req.body?.session_job ?? '').trim()) return next();
    const form: SpawnForm = {
      session_job: String(req.body?.session_job ?? '').trim(),
      prompt: String(req.body?.prompt ?? '').trim(),
      name: String(req.body?.name ?? '').trim() || undefined,
      mode: req.body?.mode === 'manual' ? 'manual' : 'assisted',
      project_root: String(req.body?.project_root ?? '').trim() || undefined,
      cmd: String(req.body?.cmd ?? '').trim() || undefined,
      tags: Array.isArray(req.body?.tags) ? req.body.tags.map(String) : [],
      seed: Array.isArray(req.body?.seed) ? req.body.seed.map(String) : [],
      inject: String(req.body?.inject ?? '').trim() || undefined,
      reference: String(req.body?.reference ?? '').trim() || undefined,
    };
    // Manual adds no wording of ours — including the name. You name it.
    if (form.mode === 'manual' && !form.name) return res.status(400).json({ error: 'Name the session.' });
    // What the session is for is checked AFTER the resolve, because whether it is
    // required depends on the session_job: it is the agent's first message, and an
    // `agent: none` kind has no agent to tell. See below.

    let resolved;
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
    // The prompt IS the agent's first message, so an agent job cannot start without one.
    // A plain terminal needs only a name — demanding a sentence nobody will ever read
    // would be a form asking a question it then throws away.
    if (resolved.agent && !form.prompt) return res.status(400).json({ error: 'Say what the session is for.' });

    // The session max is NOT checked here. It lives in createSession(), which both launch
    // handlers funnel through — a check in this handler alone is bypassed by posting a body
    // with no session_job, which falls through to launch_bare.
    if (!isValidName(resolved.name)) return res.status(400).json({ error: 'Could not derive a session name.' });
    if (await sessionExists(resolved.name)) return res.status(409).json({ error: `Session "${resolved.name}" already exists.` });

    try {
      await emitSessionWillBorn(resolved.name); // rireki resets a reused name's stale tape here
      await createSession(resolved.name, resolved.dir, { agent: resolved.agent });
      if (resolved.tags.length) await setTags(resolved.name, resolved.tags);
      // The project_root the session serves, written at birth — the one moment tagging
      // reliably happens. Two shipped tools (tejun-recall, tejun-remember) read this to
      // scope a memory and nothing used to set it.
      if (resolved.project_root) await setProjectRoot(resolved.name, resolved.project_root);
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
    count('born', { name: resolved.name, born: resolved.mode === 'manual' ? 'manual' : 'assisted', job: resolved.session_job });
    // THE LAUNCH SOCKET: services that care about a birth hear it here (fire-and-forget).
    emitSessionBorn({ name: resolved.name, job: resolved.session_job, root: resolved.project_root, cmd: resolved.cmd });

    res.json({
      ok: true,
      name: resolved.name,
      receipt: {
        session_job: resolved.session_job,
        mode: resolved.mode,
        project_root: resolved.project_root,
        dir: resolved.dir,
        cmd: resolved.cmd,
        dial: resolved.dial,
        lifecycle: resolved.lifecycle,
        tags: resolved.tags,
      },
    });
    void appendLedger(form, resolved, true);
    void (async () => {
      // Seed the letter before the brief is delivered, so the brief can name the exact
      // file and the session's first act can be to open it. A terminal is seeded as a
      // backfill rather than a birth: "born" opens the letter's ladder holding a go/no-go
      // gate, and there is no agent here to be held at one — the roster would show an
      // ACTIVE gate nobody is standing at.
      const birthLines = await collectBirthLines(resolved.name, !!resolved.agent);
      // `agent: none`: nothing is launched and nothing is said. Falling through would
      // press Enter in the pane (runCommand sends the literal string, then Enter), then
      // burn waitReady's full 20s timeout waiting for a CLI prompt that will never come,
      // and finally type the letter's brief into bash.
      if (!resolved.agent) return;
      await runCommand(resolved.name, resolved.cmd);
      await waitReady(resolved.name);
      await sendText(resolved.name, resolved.brief + birthLines);
    })().catch((e) => console.error(`[tmux-ronin] spawn ${resolved.name}:`, e));
  });

  app.get('/api/sessions', async (_req, res) => {
    try {
      res.json(await listSessions());
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // Home-panel feed: the session list enriched with a status-probe classification
  // (ready / thinking / awaiting-input, patterns in src/status.ts) and the context-
  // gauge reading — one capture-pane per session, shared by both scrapes.
  app.get('/api/home', async (_req, res) => {
    try {
      const list = await listSessions();
      const out = await Promise.all(
        list.map(async (s) => {
          let status: SessionStatus | null = null;
          let ctx: number | null = null;
          try {
            const text = await capturePane(s.name, 0);
            status = classifyStatus(text);
            ctx = scanContext(text);
          } catch {
            // session vanished mid-scan — plain row, no readings
          }
          // THE ROW SOCKET: services contribute their fields (michi's tegami ladder
          // column among them); none registered = nothing added and the board prints "—".
          return { ...s, status, ctx, ...(await collectRowFields(s.name)) };
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

  app.put('/api/owner', async (req, res) => {
    const raw = String(req.body?.name ?? '').trim();
    // A blank name is how you ask for the default back, not an error.
    try {
      // writeOwner republishes to the tmux option, so `bin/tejun-wipeboard` agrees with
      // this from the moment it is saved rather than from the next restart.
      res.json({ name: await writeOwner(raw) });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

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
