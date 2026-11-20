import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as brokerExecFile } from '../spawn-broker.js';
import { listSessions } from '../tmux.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

export function leadsFor(team: string, rows: Array<{ name: string; leads: string[] }>): string[] {
  return rows.filter((r) => r.leads.includes(team)).map((r) => r.name);
}

export function teamOfLine(line: string): string | null {
  const m = line.match(/^team\/([^/]+)\/dev$/);
  return m ? m[1]! : null;
}

/** The roster's leads, a seat with no terminal (a daimyo) among them: its notice goes to its inbox. */
export async function findLeads(team: string): Promise<string[]> {
  try {
    return leadsFor(team, (await listSessions()).filter((s) => !s.name.startsWith('grid_')));
  } catch {
    return [];
  }
}

export interface LeadNotice {
  team: string;
  line: string;
  session: string;
  receiptId: string;
  result: 'accepted' | 'conflict';
  lineSha?: string;
  files?: string[];
  projectId?: string;
}

export function leadMessage(n: LeadNotice): string {
  if (n.result === 'accepted') {
    return `hand-in ${n.receiptId} by ${n.session} is on ${n.line} (${(n.lineSha ?? '').slice(0, 10)})${n.projectId ? ` for ${n.projectId}` : ''}. Your job: review the team line and promote it to dev when it is coherent — bin/ronin-promote ${n.team}. worktree-desk receipts --line --accepted lists what it carries.`;
  }
  return `hand-in ${n.receiptId} by ${n.session} CONFLICTS with ${n.line}${n.files?.length ? ` on ${n.files.join(', ')}` : ''}. Your job: adjudicate — the line is untouched; the worktree is blocked until you rule.`;
}

export type Delivery = { to: string; how: 'house-send' | 'wipeboard' | 'self'; detail: string };

/** Queue one house notice, independent of the recipient's dial (libexec/ronin-house-send).
 * A receipt-bound reply carries its validated lead session as the recorded actor;
 * other house notices retain Ronin House as the actor. A queue-write failure lets the
 * caller choose its wipeboard fallback. */
export async function houseSend(to: string, message: string, from?: string): Promise<string> {
  const args = from ? ['--from', from, to, message] : [to, message];
  const { stdout } = await brokerExecFile(path.join(REPO, 'libexec', 'ronin-house-send'), args);
  return stdout.trim();
}

export function replyMessage(receiptId: string, lead: string, message: string): string {
  return `lead reply on hand-in ${receiptId} from ${lead}: ${message}. Remember to update your work item.`;
}

export async function replyToHandIn(input: {
  team: string; from: string; to: string; receiptId: string; message: string;
}): Promise<Delivery> {
  const leads = await findLeads(input.team);
  if (!leads.includes(input.from)) throw new Error(`${input.from} is not a lead of ${input.team}`);
  const msg = replyMessage(input.receiptId, input.from, input.message);
  try {
    return { to: input.to, how: 'house-send', detail: await houseSend(input.to, msg, input.from) };
  } catch (e) {
    const err = e as { stdout?: string; message?: string };
    return { to: input.to, how: 'wipeboard', detail: `${(err.stdout ?? err.message ?? '').trim()} → ${await wipeboard(input.team, msg, input.to, input.from)}` };
  }
}

export function selfMessage(n: LeadNotice): string {
  return `this didn't work for promotion: team ${n.team} has no lead; ask the owner to mark one on the Team page.`;
}

export async function notifyLeads(n: LeadNotice): Promise<Delivery[]> {
  const leads = await findLeads(n.team);
  const msg = leadMessage(n);
  if (!leads.length) {
    return [{ to: n.session, how: 'self', detail: selfMessage(n) }];
  }
  const out: Delivery[] = [];
  for (const lead of leads) {
    try {
      out.push({ to: lead, how: 'house-send', detail: await houseSend(lead, msg) });
    } catch (e) {
      const err = e as { stdout?: string; message?: string };
      out.push({ to: lead, how: 'wipeboard', detail: `${(err.stdout ?? err.message ?? '').trim()} → ${await wipeboard(n.team, msg, lead)}` });
    }
  }
  return out;
}

async function wipeboard(team: string, msg: string, to: string, from = ''): Promise<string> {
  try {
    const { stdout } = await brokerExecFile(path.join(REPO, 'ronin_bin', 'edges'), [
      'wipeboard', ...(from ? ['--session', from] : []), team, 'post', '--to', to, msg,
    ]);
    return stdout.trim().split('\n')[0] ?? 'posted';
  } catch (e) {
    const err = e as { stdout?: string; message?: string };
    return `wipeboard failed: ${(err.stdout ?? err.message ?? '').trim()}`;
  }
}
