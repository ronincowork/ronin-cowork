import type express from 'express';
import { broadcastEvent } from './ws/events.js';
import { openMikaSourceAt } from './mika-knowledge.js';
import { mikaHomeDir } from './mika-runtime.js';
import { randomBytes } from 'node:crypto';
import { isOperatorPeer } from './operator-socket.js';
import { listSessions } from './tmux.js';
import { verifyMikaIdentity } from './mika-identity.js';

export const MIKA_VIEW_TTL_MS = 30_000;
const TAB_RE = /^[A-Za-z0-9_-]{8,64}$/;
const WORKBENCHES = new Set(['campaign', 'cowork', 'team', 'setup', 'phone']);
const WORKSPACES = ['workspace1', 'workspace2', 'workspace3', 'workspace4'] as const;

export interface MikaView {
  workbench: string;
  team: string;
  selected: string;
  workspaces: Record<string, string>;
}

interface StoredView { at: number; view: MikaView; capability: string }
const views = new Map<string, StoredView>();
const capabilities = new Map<string, string>();
const SAFE_SURFACES = new Set(['setup.providers', 'setup.services', 'setup.gbrain', 'setup.templates', 'team-configuration', 'wipeboard', 'docs', 'cron-jobs']);

const text = (value: unknown, max = 100): string =>
  typeof value === 'string' ? value.replace(/[\r\n\t]/g, ' ').trim().slice(0, max) : '';

export function cleanMikaView(value: unknown): MikaView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const workbench = text(raw.workbench, 20);
  if (!WORKBENCHES.has(workbench)) return null;
  const selected = text(raw.selected, 20);
  if (selected && !WORKSPACES.includes(selected as typeof WORKSPACES[number])) return null;
  const source = raw.workspaces && typeof raw.workspaces === 'object' && !Array.isArray(raw.workspaces)
    ? raw.workspaces as Record<string, unknown> : {};
  const workspaces: Record<string, string> = {};
  for (const name of WORKSPACES) {
    const shown = text(source[name], 120);
    if (Object.hasOwn(source, name)) workspaces[name] = shown;
  }
  return { workbench, team: text(raw.team, 64), selected, workspaces };
}

export function putMikaView(tab: string, value: unknown, now = Date.now()): (MikaView & { view_id: string }) | null {
  if (!TAB_RE.test(tab)) return null;
  const view = cleanMikaView(value);
  if (!view) return null;
  const previous = views.get(tab);
  if (previous) capabilities.delete(previous.capability);
  const capability = randomBytes(16).toString('hex');
  views.set(tab, { at: now, view, capability });
  capabilities.set(capability, tab);
  return { ...view, view_id: capability };
}

export function getMikaView(tab: string, now = Date.now()): MikaView | null {
  if (!TAB_RE.test(tab)) return null;
  const found = views.get(tab);
  if (!found) return null;
  if (now - found.at > MIKA_VIEW_TTL_MS) { views.delete(tab); capabilities.delete(found.capability); return null; }
  return found.view;
}

function viewForCapability(viewId: string, now = Date.now()): { tab: string; view: MikaView } | null {
  if (!/^[a-f0-9]{32}$/.test(viewId)) return null;
  const tab = capabilities.get(viewId);
  if (!tab) return null;
  const view = getMikaView(tab, now);
  if (!view) return null;
  return { tab, view };
}

export function whereIsMika(tab: string, now = Date.now()): string | null {
  const view = getMikaView(tab, now);
  if (!view) return null;
  const place = view.workbench === 'team' && view.team
    ? `Team workbench “${view.team}”` : `${view.workbench[0].toUpperCase()}${view.workbench.slice(1)} workbench`;
  const lines = [`You are helping from the ${place}.`];
  for (const name of WORKSPACES) if (view.workspaces[name]) lines.push(`${name.replace('workspace', 'Workspace ')} shows ${view.workspaces[name]}.`);
  if (view.selected) lines.push(`The selected workspace is ${view.selected.replace('workspace', '')}.`);
  return lines.join('\n');
}

