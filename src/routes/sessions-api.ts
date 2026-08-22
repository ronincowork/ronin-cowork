/**
 * PER-SESSION ROUTES — everything addressed to one live session by name: end it, tag
 * it, dial it, read its gauge, its ladder, its tape state, and type into it. The
 * session list itself and the launchers live in routes/launch.ts; boards in
 * routes/wipeboards-api.ts.
 */
import fs from 'node:fs';
import type express from 'express';
import {
  type Control,
  getControl,
  getNote,
  getProjectRoot,
  getTags,
  isValidName,
  killSessionTree,
  listSessions,
  sessionExists,
  sessionOfPane,
  setControl,
  setNote,
  setProjectRoot,
  setTags,
} from '../tmux.js';
import { sendText } from '../send.js';
import { sessionKey } from '../session-dir.js';
import { isValidRootName, listProjectRoots } from '../project-roots.js';
import { expandLookup } from '../lookup.js';
import { readCtxLine } from '../ctx.js';
import { count } from '../counts.js';
import { announceTeamChanges } from './wipeboards-api.js';
import { readJobRole, readSessionTask, writeSessionTask } from '../tegami.js';
import { observeTaskChange, taskDeliveryFault } from '../task-watch.js';
import { emitSessionEnd } from '../sockets.js';

