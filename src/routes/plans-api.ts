/** /api/plans — the `plan` tool's one door (ronin_bin/plan, src/plans.ts). Every command names its
 * caller (`by`, the session); the Workspace is `workspace`, else the caller's Team's; a new plan's
 * Team is `team`, else the caller's one Team in that Workspace (plans.ts teamFor). A write, order or team
 * answers one line, then the plan's header. The one 409 asks which Workspace, by name. */
import { layersMayHaveChanged } from '../team-layers.js';
import type express from 'express';
import { initialCampaignId } from '../campaign-scope.js';
import { listSessions } from '../tmux.js';
import {
  PlanBadInput, PlanMissing, PlanRefused, headerLine, listPlans, orderPlan, planTarget, planTemplate, readPlan, resolvePlanRef, setPlanTeam, teamFor, whichWorkspace, writePlan,
  type Caller, type PlanAnswer,
} from '../plans.js';

const text = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

/** The caller and its Campaign: a session's own, else the one stated, else the machine's first. */
async function callerOf(source: Record<string, unknown>, req: express.Request): Promise<Caller> {
  const by = text(source.by).trim().slice(0, 128) || (/^user_/.test(req.get('x-ronin-source') ?? '') ? 'owner' : 'unknown');
  const session = (await listSessions()).find((one) => one.name === by);
  const campaign = session?.campaign_id || text(source.campaign_id).trim() || await initialCampaignId();
  return { by, campaign };
}

function failed(res: express.Response, e: unknown): void {
  const error = String((e as Error)?.message ?? e);
  if (e instanceof PlanRefused) res.status(409).json({ ok: false, refused: true, error });
  else if (e instanceof PlanMissing) res.status(404).json({ ok: false, error });
  else if (e instanceof PlanBadInput) res.status(400).json({ ok: false, error: `BAD-ARG: ${error}` });
  else res.status(500).json({ ok: false, error });
}

const acted = (res: express.Response, done: PlanAnswer) => res.json({
  ok: true, plan: { ...done.plan, text: undefined },
  acknowledgement: [done.line, headerLine(done.plan), done.history].filter(Boolean).join('\n'),
});

type Handler = (req: express.Request, res: express.Response) => Promise<unknown>;
const route = (handler: Handler): express.RequestHandler => (req, res) => { handler(req, res).catch((e) => failed(res, e)); };

export function registerPlans(app: express.Express): void {
  app.get('/api/plans', route(async (req, res) => {
    const caller = await callerOf(req.query as Record<string, unknown>, req);
    const w = await whichWorkspace(caller, text(req.query.workspace));
    res.json({ ok: true, workspace: w.name, plans: await listPlans(w, text(req.query.status)) });
  }));

  app.get('/api/plans/template', route(async (_req, res) => { res.json({ ok: true, text: await planTemplate() }); }));

  /** Where `plan:<workspace>/<name>` is now, for the readers of an item's attachments; 404 is gone. */
  app.get('/api/plans/resolve', route(async (req, res) => {
    const campaign = text(req.query.campaign_id).trim() || await initialCampaignId();
    const at = await resolvePlanRef(campaign, text(req.query.ref));
    if (!at) throw new PlanMissing(`${text(req.query.ref)} is gone.`);
    res.json({ ok: true, path: at });
  }));

  app.get('/api/plans/read', route(async (req, res) => {
    const caller = await callerOf(req.query as Record<string, unknown>, req);
    const { workspace, name } = await planTarget(caller, text(req.query.name), text(req.query.workspace));
    const plan = await readPlan(workspace, name);
    res.json({ ok: true, plan: { ...plan, path: undefined } });
  }));

  app.post('/api/plans/write', route(async (req, res) => {
    const b = req.body ?? {};
    const caller = await callerOf(b, req);
    const { workspace, name } = await planTarget(caller, text(b.name), text(b.workspace));
    // A new plan takes the writer's Team; a rewrite keeps the plan's unless --team names one.
    const stated = text(b.team).trim();
    acted(res, await writePlan(workspace, name, text(b.text), caller.by, (had) => (stated || !had ? teamFor(caller, workspace, stated) : Promise.resolve(undefined))));
    layersMayHaveChanged();
  }));

  /** Park it (KAN-352; planning.md): the Draft plan written as `write` writes it, then the idea's
   * item in the Workspace's Icebox with the plan attached, held by the Workspace. One act. */
  app.post('/api/plans/park', route(async (req, res) => {
    const b = req.body ?? {};
    const caller = await callerOf(b, req);
    const { workspace, name } = await planTarget(caller, text(b.name), text(b.workspace));
    const stated = text(b.team).trim();
    const done = await writePlan(workspace, name, text(b.text), caller.by, (had) => (stated || !had ? teamFor(caller, workspace, stated) : Promise.resolve(undefined)));
    const { parkIdea } = await import('../work-items.js');
    const parked = await parkIdea(workspace.campaign_id, workspace.name, text(b.idea).trim() || done.plan.title, name, caller.by);
    res.json({
      ok: true, plan: { ...done.plan, text: undefined }, item: parked.item,
      acknowledgement: [done.line, headerLine(done.plan), done.history, `Parked: ${parked.item.id} '${parked.item.title}' in the Icebox ${parked.item.parent}, held by Workspace ${workspace.name}, ${name} attached.`].filter(Boolean).join('\n'),
    });
    layersMayHaveChanged();
  }));

  app.post('/api/plans/team', route(async (req, res) => {
    const b = req.body ?? {};
    const caller = await callerOf(b, req);
    const { workspace, name } = await planTarget(caller, text(b.name), text(b.workspace));
    const team = text(b.team).trim();
    if (!team) throw new PlanBadInput('plan team takes <name> <team>, or <name> none.');
    acted(res, await setPlanTeam(workspace, name, await teamFor(caller, workspace, team)));
    layersMayHaveChanged();
  }));

  app.post('/api/plans/order', route(async (req, res) => {
    const b = req.body ?? {};
    const caller = await callerOf(b, req);
    const { workspace, name } = await planTarget(caller, text(b.name), text(b.workspace));
    acted(res, await orderPlan(workspace, name, caller.by));
    layersMayHaveChanged();
  }));

}
