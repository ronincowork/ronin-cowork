/* /api/work-items* — the one door to the work item store (src/work-items.ts).
 * Every write acknowledges with the item as it now is and the trail line it appended; the
 * caller reads that before its next act. The only refusal is a reparent cycle (409). */
import type express from 'express';
import {
  WorkItemBadInput, WorkItemMissing, WorkItemRefused,
  addEvidence, assignItem, createItem, editDocs, editItem, listItems, readItem, releaseItem, reparentItem,
  type Acknowledged, type Holder, type TrailLine,
} from '../work-items.js';

const text = (value: unknown): string | undefined => typeof value === 'string' ? value : value === undefined || value === null ? undefined : String(value);

/** Who called: the tool names its session; the browser is the owner. */
export function callerOf(req: express.Request): string {
  const stated = text(req.body?.by)?.trim();
  if (stated) return stated.slice(0, 128);
  return /^user_/.test(req.get('x-ronin-source') ?? '') ? 'owner' : 'unknown';
}

export const describeLine = (line: TrailLine): string => [
  line.op,
  line.from !== undefined || line.to !== undefined ? `${line.from ?? '—'} → ${line.to ?? '—'}` : '',
  line.note ? `(${line.note})` : '',
  `by ${line.by}`,
].filter(Boolean).join(' ');

export const acknowledge = (res: express.Response, { item, line }: Acknowledged, extra: Record<string, unknown> = {}) =>
  res.json({ ok: true, item, line, ...extra, acknowledgement: `Work item ${item.id} "${item.title}": ${describeLine(line)}. Stage ${item.stage}, status ${item.status}, exit ${item.exit}.` });

export function answerError(res: express.Response, error: unknown): void {
  const message = String((error as Error)?.message ?? error);
  if (error instanceof WorkItemRefused) res.status(409).json({ ok: false, refused: true, error: message });
  else if (error instanceof WorkItemMissing) res.status(404).json({ ok: false, error: message });
  else if (error instanceof WorkItemBadInput) res.status(400).json({ ok: false, error: `BAD-ARG: ${message}` });
  else res.status(500).json({ ok: false, error: message });
}

/** A holder is named as { team } or { session }. */
export function holderFrom(body: Record<string, unknown> | undefined): Holder {
  const team = text(body?.team)?.trim();
  const session = text(body?.session)?.trim();
  if (Boolean(team) === Boolean(session)) throw new WorkItemBadInput('name the holder as team or session, one of them.');
  return team ? { kind: 'team', name: team } : { kind: 'agent', name: session! };
}

type Handler = (req: express.Request, res: express.Response) => Promise<unknown>;
const guarded = (handler: Handler): express.RequestHandler => (req, res) => {
  handler(req, res).catch((error) => answerError(res, error));
};

export function registerWorkItems(app: express.Express): void {
  app.get('/api/work-items', guarded(async (_req, res) => res.json({ ok: true, items: await listItems() })));

  app.post('/api/work-items', guarded(async (req, res) => {
    const b = req.body ?? {};
    acknowledge(res, await createItem({
      title: text(b.title) ?? '', objective: text(b.objective), stage: text(b.stage), exit: text(b.exit), status: text(b.status), parent: text(b.parent) || null,
    }, callerOf(req)));
  }));

  app.get('/api/work-items/:id', guarded(async (req, res) => {
    const item = await readItem(req.params.id);
    if (!item) throw new WorkItemMissing(`No work item ${req.params.id}.`);
    res.json({ ok: true, item });
  }));

  app.put('/api/work-items/:id', guarded(async (req, res) => {
    const b = req.body ?? {};
    acknowledge(res, await editItem(req.params.id, {
      title: text(b.title), objective: text(b.objective), stage: text(b.stage), status: text(b.status), exit: text(b.exit),
      ...(b.ladder !== undefined ? { ladder: typeof b.ladder === 'string' ? JSON.parse(b.ladder) : b.ladder } : {}),
    }, callerOf(req), text(b.note)));
  }));

  app.post('/api/work-items/:id/stage', guarded(async (req, res) => {
    acknowledge(res, await editItem(req.params.id, { stage: text(req.body?.stage) ?? '' }, callerOf(req), text(req.body?.note)));
  }));
  app.post('/api/work-items/:id/status', guarded(async (req, res) => {
    acknowledge(res, await editItem(req.params.id, { status: text(req.body?.status) ?? '', exit: text(req.body?.exit) }, callerOf(req), text(req.body?.note)));
  }));
  app.post('/api/work-items/:id/exit', guarded(async (req, res) => {
    acknowledge(res, await editItem(req.params.id, { exit: text(req.body?.exit) ?? '' }, callerOf(req), text(req.body?.note)));
  }));
  app.post('/api/work-items/:id/evidence', guarded(async (req, res) => {
    acknowledge(res, await addEvidence(req.params.id, text(req.body?.note) ?? '', callerOf(req)));
  }));
  app.post('/api/work-items/:id/docs', guarded(async (req, res) => {
    acknowledge(res, await editDocs(req.params.id, { add: text(req.body?.add), remove: text(req.body?.remove) }, callerOf(req)));
  }));
  app.post('/api/work-items/:id/assign', guarded(async (req, res) => {
    acknowledge(res, await assignItem(req.params.id, holderFrom(req.body), callerOf(req), text(req.body?.note)));
  }));
  app.post('/api/work-items/:id/release', guarded(async (req, res) => {
    acknowledge(res, await releaseItem(req.params.id, callerOf(req), text(req.body?.note)));
  }));
  app.post('/api/work-items/:id/reparent', guarded(async (req, res) => {
    acknowledge(res, await reparentItem(req.params.id, text(req.body?.parent) || null, callerOf(req)));
  }));
}
