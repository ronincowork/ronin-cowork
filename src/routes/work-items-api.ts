/* /api/work-items* — the one door to the work item store (src/work-items.ts), and the
 * `item` tool's (ronin_bin/item): every act names its item. Every write acknowledges with
 * the item as it now is and the trail line it appended; the caller reads that before its
 * next act. The refusals (409): nothing goes below -1 ("w39 can't go there."), and an Agent's
 * new item needs an epic above it. */
import type express from 'express';
import {
  WorkItemBadInput, WorkItemMissing, WorkItemRefused,
  addComment, assignItem, attachDoc, connectionOf, createItem, deleteItem, editComment, editItem, flagItem, handoffItem, holderLabel, holdersOf, linkItem, listItems, readItem, resolveId, sendBack, watchItem, watchedIds,
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
  return team ? { kind: 'team', name: team } : { kind: 'agent', name: session!.replace(/^agent:/, '') };
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
    // item; each narrowed by ?holder=<name> (none: the unheld list, held and watched by nobody and not Done), ?parent=<id> (any id it has had),
    // ?no_parent=1, ?status=, ?kind=, ?text=<words> (every word in the title or objective, any case).
    const team = text(req.query.team)?.trim();
    const session = text(req.query.session)?.trim();
    const holder = text(req.query.holder)?.trim();
    const named = text(req.query.parent)?.trim();
    const parent = named ? await resolveId(named).catch(() => named) : undefined;
    const words = (text(req.query.text) ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const orphans = Boolean(text(req.query.no_parent));
    const status = text(req.query.status)?.trim().toLowerCase();
    const kind = text(req.query.kind)?.trim().toLowerCase();
    const campaign = text(req.query.campaign)?.trim();
    const watched = holder === 'none' ? await watchedIds() : new Set<string>();
    const narrow = <T extends WorkItem & { holder?: string }>(items: T[]): T[] => items.filter((item) =>
      (!holder || (holder === 'none' && !item.holder && !watched.has(item.id) && item.status !== 'Done') || item.holder === `agent:${holder}` || item.holder === `team:${holder}` || item.holder === holder)
      && (!parent || item.parent === parent) && (!orphans || !item.parent)
      && (!status || item.status.toLowerCase() === status) && (!kind || item.kind.toLowerCase() === kind)
      && (!campaign || item.campaign_id === campaign)
      && words.every((word) => `${item.title}\n${item.objective}`.toLowerCase().includes(word)));
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
    const connection = connectionOf(item, all.find((other) => other.id === item.parent) ?? null);
    res.json({ ok: true, item, held_by: (await holdersOf(item.id)).map(holderLabel), ...(children.length ? { children } : {}), ...(inward.length ? { linked_from: inward } : {}), ...(connection ? { connection } : {}) });
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

  // THE ACTS THAT TAKE SEVERAL IDS (WORK_ITEMS_DESIGN.md section 5): transition, assign, handoff,
  // watch, unwatch, flag, unflag, delete. Each is one function of (id, body, caller) answering
  // its acknowledgement; POST /api/work-items/:id/<act> (DELETE /api/work-items/:id) runs it on
  // one item, POST /api/work-items/many/<act> { ids } on each in turn, every id answering.
  type Act = (id: string, b: Record<string, unknown>, by: string) => Promise<{ acknowledgement: string; done?: Acknowledged; extra?: Record<string, unknown> }>;
  const acted = (done: Acknowledged) => ({ acknowledgement: didLine(done), done });
  const acts: Record<string, Act> = {
    // Jira's transition: any status to any status, one trail line. Edit does not set it.
    transition: async (id, b, by) => {
      const status = text(b.status)?.trim();
      if (!status) throw new WorkItemBadInput('name the status, one of the space\'s.');
      return acted(await editItem(id, { status }, by, text(b.note)));
    },
    // Assign adds a holder and removes nobody.
    assign: async (id, b, by) => acted(await assignItem(id, holderFrom(b), by, text(b.note))),
    // Handoff removes the giver and adds the receiver; none only lets the giver go. The giver is
    // the caller, or { from } named: an Agent, or team:<name> (an Agent taking its team's item).
    handoff: async (id, b, by) => {
      const to = b.none === true || b.none === 'true' ? null : holderFrom(b);
      const named = text(b.from)?.trim();
      const from: Holder = named ? (named.startsWith('team:') ? { kind: 'team', name: named.slice(5) } : { kind: 'agent', name: named.replace(/^agent:/, '') }) : { kind: 'agent', name: by };
      return acted(await handoffItem(id, from, to, by, text(b.note)));
    },
    // Jira's delete; an item that came from Jira goes only with { in_jira } (5a).
    delete: async (id, b, by) => {
      const { deleted, orphaned } = await deleteItem(id, by, { inJira: b.in_jira === true || b.in_jira === 'true' });
      const subtasks = deleted.slice(1);
      return { extra: { deleted, ...(orphaned.length ? { no_parent: orphaned } : {}) },
        acknowledgement: [`${deleted[0]} was deleted`, subtasks.length ? `with its subtasks ${subtasks.join(', ')}` : '', orphaned.length ? `${orphaned.join(', ')} now ${orphaned.length === 1 ? 'has' : 'have'} no parent` : ''].filter(Boolean).join('; ') };
    },
  };
  // Watch adds the item to the watcher's watches (the caller, or { team } or { session } named), unwatch
  // takes it off; no hold changes, no trail line.
  for (const [verb, watch] of [['watch', true], ['unwatch', false]] as const) {
    acts[verb] = async (given, b, by) => {
      const watcher = b.team || b.session ? holderFrom(b) : { kind: 'agent', name: by } as const;
      const { id, watches } = await watchItem(given, watcher, watch);
      const list = watches.length ? watches.join(', ') : 'nothing';
      return { extra: { watches }, acknowledgement: watcher.kind === 'agent' && watcher.name === by
        ? `You ${watch ? 'watch' : 'no longer watch'} ${id}; you watch ${list}.`
        : `${holderLabel(watcher)} ${watch ? 'watches' : 'no longer watches'} ${id}; it watches ${list}.` };
    };
  }
  // Jira's Add flag / Remove flag; { comment } is the reason, kept as a comment.
  for (const [verb, flagged] of [['flag', true], ['unflag', false]] as const) {
    acts[verb] = async (id, b, by) => acted(await flagItem(id, flagged, text(b.comment), by));
  }
  app.post('/api/work-items/many/:act', guarded(async (req, res) => {
    const act = acts[req.params.act!];
    if (!act) throw new WorkItemBadInput(`several ids go to ${Object.keys(acts).join(', ')}; not ${req.params.act}.`);
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map((id) => String(id).trim()).filter(Boolean) : [];
    if (!ids.length) throw new WorkItemBadInput('name the items as { ids: [...] }.');
    const by = callerOf(req);
    const answers: Array<{ id: string; ok: boolean; acknowledgement?: string; error?: string }> = [];
    for (const id of ids) {
      try { answers.push({ id, ok: true, acknowledgement: (await act(id, req.body ?? {}, by)).acknowledgement }); }
      catch (error) { answers.push({ id, ok: false, error: String((error as Error)?.message ?? error) }); }
    }
    const said = answers.map((one) => one.ok ? one.acknowledgement : `${one.id}: ${one.error}`).join('\n');
    // Every id failed: the tool's error path. Some failed: the answer says which, line by line.
    if (answers.every((one) => !one.ok)) return res.status(409).json({ ok: false, refused: true, answers, error: said });
    res.json({ ok: answers.every((one) => one.ok), answers, acknowledgement: said });
  }));
  for (const [verb, act] of Object.entries(acts)) {
    const handler = guarded(async (req, res) => {
      const { done, acknowledgement, extra } = await act(req.params.id!, req.body ?? {}, callerOf(req));
      if (done) acknowledge(res, done, extra);
      else res.json({ ok: true, ...extra, acknowledgement });
    });
    if (verb === 'delete') app.delete('/api/work-items/:id', handler);
    else app.post(`/api/work-items/:id/${verb}`, handler);
  }
  // Send back (Waiting on you): In Progress with the comment, back to the Agent that handed it in.
  app.post('/api/work-items/:id/send-back', guarded(async (req, res) => {
    acknowledge(res, await sendBack(req.params.id!, text(req.body?.text), callerOf(req)));
  }));
  app.post('/api/work-items/:id/attach', guarded(async (req, res) => {
    const remove = req.body?.remove === true || req.body?.remove === 'true';
    acknowledge(res, await attachDoc(req.params.id, text(req.body?.path) ?? '', callerOf(req), remove));
  }));
  app.post('/api/work-items/:id/link', guarded(async (req, res) => {
    const remove = req.body?.remove === true || req.body?.remove === 'true';
    acknowledge(res, await linkItem(req.params.id, text(req.body?.type)?.trim() ?? '', text(req.body?.to)?.trim() ?? '', callerOf(req), remove));
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
    const id = req.path.slice('/api/work-items/'.length).replace(/\/(assign|handoff|watch|unwatch|transition|flag|unflag|attach|link|comment|send-back)$/, '');
    res.status(404).json({ ok: false, error: `No work item ${id}.` });
  });
}
