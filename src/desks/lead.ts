/**
 * The lead's notice — a hand-in reaches the team lead regardless of the lead's dial.
 *
 * Owner law, 2026-08-28: reviewing the team line and promoting it to `dev` is the lead's
 * PRIMARY job, so every team agent's hand-in must reach the lead directly, dial or no
 * dial. This is house machinery on the same footing as Koshi writing the marker and
 * `write_tegami --at`: the dial governs an agent DRIVING a session; the house telling the
 * lead that its job is waiting is not that. The sender is `libexec/ronin-house-send`,
 * which nobody types — `tejun-send` keeps its dial check, so no agent gains a bypass.
 *
 * Who the lead is: the 人 — `@ronin-lead` on the tmux session, hand-set by the owner,
 * never derived from what a session is doing (R35). A session leads the teams named in
 * that option; a team can have more than one lead, and then every lead is told.
 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

export const SEP = '';

/** One tmux row: `name SEP tags SEP leads` — the shape `tejun-team` reads. */
export interface SessionRow { name: string; tags: string[]; leads: string[] }

const split = (s: string): string[] => s.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);

/** Parse `tmux list-sessions -F "#{session_name}SEP#{@ronin-tags}SEP#{@ronin-lead}"`. */
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

/** The sessions that lead `team`: `@ronin-lead` names the team. Pure; the tmux read is `findLeads`. */
export function leadsFor(team: string, rows: SessionRow[]): string[] {
  return rows.filter((r) => r.leads.includes(team)).map((r) => r.name);
}

/** The team a line belongs to: `team/<team>/dev` → `<team>`; `dev` and `solo/*` have none. */
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

/** The words the lead reads. Short, and it says what to do. */
export function leadMessage(n: LeadNotice): string {
  if (n.result === 'accepted') {
    return `hand-in ${n.receiptId} by ${n.session} is on ${n.line} (${(n.lineSha ?? '').slice(0, 10)}). Your job: review the team line and promote it to dev when it is coherent — bin/ronin-promote ${n.team}. tejun-desk receipts --line --accepted lists what it carries.`;
  }
  return `hand-in ${n.receiptId} by ${n.session} CONFLICTS with ${n.line}${n.files?.length ? ` on ${n.files.join(', ')}` : ''}. Your job: adjudicate — the line is untouched; the desk is blocked until you rule.`;
}

export type Delivery = { to: string; how: 'house-send' | 'wipeboard' | 'self'; detail: string };

/** A lead's ruling goes back along the receipt, not through the chatter dial. */
export function replyMessage(receiptId: string, lead: string, message: string): string {
  return `lead reply on hand-in ${receiptId} from ${lead}: ${message}`;
}

/**
 * Deliver a reply to the session named by a hand-in receipt.  The receipt makes this
 * control-plane traffic: callers cannot use the command to force arbitrary messages
 * into arbitrary sessions.  Only a currently named lead of the receipt's team may send
 * it.  Tile-safety refusal falls back to the team wipeboard, exactly like the inbound
 * hand-in notice.
 */
export async function replyToHandIn(input: {
  team: string; from: string; to: string; receiptId: string; message: string;
}): Promise<Delivery> {
  const leads = await findLeads(input.team);
  if (!leads.includes(input.from)) throw new Error(`${input.from} is not a lead of ${input.team}`);
  const msg = replyMessage(input.receiptId, input.from, input.message);
  try {
    const { stdout } = await run(path.join(REPO, 'libexec', 'ronin-house-send'), [input.to, msg]);
    return { to: input.to, how: 'house-send', detail: stdout.trim() };
  } catch (e) {
    const err = e as { stdout?: string; message?: string };
    return { to: input.to, how: 'wipeboard', detail: `${(err.stdout ?? err.message ?? '').trim()} → ${await wipeboard(input.team, msg, input.to)}` };
  }
}

/**
 * No lead set: the job falls to the session that handed in (owner law, 2026-08-28: "the
 * user is always there — the fallback is the agent handing in; it has to work end to end
 * with no lead, seamlessly"). Its own words, printed to it by the hand-in it just ran.
 */
export function selfMessage(n: LeadNotice): string {
  if (n.result === 'accepted') {
    return `no lead is set for ${n.team}, so you hold the lead's job for this hand-in: review the line (tejun-desk receipts --line --accepted) and promote it to dev when it is coherent — bin/ronin-promote ${n.team}. Nothing waits on anyone.`;
  }
  return `no lead is set for ${n.team}, so the conflict${n.files?.length ? ` on ${n.files.join(', ')}` : ''} is yours to resolve: tejun-desk sync, resolve the marked files at your desk, commit, hand in again.`;
}

/**
 * Tell every lead of the line's team. Delivery is the house sender; at a recognizable
 * prompt it preserves any draft/suggestion, appends the notice and submits both together
 * (owner, 2026-08-29). If there is no session or a dialog is open, the notice goes to the
 * team wipeboard instead so it is never lost — and the caller prints what happened.
 * With no lead at all, the handing-in session is told it holds the job, and the notice is
 * posted on the wipeboard for the record without interrupting anyone.
 */
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
      const { stdout } = await run(path.join(REPO, 'libexec', 'ronin-house-send'), [lead, msg]);
      out.push({ to: lead, how: 'house-send', detail: stdout.trim() });
    } catch (e) {
      const err = e as { stdout?: string; message?: string };
      out.push({ to: lead, how: 'wipeboard', detail: `${(err.stdout ?? err.message ?? '').trim()} → ${await wipeboard(n.team, msg, lead)}` });
    }
  }
  return out;
}

/** `tejun-wipeboard <board> post --to <who> <text>` — the team's board; `to` decides who is interrupted. */
async function wipeboard(team: string, msg: string, to: string): Promise<string> {
  try {
    const { stdout } = await run(path.join(REPO, 'ronin_bin', 'tejun-wipeboard'), [team, 'post', '--to', to, msg]);
    return stdout.trim().split('\n')[0] ?? 'posted';
  } catch (e) {
    const err = e as { stdout?: string; message?: string };
    return `wipeboard failed: ${(err.stdout ?? err.message ?? '').trim()}`;
  }
}
