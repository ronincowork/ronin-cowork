import type express from 'express';
import { broadcastEvent } from './ws/events.js';
import { openMikaSourceAt } from './mika-knowledge.js';
import { mikaHomeDir } from './mika-runtime.js';

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

interface StoredView { at: number; view: MikaView }
const views = new Map<string, StoredView>();

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
    if (shown) workspaces[name] = shown;
  }
  return { workbench, team: text(raw.team, 64), selected, workspaces };
}

export function putMikaView(tab: string, value: unknown, now = Date.now()): MikaView | null {
  if (!TAB_RE.test(tab)) return null;
  const view = cleanMikaView(value);
  if (!view) return null;
  views.set(tab, { at: now, view });
  return view;
}

export function getMikaView(tab: string, now = Date.now()): MikaView | null {
  if (!TAB_RE.test(tab)) return null;
  const found = views.get(tab);
  if (!found) return null;
  if (now - found.at > MIKA_VIEW_TTL_MS) { views.delete(tab); return null; }
  return found.view;
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
    res.json({ ok: true });
  });
  app.get('/api/mika/context/:tab', (req, res) => {
    const report = whereIsMika(req.params.tab);
    if (!report) return res.status(404).json({ error: 'That Help view is absent or stale. Open Help in the tab you mean and try again.' });
    res.json({ ok: true, report });
  });
  app.post('/api/mika/context/:tab/show', (req, res) => {
    const view = getMikaView(req.params.tab);
    if (!view) return res.status(404).json({ error: 'That Help view is absent or stale. Open Help in the tab you mean and try again.' });
    const surface = text(req.body?.surface, 80);
    if (!/^[a-z0-9@._:-]+$/i.test(surface)) return res.status(400).json({ error: 'Name one Ronin surface.' });
    const target = WORKSPACES.find((name) => name !== view.selected && view.workspaces[name] !== undefined);
    if (!target) return res.status(409).json({ error: 'There is no other visible workspace; Mika will not replace the selected one.' });
    const listeners = broadcastEvent({ t: 'mika-show', tab: req.params.tab, workspace: target, surface });
    res.json({ ok: true, workspace: target, listeners });
  });
}

export function clearMikaViewsForTest(): void { views.clear(); }
