/* /api/work-items* — the one door to the work item store (src/work-items.ts).
 * Every write acknowledges with the item as it now is and the trail line it appended; the
 * caller reads that before its next act. The only refusal is a reparent cycle (409). */
import type express from 'express';
import {
  WorkItemBadInput, WorkItemMissing, WorkItemRefused,
  assignItem, createItem, editItem, focusItem, holderLabel, holdersOf, readItem, releaseItem, reparentItem, restoreItem, returnItem, placeFocus, writeFocusDocs, writeFocusLadder,
  keepCurrentLine, type Acknowledged, type Holder, type TrailLine,
} from '../work-items.js';
import { agentReading, everyItemReading, teamReading, unassignedReading } from '../work-items-read.js';
import { collectionReading } from '../collection-read.js';

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

export const acknowledge = (res: express.Response, done: Acknowledged, extra: Record<string, unknown> = {}) =>
  res.json({
    ok: true, item: done.item, line: done.line, shape: done.shape, ...(done.notified?.length ? { notified: done.notified } : {}), ...extra,
    acknowledgement: `Work item ${done.item.id} "${done.item.title}": ${describeLine(done.line)}. Stage ${done.item.stage}, status ${done.item.status}, exit ${done.item.exit}.`
      + `${done.notified?.length ? ` Told ${done.notified.map((name) => `@${name}`).join(', ')} of the arrival.` : ''}\n${keepCurrentLine(done)}`,
  });

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

const parsed = (value: string): unknown => {
  try { return JSON.parse(value); } catch (error) { throw new WorkItemBadInput(`--ladder is not valid JSON — ${(error as Error).message}`); }
};

type Handler = (req: express.Request, res: express.Response) => Promise<unknown>;
const guarded = (handler: Handler): express.RequestHandler => (req, res) => {
  handler(req, res).catch((error) => answerError(res, error));
};