export function registerSessions(app: express.Express): void {
  app.delete('/api/sessions/:name', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    // Resolve the key BEFORE the kill, while `name` still means this session — the same
    // ordering rule killSessionTree already follows for removeHandoff. Afterwards the name
    // is a corpse, and asking tmux about a corpse gets you a NEIGHBOUR's answer (exit 0),
    // so the rm below would have taken a live session's directory: tape, render and letter.
    const key = await sessionKey(name);
    await killSessionTree(name);
    emitSessionEnd(name, key); // rireki deletes the tape: no graveyard, eventually is fine
    count('ended', { name, end: 'deleted' });
    res.json({ ok: true });
  });

  /**
   * harakiri — a session ends ITSELF, and Ronin is what ends it.
   *
   * The caller hands over one thing: the pane it is sitting in. It does not name a
   * session, does not sweep viewers, does not run `kill-session`. Ronin resolves the pane
   * to its real (non-viewer) session, checks the dial, and calls the same killSessionTree
   * the UI's delete button uses. So there is ONE implementation of the kill in this
   * codebase, and an agent asking to die is blind to how dying works — the counterpart of
   * commons spawning, which is likewise mechanical Ronin code rather than an agent running
   * tmux steps.
   *
   * Self-inflicted by construction: the only session you can end is the one your own pane
   * belongs to. Ending someone ELSE's session is a different, deliberate act — DELETE
   * /api/sessions/:name, i.e. the trash button — and is not reachable from here.
   */
  app.post('/api/harakiri', async (req, res) => {
    const pane = String(req.body?.pane ?? '').trim();
    if (!/^%\d+$/.test(pane)) {
      return res.status(400).json({ error: 'Expected a tmux pane id like %7.' });
    }
    const name = await sessionOfPane(pane);
    if (!name) return res.status(404).json({ error: `No session owns pane ${pane}.` });
    if ((await getControl(name)) === 'user') {
      return res.status(403).json({ error: `"${name}" is owner-controlled (dial 👤). Ask the owner to end it.` });
    }
    // Answer BEFORE killing: once the session goes, so does the socket, the caller and
    // anything it might have printed. The reply is for the log and for a caller that
    // somehow outlives its session — never a precondition for the kill.
    res.json({ ok: true, session: name });
    console.log(`[ronin] harakiri: ${name} (pane ${pane})`);
    count('ended', { name, end: 'harakiri' });
    setTimeout(() => void killSessionTree(name), 50);
  });

  /**
   * The project_root a session serves — one value, the owner's hand.
   *
   * Sessions born outside the launcher (a human running `tmux new-session`) carry
   * nothing, and that is reported as untagged rather than guessed at. Ronin may SUGGEST
   * one from the working directory; only this call applies it.
   */
  app.get('/api/sessions/:name/project-root', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    res.json({ project_root: await getProjectRoot(name) });
  });

  app.post('/api/sessions/:name/project-root', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    const root = String(req.body?.project_root ?? '').trim();
    if (root && !isValidRootName(root)) return res.status(400).json({ error: 'Invalid project_root handle.' });
    if (root && !(await listProjectRoots()).some((r) => r.name === root)) {
      return res.status(404).json({ error: `"${root}" is not in the catalog.` });
    }
    try {
      res.json({ ok: true, project_root: await setProjectRoot(name, root) });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // Per-session "post-it" note, stored on the tmux session itself (see tmux.ts).
  app.get('/api/sessions/:name/note', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    res.json({ note: await getNote(name) });
  });

  app.post('/api/sessions/:name/note', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    const note = String(req.body?.note ?? '').slice(0, 8000); // a post-it, not a doc
    try {
      await setNote(name, note);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // Team tags (@ronin-tags): a session's teams, stored on the session itself.
  // The point of these is ADDRESSING, not decoration — "the kojinsa team" resolves to a
  // session list, so a coordinator can be pointed at a set instead of named members one
  // by one. Agents get the same answer from `ronin_bin/tejun-team` without going through HTTP.
  app.get('/api/sessions/:name/tags', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    res.json({ tags: await getTags(name) });
  });

  app.post('/api/sessions/:name/tags', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    const body = req.body?.tags;
    const list = Array.isArray(body) ? body.map(String) : String(body ?? '').split(',');
    try {
      count('tag.set');
      // The tag write IS the membership event for a team wipeboard, so the join/leave
      // notices fire here — for teams whose wipeboard file exists (docs/wipeboards.md).
      const before = await getTags(name);
      const tags = await setTags(name, list.slice(0, 16));
      const notices = await announceTeamChanges(name, before, tags);
      res.json({ ok: true, tags, notices });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  /**
   * THE TWO AXES OUT OF A SESSION'S LETTER — and only one of them has a door in.
   *
   * `session_task` is what this session is DOING. The session keeps it current itself
   * (`write_tegami`) and usually should. The POST is the OWNER's hand on the same field,
   * from the tile: you can see the agent is not doing what its mark says, so you say so.
   *
   * IT IS NOT MERELY A RE-LABEL ANY MORE. A committed task change means the session
   * should be reading that task's shelf, so this route writes the letter and then hands
   * off to the SAME observer the agent's own `write_tegami` goes through
   * (`src/task-watch.ts`). One injection implementation, reached two ways — a second one
   * in this route is exactly how the owner's change and the agent's change would drift
   * into behaving differently.
   *
   * What it still does NOT do is re-launch anything: the dial and permissions the launch
   * fixed are untouched, and a session that is re-marked must not thereby acquire a
   * different dial.
   *
   * `job_role` is READ-ONLY here, and there is no POST for it at all. It is birth-fixed;
   * the seed is its only writer. A route to change it would be the one door that made the
   * immutability rule a suggestion.
   *
   * Not validated against the definitions on purpose: `session_tasks/` is the owner's to
   * extend or shadow, and a name with no icon still draws as its own text. '' clears the
   * mark back to "has not said", which is a real state and must stay reachable — and it
   * injects no reading, because a blank task has none.
   *
   * 409, not 500, when the letter cannot be written: it means the file is malformed or
   * the edit would not re-parse, and the caller wants to know its change did not land
   * rather than that the server broke.
   */
  app.get('/api/sessions/:name/session_task', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    // `delivery` is the split-state readout: present only when this session's task
    // changed and its reading did NOT land (a closed dial, a prompt that would not take
    // input). A changed mark with undelivered reading must never pass silently, so the
    // surface that shows the mark can show why it is only half true.
    res.json({
      session_task: await readSessionTask(name),
      job_role: await readJobRole(name),
      delivery: await taskDeliveryFault(name),
    });
  });

  app.post('/api/sessions/:name/session_task', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    if (req.body?.job_role !== undefined) {
      return res.status(400).json({
        error: 'A job_role is fixed at birth and cannot be changed in a live session.',
      });
    }
    const task = String(req.body?.session_task ?? '').trim().slice(0, 64);
    try {
      const saved = await writeSessionTask(name, task);
      if (saved === null) {
        return res.status(409).json({ error: "This session's letter could not be written — it has no readable json block." });
      }
      count('session_task.set', { task: saved || null });
      // The owner authored it; the observer delivers it. Fire-and-forget so the tile's
      // mark updates at once — a failed delivery is recorded and retried by the watcher
      // rather than held against this request.
      void observeTaskChange(name);
      res.json({ ok: true, session_task: saved });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  /**
   * Every group in play, with its members. Derived from the sessions each call — there
   * is no group registry to drift out of date.
   *
   * It used to answer with a `leaders` map too, off `@ronin-lead` — who coordinates each
   * group, hand-set by the owner. That option is retired: coordinating is a `job_role`
   * (`QuarterBack`), and the session says so in its own letter.
   */
  app.get('/api/groups', async (_req, res) => {
    try {
      const groups: Record<string, string[]> = {};
      for (const s of await listSessions()) {
        for (const t of s.tags) (groups[t] ||= []).push(s.name);
      }
      res.json({ groups });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // Control dial (@ronin-control): user / read / write — who may drive this session.
  // Reading is open (that's control-check); FLIPPING is owner-only, enforced in ONE
  // place: the host-side ronin-session-guard hook denies agents any dial flip (tmux or
  // HTTP) before the command runs. The endpoint itself stays open — it is the owner's
  // path (the browser dial), and a server-side owner check only ever managed to lock
  // out the owner (Glen KISS mandate, 2026-08-06: one enforcement point, one open
  // owner path — don't re-add cleverness here).
  // The RIREKI dial + tape-head routes and the TEGAMI read routes are mounted by
  // their services through the ROUTES socket (rireki-api.ts, michi-api.ts).
  app.get('/api/sessions/:name/control', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    res.json({ control: await getControl(name) });
  });

  app.post('/api/sessions/:name/control', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    const control = String(req.body?.control ?? '');
    if (control !== 'user' && control !== 'read' && control !== 'write') {
      return res.status(400).json({ error: 'control must be user, read or write.' });
    }
    try {
      await setControl(name, control as Control);
      count('dial.set', { dial: control });
      res.json({ ok: true, control });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // Context gauge readout: how full the session's context window is, scraped from the
  // pane's visible tail (the CLI publishes the number into its own status line — Claude
  // via ~/.claude/statusline-ronin.sh, Codex natively). Terminal view only, per the
  // permanent boundary: pane text, never agent internals. Patterns live in src/ctx.ts.
  app.get('/api/sessions/:name/ctx', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    try {
      const reading = await readCtxLine(name); // { ctx, model } — one capture, both readings
      // TOMODACHI's context gauge rides this read; at close the pane is gone, so the last
      // value seen while alive is the only one there will ever be. No sampler, no interval.
      count('ctx', { name, ctx: (reading as { ctx: number | null }).ctx, model: (reading as { model?: string | null }).model ?? null });
      res.json(reading);
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  // Compose target selector: type into ANY session, not just the connected tile.
  // Reliability per co-working/user_repo/wip/RECIPES.md R1/R2: separate Enter, lost-Enter retry,
  // confirm-started — all inside sendText().
  app.post('/api/sessions/:name/send', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    // Speed bump, not a wall (same-Unix-user agents can always reach tmux directly):
    // the dial's job is to make access rules VISIBLE at the moment of posting. Refusals
    // spell out what the poster IS allowed to do; a successful send echoes the dial so
    // even permitted writers see what mode they posted under.
    const control = await getControl(name);
    if (control !== 'write') {
      const warn =
        control === 'user'
          ? `"${name}" is 👤 owner-only — outside agents may not read or type here. Do not flip the dial yourself; report back and ask the owner.`
          : `"${name}" is 👁 watch-only for outside agents — you may observe (capture-pane) but not type. Do not flip the dial yourself; report back and ask the owner to flip it to 🤖.`;
      return res.status(403).json({ error: warn, control });
    }
    const raw = String(req.body?.text ?? '');
    if (!raw.trim()) return res.status(400).json({ error: 'Nothing to send.' });
    try {
      // A lookup macro is answered here and delivered as its own answer; everything
      // else goes through verbatim, exactly as before.
      const expanded = await expandLookup(raw);
      const text = expanded ?? raw;
      const sent = await sendText(name, text);
      res.json({ ok: true, control, expanded: expanded != null, ...sent });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
