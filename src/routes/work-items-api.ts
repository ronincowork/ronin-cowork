/* /api/work-items* — the one door to the work item store (src/work-items.ts), and the
 * `item` tool's (ronin_bin/item): every act names its item. Every write acknowledges with
 * the item as it now is and the trail line it appended; the caller reads that before its
 * next act. The refusals (409): nothing goes below -1 ("w39 can't go there."), and an Agent's
 * new item needs an epic above it. */
import type express from 'express';
import {
  WorkItemBadInput, WorkItemMissing, WorkItemRefused,
  addComment, assignItem, attachDoc, createItem, deleteItem, editComment, editItem, flagItem, handoffItem, holderLabel, holdersOf, linkItem, listItems, readItem, watchItem,
  didLine, type Acknowledged, type Holder, type JiraPair, type WorkItem,
} from '../work-items.js';
import { agentReading, everyItemReading, teamReading } from '../work-items-read.js';
import { pushTeams } from '../ws/events.js';

const text = (value: unknown): string | undefined => typeof value === 'string' ? value : value === undefined || value === null ? undefined : String(value);

/** Who called: the tool names its session; the browser is the owner. */
export function callerOf(req: express.Request): string {
  const stated = text(req.body?.by)?.trim();
  if (stated) return stated.slice(0, 128);
  return /^user_/.test(req.get('x-ronin-source') ?? '') ? 'owner' : 'unknown';
}

