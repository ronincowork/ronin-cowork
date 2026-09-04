import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile as brokerExecFile } from '../spawn-broker.js';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

export const SEP = '';

export interface SessionRow { name: string; tags: string[]; leads: string[] }

const split = (s: string): string[] => s.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);

export function parseSessionRows(text: string): SessionRow[] {
  const rows: SessionRow[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const [name = '', tags = '', leads = ''] = line.split(SEP);
    if (!name || name.startsWith('grid_')) continue;
    rows.push({ name, tags: split(tags), leads: split(leads) });
  }
  return rows;
}

export function leadsFor(team: string, rows: SessionRow[]): string[] {
  return rows.filter((r) => r.leads.includes(team)).map((r) => r.name);
}

export function teamOfLine(line: string): string | null {
  const m = line.match(/^team\/([^/]+)\/dev$/);
  return m ? m[1]! : null;
}

export async function findLeads(team: string): Promise<string[]> {
  try {
    const { stdout } = await run('tmux', ['list-sessions', '-F', `#{session_name}${SEP}#{@ronin-tags}${SEP}#{@ronin-lead}`]);
    return leadsFor(team, parseSessionRows(stdout));
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
}

export function leadMessage(n: LeadNotice): string {
  if (n.result === 'accepted') {
    return `hand-in ${n.receiptId} by ${n.session} is on ${n.line} (${(n.lineSha ?? '').slice(0, 10)}). Your job: review the team line and promote it to dev when it is coherent — bin/ronin-promote ${n.team}. tejun-desk receipts --line --accepted lists what it carries.`;
  }
  return `hand-in ${n.receiptId} by ${n.session} CONFLICTS with ${n.line}${n.files?.length ? ` on ${n.files.join(', ')}` : ''}. Your job: adjudicate — the line is untouched; the desk is blocked until you rule.`;
}

export type Delivery = { to: string; how: 'house-send' | 'wipeboard' | 'self'; detail: string };

export function replyMessage(receiptId: string, lead: string, message: string): string {
  return `lead reply on hand-in ${receiptId} from ${lead}: ${message}`;
}

export async function replyToHandIn(input: {
  team: string; from: string; to: string; receiptId: string; message: string;
}): Promise<Delivery> {
  const leads = await findLeads(input.team);
  if (!leads.includes(input.from)) throw new Error(`${input.from} is not a lead of ${input.team}`);
  const msg = replyMessage(input.receiptId, input.from, input.message);
  try {
    const { stdout } = await brokerExecFile(path.join(REPO, 'libexec', 'ronin-house-send'), [input.to, msg]);
    return { to: input.to, how: 'house-send', detail: stdout.trim() };
  } catch (e) {
    const err = e as { stdout?: string; message?: string };
    return { to: input.to, how: 'wipeboard', detail: `${(err.stdout ?? err.message ?? '').trim()} → ${await wipeboard(input.team, msg, input.to)}` };
  }
}

export function selfMessage(n: LeadNotice): string {
  if (n.result === 'accepted') {
    return `no lead is set for ${n.team}: hand-in must not move the team line until the owner marks a lead 人. Tell the owner: "${n.team} has no team lead — please mark one on the Team page." Then retry the same hand-in.`;
  }
  return `no lead is set for ${n.team}, so the conflict${n.files?.length ? ` on ${n.files.join(', ')}` : ''} is yours to resolve: tejun-desk sync, resolve the marked files at your desk, commit, hand in again.`;
}

export async function notifyLeads(n: LeadNotice): Promise<Delivery[]> {
  const leads = await findLeads(n.team);
  const msg = leadMessage(n);
  if (!leads.length) {
    await wipeboard(n.team, `${n.session} holds the lead's job for ${n.receiptId} — ${msg}`, 'none');
    return [{ to: n.session, how: 'self', detail: selfMessage(n) }];
  }
  const out: Delivery[] = [];
  for (const lead of leads) {
    try {
      const { stdout } = await brokerExecFile(path.join(REPO, 'libexec', 'ronin-house-send'), [lead, msg]);
      out.push({ to: lead, how: 'house-send', detail: stdout.trim() });
    } catch (e) {
      const err = e as { stdout?: string; message?: string };
      out.push({ to: lead, how: 'wipeboard', detail: `${(err.stdout ?? err.message ?? '').trim()} → ${await wipeboard(n.team, msg, lead)}` });
    }
  }
  return out;
}

async function wipeboard(team: string, msg: string, to: string): Promise<string> {
  try {
    const { stdout } = await brokerExecFile(path.join(REPO, 'ronin_bin', 'tejun-wipeboard'), [team, 'post', '--to', to, msg]);
    return stdout.trim().split('\n')[0] ?? 'posted';
  } catch (e) {
    const err = e as { stdout?: string; message?: string };
    return `wipeboard failed: ${(err.stdout ?? err.message ?? '').trim()}`;
  }
}
