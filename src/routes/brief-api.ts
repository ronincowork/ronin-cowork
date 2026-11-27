/**
 * THE BRIEF ROUTES (docs/architecture/brief.md, Layers and brief settings; The brief; Where it is set in the UI): the catalog for the pickers, each layer's
 * brief settings, the New Agent preview worked out by the server, the packet on the tile, and
 * the user's own facts, behaviours and tools.
 */
import type express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AGENT_BRIEF, BIRTH_BRIEF } from '../birth-brief.js';
import { briefOff, briefTold, layerOf, type Layer, type LayerName } from '../brief-settings.js';
import { BehaviourDocumentError, createBehaviourDocument, readBehaviourDocument, updateBehaviourDocument } from '../behaviour-documents.js';
import { initialCampaignId } from '../campaign-scope.js';
import { readCampaign, writeCampaign } from '../campaigns.js';
import { catalogIntegrations, readCatalogs } from '../catalog.js';
import { CONDITIONALS } from '../conditionals.js';
import { person } from '../office-people.js';
import { sessionDir, sessionKey } from '../session-dir.js';
import { resolveBriefFor, resolveFacts, type SpawnForm } from '../spawn.js';
import { availableRecords } from '../brief-build.js';
import { parentSettings } from '../waterfall.js';
import { readTeamRoster, writeTeamRoster } from '../team-rosters.js';
import { readWorkspace, saveWorkspace } from '../workspaces.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);
const SETTING_LAYERS = ['campaign', 'workspace', 'team'] as const;
type SettingLayer = typeof SETTING_LAYERS[number];

/** A level's own settings, and the MCP and web API records its picker lists beside the bridges:
 * every one in Settings. Nothing is inherited live (src/waterfall.ts). */
async function layerAt(layer: SettingLayer, id: string, campaignId: string): Promise<{ brief: Layer['brief']; integrations: string[]; pm: boolean | null; available: string[] }> {
  const available = (await availableRecords()).map((record) => record.name);
  const record = await levelRecord(layer, id, campaignId);
  const own = layer === 'campaign' ? (await parentSettings(campaignId)).settings : layerOf(layer, record);
  return { brief: own.brief, integrations: own.integrations, pm: own.pm ?? null, available };
}

async function levelRecord(layer: SettingLayer, id: string, campaignId: string): Promise<unknown> {
  if (layer === 'campaign') {
    const campaign = await readCampaign(campaignId);
    if (!campaign) throw new BehaviourDocumentError(`Unknown Campaign: ${campaignId || '(none)'}.`, 404);
    return campaign.config;
  }
  if (layer === 'workspace') {
    const workspace = await readWorkspace(campaignId, id);
    if (!workspace) throw new BehaviourDocumentError(`No Workspace "${id}".`, 404);
    return workspace;
  }
  const roster = await readTeamRoster(id, campaignId) ?? await readTeamRoster(id, '');
  if (!roster) throw new BehaviourDocumentError(`No Team "${id}".`, 404);
  return roster;
}

async function writeLayer(layer: SettingLayer, id: string, campaignId: string, body: Record<string, unknown>): Promise<void> {
  await levelRecord(layer, id, campaignId);
  const next = layerOf(layer as LayerName, body);
  const pm = body.pm === undefined ? undefined : typeof body.pm === 'boolean' ? body.pm : null;
  if (layer === 'campaign') {
    await writeCampaign(campaignId, { config: {
      ...(body.brief !== undefined ? { brief: next.brief } : {}),
      ...(body.integrations !== undefined ? { integrations: next.integrations.filter((name) => name !== 'jira') } : {}),
      ...(pm !== undefined ? { pm } : {}),
    } });
  } else if (layer === 'workspace') {
    const workspace = (await readWorkspace(campaignId, id))!;
    const kept = new Map(workspace.integrations.map((row) => [row.provider, row]));
    const { pm: _pm, ...rest } = workspace;
    await saveWorkspace({
      ...rest,
      ...(body.brief !== undefined ? { brief: next.brief } : {}),
      ...(body.integrations !== undefined ? { integrations: next.integrations.map((name) => kept.get(name) ?? { provider: name }) } : {}),
      ...((pm === undefined ? workspace.pm : pm) != null ? { pm: (pm === undefined ? workspace.pm : pm) as boolean } : {}),
    });
  } else {
    const roster = (await readTeamRoster(id, campaignId) ?? await readTeamRoster(id, ''))!;
    await writeTeamRoster(id, {
      ...(body.brief !== undefined ? { brief: next.brief } : {}),
      ...(body.integrations !== undefined ? { integrations: next.integrations } : {}),
      ...(pm !== undefined ? { pm } : {}),
    }, roster.campaign_id);
  }
}

/** A draft Agent as the New Agent form has it; the server fills in what it knows itself. */
function draftForm(body: Record<string, unknown>): SpawnForm {
  const type = String(body.type ?? body.session_type ?? 'cowork_agent');
  const role = ['coworker', 'lead', 'epic_lead', 'coordinator', 'appliance'].includes(String(body.role)) ? String(body.role) as SpawnForm['role'] : 'coworker';
  return {
    session_type: type === 'bare_metal_agent' ? 'bare_metal_agent' : 'cowork_agent',
    name: String(body.name ?? '').trim() || 'new_agent',
    campaign_id: String(body.campaign_id ?? body.campaign ?? '').trim() || undefined,
    team: String(body.team ?? '').trim() || undefined,
    workspace: String(body.workspace ?? '').trim() || undefined,
    team_lead: role === 'lead',
    role,
    prompt: String(body.instructions ?? body.prompt ?? ''),
    ...(typeof body.desk === 'boolean' ? { desk: body.desk } : {}),
    ...(typeof body.checkout === 'boolean' ? { checkout: body.checkout } : {}),
    ...layerOf('agent', body),
  };
}

