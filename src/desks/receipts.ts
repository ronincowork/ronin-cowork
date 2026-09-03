import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { storeDir } from '../resources.js';
import { branchKey } from './registry.js';
import type { HandInReceipt } from './schema.js';

export const ledgerFile = (repo: string, line: string): string =>
  path.join(storeDir('desks'), 'receipts', repo, `${branchKey(line)}.jsonl`);

export const newReceiptId = (): string =>
  `hi_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomBytes(3).toString('hex')}`;

export async function appendReceipt(r: HandInReceipt): Promise<HandInReceipt> {
  const file = ledgerFile(r.repo, r.line);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(r) + '\n');
  return r;
}

export async function receiptsForLine(repo: string, line: string): Promise<HandInReceipt[]> {
  try {
    const text = await readFile(ledgerFile(repo, line), 'utf8');
    return text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as HandInReceipt);
  } catch {
    return [];
  }
}

export async function receiptsForDesk(repo: string, branch: string, line?: string): Promise<HandInReceipt[]> {
  if (line) return (await receiptsForLine(repo, line)).filter((r) => r.desk === branch);
  const dir = path.join(storeDir('desks'), 'receipts', repo);
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const out: HandInReceipt[] = [];
  for (const f of files) {
    if (!f.endsWith('.jsonl')) continue;
    const text = await readFile(path.join(dir, f), 'utf8').catch(() => '');
    for (const l of text.split('\n')) if (l) {
      const r = JSON.parse(l) as HandInReceipt;
      if (r.desk === branch) out.push(r);
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export async function receiptById(repo: string, id: string): Promise<HandInReceipt | null> {
  const dir = path.join(storeDir('desks'), 'receipts', repo);
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return null;
  }
  for (const f of files) {
    const text = await readFile(path.join(dir, f), 'utf8').catch(() => '');
    for (const l of text.split('\n')) if (l.includes(id)) {
      const r = JSON.parse(l) as HandInReceipt;
      if (r.id === id) return r;
    }
  }
  return null;
}

export async function acceptedSince(repo: string, line: string, sinceLineSha: string): Promise<HandInReceipt[]> {
  const all = (await receiptsForLine(repo, line)).filter((r) => r.result === 'accepted');
  if (!sinceLineSha) return all;
  const i = all.findIndex((r) => r.line_sha === sinceLineSha);
  return i < 0 ? all : all.slice(i + 1);
}

export async function acceptedLinesForTeam(team: string): Promise<Array<{ repo: string; line: string }>> {
  const root = path.join(storeDir('desks'), 'receipts');
  const repos = await readdir(root, { withFileTypes: true }).catch(() => []);
  const found = new Map<string, { repo: string; line: string }>();
  for (const entry of repos) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const files = await readdir(dir).catch(() => []);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const text = await readFile(path.join(dir, file), 'utf8').catch(() => '');
      for (const row of text.split('\n')) {
        if (!row) continue;
        const receipt = JSON.parse(row) as HandInReceipt;
        if (receipt.team !== team || receipt.result !== 'accepted') continue;
        found.set(`${receipt.repo}\0${receipt.line}`, { repo: receipt.repo, line: receipt.line });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.repo.localeCompare(b.repo) || a.line.localeCompare(b.line));
}