export function registerMikaContext(app: express.Express): void {
  app.post('/api/mika/source', async (req, res) => {
    if (!isOperatorPeer(req)) return res.status(403).json({ error: 'Mika source requires the operator socket.' });
    const ref = typeof req.body?.ref === 'string' ? req.body.ref : '';
    try {
      // The broker accepts the opaque public reference only. The knowledge module
      // resolves the live generation and verifies index, manifest and snapshot hashes.
      res.json({ ok: true, source: await openMikaSourceAt(mikaHomeDir(), ref) });
    } catch (error) {
      res.status(404).json({ error: String((error as Error)?.message ?? error) });
    }
  });
  app.put('/api/mika/context/:tab', (req, res) => {
    const view = putMikaView(req.params.tab, req.body?.view);
    if (!view) return res.status(400).json({ error: 'Invalid Mika view snapshot.' });
    res.json({ ok: true, view_id: view.view_id });
  });
  app.get('/api/mika/context/:tab', (req, res) => {
    if (!isOperatorPeer(req)) return res.status(403).json({ error: 'Mika context reads require the operator socket.' });
    const report = whereIsMika(req.params.tab);
    if (!report) return res.status(404).json({ error: 'That Help view is absent or stale. Open Help in the tab you mean and try again.' });
    res.json({ ok: true, report });
  });
  app.post('/api/mika/context/:tab/show', (req, res) => {
    if (!isOperatorPeer(req)) return res.status(403).json({ error: 'Mika show requires the operator socket.' });
    const view = getMikaView(req.params.tab);
    if (!view) return res.status(404).json({ error: 'That Help view is absent or stale. Open Help in the tab you mean and try again.' });
    const surface = text(req.body?.surface, 80);
    if (!/^[a-z0-9@._:-]+$/i.test(surface)) return res.status(400).json({ error: 'Name one Ronin surface.' });
    const target = WORKSPACES.find((name) => name !== view.selected && view.workspaces[name] !== undefined);
    if (!target) return res.status(409).json({ error: 'There is no other visible workspace; Mika will not replace the selected one.' });
    const listeners = broadcastEvent({ t: 'mika-show', tab: req.params.tab, workspace: target, surface });
    res.json({ ok: true, workspace: target, listeners });
  });
  const operatorOnly = async (req: express.Request, res: express.Response): Promise<boolean> => {
    if (!isOperatorPeer(req)) { res.status(403).json({ error: 'Mika broker requires the operator socket.' }); return false; }
    const identity = await verifyMikaIdentity(await listSessions());
    if (identity.state !== 'verified') { res.status(409).json({ error: 'Verified Mika is not running.', code: 'mika_identity_invalid' }); return false; }
    return true;
  };
  app.post('/api/mika/broker/lookup', async (req, res) => {
    if (!(await operatorOnly(req, res))) return;
    if (!req.body || Object.keys(req.body).sort().join(',') !== 'ref' || typeof req.body.ref !== 'string') return res.status(400).json({ error: 'Invalid lookup arguments.' });
    try { res.json({ ok: true, evidence: await openMikaSourceAt(mikaHomeDir(), req.body.ref) }); }
    catch (error) { res.status(404).json({ error: String((error as Error)?.message ?? error) }); }
  });
  app.post('/api/mika/broker/wheres-waldo', async (req, res) => {
    if (!(await operatorOnly(req, res))) return;
    if (!req.body || Object.keys(req.body).sort().join(',') !== 'view_id') return res.status(400).json({ error: 'Invalid wheres_waldo arguments.' });
    const found = viewForCapability(String(req.body.view_id ?? ''));
    if (!found) return res.status(404).json({ error: 'That Help view capability is absent or stale.' });
    res.json({ ok: true, report: whereIsMika(found.tab) });
  });
  app.post('/api/mika/broker/show', async (req, res) => {
    if (!(await operatorOnly(req, res))) return;
    if (!req.body || Object.keys(req.body).sort().join(',') !== 'surface,view_id') return res.status(400).json({ error: 'Invalid show arguments.' });
    const found = viewForCapability(String(req.body.view_id ?? ''));
    if (!found) return res.status(404).json({ error: 'That Help view capability is absent or stale.' });
    const surface = text(req.body.surface, 80);
    if (!SAFE_SURFACES.has(surface)) return res.status(400).json({ error: 'That surface is not in Mika’s safe catalog.' });
    const current = viewForCapability(String(req.body.view_id));
    const target = current && WORKSPACES.find((name) => name !== current.view.selected && current.view.workspaces[name] === '');
    if (!target) return res.status(409).json({ error: 'There is no empty visible workspace; Mika will not replace one.' });
    const listeners = broadcastEvent({ t: 'mika-show', tab: found.tab, workspace: target, surface });
    res.json({ ok: true, workspace: target, listeners });
  });
}

export function clearMikaViewsForTest(): void { views.clear(); capabilities.clear(); }
