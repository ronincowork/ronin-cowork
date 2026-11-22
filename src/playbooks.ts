/**
 * A PLAYBOOK'S TWO COPIES (docs/using-ronin/playbooks.md; ronin_stock/playbooks/playbooks_readme.md). A
 * playbook is work items (src/work-items.ts, PLAYBOOKS): read, edited and deleted as any item is.
 * What is the playbook's own is copying a tree across:
 *
 * - checkout PLAYBOOK-n: the tree made as plain new live items, To Do, held by the receiver, with
 *   no link back to the playbook;
 * - file a live item: it and its children made as a new playbook, in the custom folder.
 */
import { createItem, handedNotice, listItems, listPlaybooks, readItem, WorkItemMissing, type Holder, type WorkItem } from './work-items.js';
import { enqueueMessage } from './message-queue.js';
import { listSessions } from './tmux.js';
import { readTeamRoster } from './team-rosters.js';

/** The kind a copied child takes: Task under an epic, Subtask under anything else. */
const childKind = (parentKind: string): string => (parentKind === 'Epic' ? 'Task' : 'Subtask');

/** item checkout PLAYBOOK-n: the item and everything under it, as new live items in that order,
 * each held by the receiver, in the receiver's Campaign; an Agent other than the caller told once.
 * Answers the top item and every id made. */
export async function checkoutPlaybook(id: string, to: Extract<Holder, { kind: 'agent' | 'team' }>, by: string): Promise<{ epic: WorkItem; made: string[] }> {
  const top = await readItem(id);
  if (!top) throw new WorkItemMissing(`No playbook ${id}; item search --playbook lists them.`);
  const playbooks = await listPlaybooks();
  const campaign_id = to.kind === 'team' ? (await readTeamRoster(to.name))?.campaign_id
    : (await listSessions().catch(() => [])).find((one) => one.name === to.name)?.campaign_id;
  const made: string[] = [];
  const make = async (source: WorkItem, kind: string, parent: string | null): Promise<WorkItem> => {
    const { item } = await createItem({ title: source.title, objective: source.objective, kind, parent, holder: to, ...(campaign_id ? { campaign_id } : {}) }, by);
    made.push(item.id);
    for (const child of playbooks.filter((one) => one.parent === source.id)) await make(child, childKind(kind), item.id);
    return item;
  };
  const epic = await make(top, top.kind, null);
  if (to.kind === 'agent' && to.name !== by) await enqueueMessage(to.name, handedNotice(epic, by), 'house', 'Work items');
  return { epic, made };
}

/** item checkout <live id> --playbook: the live item and its children, as a new playbook. */
export async function fileAsPlaybook(id: string, by: string): Promise<WorkItem> {
  const top = await readItem(id);
  if (!top) throw new WorkItemMissing(`No work item ${id}.`);
  const live = await listItems();
  const file = async (source: WorkItem, kind: string, parent: string | null): Promise<WorkItem> => {
    const { item } = await createItem({ title: source.title, objective: source.objective, kind, parent, playbook: true }, by);
    for (const child of live.filter((one) => one.parent === source.id)) await file(child, childKind(kind), item.id);
    return item;
  };
  return file(top, top.kind, null);
}