export function registerWorkItems(app: express.Express): void {
  app.get('/api/work-items', guarded(async (req, res) => {
    // The readings: ?session= (agent), ?team= (team), ?unassigned=1; otherwise every item
    // with its holder.
    const team = text(req.query.team)?.trim();
    const session = text(req.query.session)?.trim();
    if (session) return res.json({ ok: true, ...(await agentReading(session)) });
    if (team) return res.json({ ok: true, ...(await teamReading(team)) });
    if (req.query.unassigned !== undefined) return res.json({ ok: true, items: await unassignedReading() });
    res.json({ ok: true, items: await everyItemReading() });
  }));

  // The collection reading: Teams, boards and workspace folders joined, narrowed by any of
  // ?team= ?root= ?board= ?agent= ?stage= together (src/collection-read.ts).
  app.get('/api/collection', guarded(async (req, res) => {
    const filter = (key: string) => text(req.query[key])?.trim() || undefined;
    res.json({ ok: true, ...(await collectionReading({ team: filter('team'), root: filter('root'), board: filter('board'), agent: filter('agent'), stage: filter('stage') })) });
  }));

  app.post('/api/work-items', guarded(async (req, res) => {
    const b = req.body ?? {};
    acknowledge(res, await createItem({
      title: text(b.title) ?? '', objective: text(b.objective), stage: text(b.stage), exit: text(b.exit), status: text(b.status), parent: text(b.parent) || null, root: b.root === true,
      ...(b.team || b.session ? { holder: holderFrom(b) } : {}),
    }, callerOf(req)));
  }));

  // The Agent's focus item: its ladder, its docs, and a placed position. With nothing held,
  // a ladder or doc write creates the item (held by the Agent, titled from its objective).
  const sessionOf = (req: express.Request): string => {
    const session = text(req.body?.session)?.trim();
    if (!session) throw new WorkItemBadInput('name the session whose focus item this is.');
    return session;
  };
  app.post('/api/work-items/focus/ladder', guarded(async (req, res) => {
    const b = req.body ?? {};
    const done = await writeFocusLadder(sessionOf(req), { edits: Array.isArray(b.edits) ? b.edits.map((edit: unknown[]) => edit.map(String)) : undefined, ladder: b.ladder }, callerOf(req));
    acknowledge(res, done, { said: done.said });
  }));
  app.post('/api/work-items/focus/docs', guarded(async (req, res) => {
    acknowledge(res, await writeFocusDocs(sessionOf(req), { add: text(req.body?.add), remove: text(req.body?.remove) }, callerOf(req)));
  }));
  app.post('/api/work-items/focus/at', guarded(async (req, res) => {
    acknowledge(res, await placeFocus(sessionOf(req), text(req.body?.at)?.trim() ?? '', callerOf(req)));
  }));

  app.get('/api/work-items/:id', guarded(async (req, res) => {
    const item = await readItem(req.params.id);
    if (!item) throw new WorkItemMissing(`No work item ${req.params.id}.`);
    res.json({ ok: true, item, held_by: (await holdersOf(item.id)).map(holderLabel) });
  }));

  app.put('/api/work-items/:id', guarded(async (req, res) => {
    const b = req.body ?? {};
    acknowledge(res, await editItem(req.params.id, {
      title: text(b.title), objective: text(b.objective), stage: text(b.stage), status: text(b.status), exit: text(b.exit), evidence: text(b.evidence),
      ...(b.ladder !== undefined ? { ladder: typeof b.ladder === 'string' ? parsed(b.ladder) : b.ladder } : {}),
    }, callerOf(req), text(b.note)));
  }));

  app.post('/api/work-items/:id/stage', guarded(async (req, res) => {
    acknowledge(res, await editItem(req.params.id, { stage: text(req.body?.stage) ?? '' }, callerOf(req), text(req.body?.note)));
  }));
  // `focus` names the Agent whose focus moves to this item when it holds it ("working").
  app.post('/api/work-items/:id/status', guarded(async (req, res) => {
    const done = await editItem(req.params.id, { status: text(req.body?.status) ?? '', exit: text(req.body?.exit) }, callerOf(req), text(req.body?.note));
    const focus = text(req.body?.focus)?.trim();
    acknowledge(res, done, focus ? { focus: await focusItem(focus, req.params.id) ? req.params.id : 'unchanged: not held by ' + focus } : {});
  }));
  app.post('/api/work-items/:id/assign', guarded(async (req, res) => {
    acknowledge(res, await assignItem(req.params.id, holderFrom(req.body), callerOf(req), text(req.body?.note)));
  }));
  app.post('/api/work-items/:id/release', guarded(async (req, res) => {
    acknowledge(res, await releaseItem(req.params.id, callerOf(req), text(req.body?.note)));
  }));
  app.post('/api/work-items/:id/return', guarded(async (req, res) => {
    const session = text(req.body?.session)?.trim();
    if (!session) throw new WorkItemBadInput('return needs the session giving the item back.');
    acknowledge(res, await returnItem(req.params.id, session, callerOf(req), text(req.body?.team)?.trim() || undefined));
  }));
  app.post('/api/work-items/:id/restore', guarded(async (req, res) => {
    const team = text(req.body?.team)?.trim();
    if (!team) throw new WorkItemBadInput('restore needs the team that holds the item again.');
    acknowledge(res, await restoreItem(req.params.id, team, callerOf(req)));
  }));
  app.post('/api/work-items/:id/reparent', guarded(async (req, res) => {
    acknowledge(res, await reparentItem(req.params.id, text(req.body?.parent) || null, callerOf(req)));
  }));

  // Anything else under /api/work-items names no item (an id like surface/7 is not one):
  // a JSON 404 naming it, so a tool can say so rather than parse an HTML error page.
  app.all('/api/work-items/*', (req, res) => {
    const id = req.path.slice('/api/work-items/'.length).replace(/\/(assign|release|return|restore|reparent|stage|status)$/, '');
    res.status(404).json({ ok: false, error: `No work item ${id}.` });
  });
}