export const acknowledge = (res: express.Response, done: Acknowledged, extra: Record<string, unknown> = {}) =>
  res.json({
    ok: true, item: done.item, line: done.line, ...(done.notified?.length ? { notified: done.notified } : {}), ...extra,
    acknowledgement: didLine(done)
      + `${done.notified?.length ? `\nTold ${done.notified.map((name) => `@${name}`).join(', ')} of the arrival.` : ''}`,
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

/** "none" or blank is no parent. */
const parentOf = (value: unknown): string | null => { const id = text(value)?.trim(); return id && id !== 'none' ? id : null; };

/** The pair, as the bridge writes it: { id, key }, or null to drop it. */
const jiraOf = (value: unknown): JiraPair | null => {
  if (value === null) return null;
  const pair = value as Partial<JiraPair> | undefined;
  if (typeof pair?.id !== 'string' || typeof pair.key !== 'string') throw new WorkItemBadInput('jira is { id, key } or null.');
  return { id: pair.id, key: pair.key };
};

type Handler = (req: express.Request, res: express.Response) => Promise<unknown>;
const guarded = (handler: Handler): express.RequestHandler => (req, res) => {
  handler(req, res).catch((error) => answerError(res, error));
};

export function registerWorkItems(app: express.Express): void {
  // Every write here moves what the teams push carries (a Team's epic and items), so the
  // server pushes the rosters again after it, as the roster routes do (teams-api.ts).
  app.use('/api/work-items', (req, res, next) => {
    if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) void pushTeams(); });
    next();
  });

  app.get('/api/work-items', guarded(async (req, res) => {
    // Search (Jira's JQL, as filters): ?session= (an Agent's), ?team= (a Team's), or every
    // item; each narrowed by ?holder=<name> (none: the unheld list, held by nobody and not Done), ?parent=<id>, ?no_parent=1, ?status=, ?kind=.
    const team = text(req.query.team)?.trim();
    const session = text(req.query.session)?.trim();
    const holder = text(req.query.holder)?.trim();
    const parent = text(req.query.parent)?.trim();
    const orphans = Boolean(text(req.query.no_parent));
    const status = text(req.query.status)?.trim().toLowerCase();
    const kind = text(req.query.kind)?.trim().toLowerCase();
    const campaign = text(req.query.campaign)?.trim();
    const narrow = <T extends WorkItem & { holder?: string }>(items: T[]): T[] => items.filter((item) =>
      (!holder || (holder === 'none' && !item.holder && item.status !== 'Done') || item.holder === `agent:${holder}` || item.holder === `team:${holder}` || item.holder === holder)
      && (!parent || item.parent === parent) && (!orphans || !item.parent)
      && (!status || item.status.toLowerCase() === status) && (!kind || item.kind.toLowerCase() === kind)
      && (!campaign || item.campaign_id === campaign));
    if (session) { const reading = await agentReading(session); return res.json({ ok: true, ...reading, items: narrow(reading.items) }); }
    if (team) {
      const reading = await teamReading(team);
      return res.json({ ok: true, ...reading, items: narrow(reading.items) });
    }
    res.json({ ok: true, items: narrow(await everyItemReading()) });
  }));

  app.post('/api/work-items', guarded(async (req, res) => {
    const b = req.body ?? {};
    acknowledge(res, await createItem({
      title: text(b.title) ?? '', objective: text(b.objective), status: text(b.status), kind: text(b.kind), priority: text(b.priority), parent: text(b.parent) || null,
      ...(b.team || b.session ? { holder: holderFrom(b) } : {}),
    }, callerOf(req)));
  }));

  app.get('/api/work-items/:id', guarded(async (req, res) => {
    const item = await readItem(req.params.id);
    if (!item) throw new WorkItemMissing(`No work item ${req.params.id}.`);
    // Jira's read: the fields, comments, attachments, links both ways and history (trail).
    const all = await listItems();
    const children = all.filter((other) => other.parent === item.id);
    const inward = all.flatMap((other) => other.links.filter((link) => link.to === item.id).map((link) => ({ type: link.type, from: other.id })));
    res.json({ ok: true, item, held_by: (await holdersOf(item.id)).map(holderLabel), ...(children.length ? { children } : {}), ...(inward.length ? { linked_from: inward } : {}) });
  }));

  app.put('/api/work-items/:id', guarded(async (req, res) => {
    const b = req.body ?? {};
    if (b.jiraFields !== undefined) throw new WorkItemRefused('jiraFields are Jira\'s, read only: the bridge sets them.');
    const external = Object.fromEntries((['trello', 'github'] as const).filter((key) => b[key] !== undefined).map((key) => [key, text(b[key]) ?? '']));
    acknowledge(res, await editItem(req.params.id, {
      title: text(b.title), objective: text(b.objective), kind: text(b.kind), priority: text(b.priority),
      ...(b.parent !== undefined ? { parent: parentOf(b.parent) } : {}),
      ...(Object.keys(external).length ? { external } : {}),
      ...(b.jira !== undefined ? { jira: jiraOf(b.jira) } : {}),
    }, callerOf(req), text(b.note)));
  }));

  // Jira's transition: any status to any status, one trail line. Edit does not set it.
  app.post('/api/work-items/:id/transition', guarded(async (req, res) => {
    const status = text(req.body?.status)?.trim();
    if (!status) throw new WorkItemBadInput('name the status, one of the space\'s.');
    acknowledge(res, await editItem(req.params.id, { status }, callerOf(req), text(req.body?.note)));
  }));
  // Assign adds a holder and removes nobody.
  app.post('/api/work-items/:id/assign', guarded(async (req, res) => {
    acknowledge(res, await assignItem(req.params.id, holderFrom(req.body), callerOf(req), text(req.body?.note)));
  }));
  // Handoff removes the giver and adds the receiver; none only lets the giver go. The giver is
  // the caller, or { from } named: an Agent, or team:<name> (an Agent taking its team's item).
  app.post('/api/work-items/:id/handoff', guarded(async (req, res) => {
    const by = callerOf(req);
    const to = req.body?.none === true || req.body?.none === 'true' ? null : holderFrom(req.body);
    const named = text(req.body?.from)?.trim();
    const from: Holder = named ? (named.startsWith('team:') ? { kind: 'team', name: named.slice(5) } : { kind: 'agent', name: named.replace(/^agent:/, '') }) : { kind: 'agent', name: by };
    acknowledge(res, await handoffItem(req.params.id, from, to, by, text(req.body?.note)));
  }));
  // Watch adds the item to the watcher's watches (the caller, or { team } or { session } named), unwatch
  // takes it off; no hold changes, no trail line.
  for (const [verb, watch] of [['watch', true], ['unwatch', false]] as const) {
    app.post(`/api/work-items/:id/${verb}`, guarded(async (req, res) => {
      const by = callerOf(req);
      const watcher = req.body?.team || req.body?.session ? holderFrom(req.body) : { kind: 'agent', name: by } as const;
      const { id, watches } = await watchItem(req.params.id, watcher, watch);
      const list = watches.length ? watches.join(', ') : 'nothing';
      res.json({ ok: true, watches, acknowledgement: watcher.kind === 'agent' && watcher.name === by
        ? `You ${watch ? 'watch' : 'no longer watch'} ${id}; you watch ${list}.`
        : `${holderLabel(watcher)} ${watch ? 'watches' : 'no longer watches'} ${id}; it watches ${list}.` });
    }));
  }
  // Jira's Add flag / Remove flag; { comment } is the reason, kept as a comment.
  for (const [verb, flagged] of [['flag', true], ['unflag', false]] as const) {
    app.post(`/api/work-items/:id/${verb}`, guarded(async (req, res) => {
      acknowledge(res, await flagItem(req.params.id, flagged, text(req.body?.comment), callerOf(req)));
    }));
  }
  app.post('/api/work-items/:id/attach', guarded(async (req, res) => {
    const remove = req.body?.remove === true || req.body?.remove === 'true';
    acknowledge(res, await attachDoc(req.params.id, text(req.body?.path) ?? '', callerOf(req), remove));
  }));
  app.post('/api/work-items/:id/link', guarded(async (req, res) => {
    const remove = req.body?.remove === true || req.body?.remove === 'true';
    acknowledge(res, await linkItem(req.params.id, text(req.body?.type)?.trim() ?? '', text(req.body?.to)?.trim() ?? '', callerOf(req), remove));
  }));
  app.delete('/api/work-items/:id', guarded(async (req, res) => {
    const { deleted, orphaned } = await deleteItem(req.params.id, callerOf(req));
    const subtasks = deleted.slice(1);
    res.json({ ok: true, deleted, ...(orphaned.length ? { no_parent: orphaned } : {}),
      acknowledgement: [`${req.params.id} was deleted`, subtasks.length ? `with its subtasks ${subtasks.join(', ')}` : '', orphaned.length ? `${orphaned.join(', ')} now ${orphaned.length === 1 ? 'has' : 'have'} no parent` : ''].filter(Boolean).join('; ') });
  }));
  app.post('/api/work-items/:id/comment', guarded(async (req, res) => {
    // { text } adds one; { edit: n, text } changes comment n, as Jira's comment edit.
    const n = text(req.body?.edit);
    acknowledge(res, n ? await editComment(req.params.id, Number(n), text(req.body?.text) ?? '', callerOf(req))
      : await addComment(req.params.id, text(req.body?.text) ?? '', callerOf(req)));
  }));

  // Anything else under /api/work-items names no item (an id like surface/7 is not one):
  // a JSON 404 naming it, so a tool can say so rather than parse an HTML error page.
  app.all('/api/work-items/*', (req, res) => {
    const id = req.path.slice('/api/work-items/'.length).replace(/\/(assign|handoff|watch|unwatch|transition|flag|unflag|attach|link|comment)$/, '');
    res.status(404).json({ ok: false, error: `No work item ${id}.` });
  });
}