export function registerBrief(app: express.Express): void {
  // (a) The catalog, for the pickers.
  app.get('/api/brief/catalog', async (_req, res) => {
    try {
      const catalog = await readCatalogs();
      res.json([...catalog.facts, ...catalog.behaviours, ...catalog.tools].map((row) => ({
        kind: row.kind.replace(/s$/, ''), name: row.name, title: row.title, seed: row.seed, line: row.line,
        depth: row.depth, when: row.when, serves: row.serves, mandate: row.mandate, value: row.value, with: row.with, integration: row.integration, facts: row.facts,
        order: row.order === Number.MAX_SAFE_INTEGER ? null : row.order, path: row.file, origin: row.origin,
      })));
    } catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });

  // The integrations a layer can turn on: the bridge files (docs/architecture/brief.md, What comes next).
  app.get('/api/brief/integrations', async (_req, res) => {
    try { res.json(catalogIntegrations(await readCatalogs())); }
    catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });

  // The conditional words, for the `when:` picker: those of docs/architecture/brief.md, Conditionals,
  // with integration:<name> for each bridge.
  app.get('/api/brief/conditionals', async (_req, res) => {
    try {
      const names = catalogIntegrations(await readCatalogs()).map((row) => row.name);
      res.json([...CONDITIONALS.filter((word) => word !== 'integration:<name>'), ...names.map((name) => `integration:${name}`)]);
    } catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });

  // (b) One layer's brief settings, and what it inherits.
  app.get('/api/brief/settings/:layer/:id', async (req, res) => {
    const layer = req.params.layer as SettingLayer;
    if (!SETTING_LAYERS.includes(layer)) return res.status(400).json({ error: 'layer is campaign, workspace or team.' });
    try {
      const campaignId = layer === 'campaign' ? req.params.id : String(req.query.campaign_id ?? '').trim() || await initialCampaignId();
      res.json(await layerAt(layer, req.params.id, campaignId));
    } catch (e) { res.status(e instanceof BehaviourDocumentError ? e.status : 500).json({ error: errMsg(e) }); }
  });

  app.put('/api/brief/settings/:layer/:id', async (req, res) => {
    const layer = req.params.layer as SettingLayer;
    if (!SETTING_LAYERS.includes(layer)) return res.status(400).json({ error: 'layer is campaign, workspace or team.' });
    try {
      const campaignId = layer === 'campaign' ? req.params.id : String(req.query.campaign_id ?? req.body?.campaign_id ?? '').trim() || await initialCampaignId();
      await writeLayer(layer, req.params.id, campaignId, (req.body ?? {}) as Record<string, unknown>);
      // A default changed: new Agents are born with it; a live Agent's record doesn't move.
      res.json(await layerAt(layer, req.params.id, campaignId));
    } catch (e) { res.status(e instanceof BehaviourDocumentError ? e.status : 500).json({ error: errMsg(e) }); }
  });

  // (c) What a draft Agent would be told, each with why, and where its integrations come from.
  app.post('/api/brief/preview', async (req, res) => {
    try {
      const form = draftForm((req.body ?? {}) as Record<string, unknown>);
      const who = person(req);
      if (who) form.person = who;
      const facts = await resolveFacts(form, new Set());
      const composed = await resolveBriefFor(form, facts);
      const available = (composed?.doc.setting.available ?? []).map((record) => record.name);
      if (!composed) return res.json({ in_play: [], integrations: {}, integrations_off: {}, pm: { on: false }, off: [], available });
      res.json({
        in_play: briefTold(composed.resolved), integrations: composed.cascade.integrations, integrations_off: composed.cascade.off, pm: composed.cascade.pm, available,
        off: briefOff(await readCatalogs(), composed.layers),
      });
    } catch (e) { res.status(400).json({ error: errMsg(e) }); }
  });

  // (d) The brief now, for the bottom of the work record on the tile: AGENT_BRIEF.md once an update wrote it, else the birth brief.
  app.get('/api/sessions/:name/brief', async (req, res) => {
    try {
      const dir = sessionDir(await sessionKey(req.params.name));
      const text = await readFile(path.join(dir, AGENT_BRIEF), 'utf8').catch(() => readFile(path.join(dir, BIRTH_BRIEF), 'utf8'));
      res.type('text/markdown').send(text);
    } catch { res.status(404).json({ error: 'No brief for that session.' }); }
  });

  // The user's own facts, behaviours and tools: read, write their own, replace a stock one by name.
  app.get('/api/brief/files/:kind/:name', async (req, res) => {
    try { res.json(await readBehaviourDocument(req.params.kind, req.params.name)); }
    catch (e) { res.status(e instanceof BehaviourDocumentError ? e.status : 500).json({ error: errMsg(e) }); }
  });
  app.post('/api/brief/files', async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const made = await createBehaviourDocument({ name: body.name, text: body.text, shadow: body.shadow, scope: body.kind ?? body.scope });
      res.status(201).json(made);
    } catch (e) { res.status(e instanceof BehaviourDocumentError ? e.status : 500).json({ error: errMsg(e) }); }
  });
  app.put('/api/brief/files/:kind/:name', async (req, res) => {
    try {
      const saved = await updateBehaviourDocument({ ...req.body, scope: req.params.kind, name: req.params.name });
      res.json(saved);
    }
    catch (e) { res.status(e instanceof BehaviourDocumentError ? e.status : 500).json({ error: errMsg(e) }); }
  });
}
