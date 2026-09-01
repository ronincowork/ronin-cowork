#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function receiptAllowsRestart(receipts, repoDir, head) {
  const root = path.resolve(repoDir);
  for (let i = receipts.length - 1; i >= 0; i--) {
    const r = receipts[i];
    if (!['restarting', 'complete'].includes(r?.state) || r.reverted_by) continue;
    const c = (r.repos ?? []).find((x) => path.resolve(x.dir ?? '') === root && x.candidate === head);
    if (!c) continue;
    const a = (r.advances ?? []).find((x) => x.repo === c.repo && x.to === head && x.status === 'done');
    if (a) return r.id;
  }
  return '';
}

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

export function guardRestart(repoDir, ledgerDir, override = '') {
  const top = git(repoDir, ['rev-parse', '--show-toplevel']);
  const branch = git(top, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const record = fs.existsSync(path.join(top, 'RONIN_REPO')) ? fs.readFileSync(path.join(top, 'RONIN_REPO'), 'utf8') : '';
  const working = /^working=(.+)$/m.exec(record)?.[1]?.trim() ?? '';
  if (!working || branch !== working) return { ok: true, reason: 'not the reviewed working line' };
  if (override === '1') return { ok: true, reason: 'owner override RONIN_UNRECEIPTED_DEV=1' };
  const head = git(top, ['rev-parse', 'HEAD']);
  const receipts = fs.existsSync(ledgerDir)
    ? fs.readdirSync(ledgerDir).filter((n) => n.endsWith('.json')).sort().map((n) => JSON.parse(fs.readFileSync(path.join(ledgerDir, n), 'utf8')))
    : [];
  const id = receiptAllowsRestart(receipts, top, head);
  return id ? { ok: true, reason: `promotion receipt ${id}` } : { ok: false, reason: `${working}@${head.slice(0, 12)} has no successful promotion receipt` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repo = process.argv[2] ?? process.cwd();
  const ledger = process.env.RONIN_PROMOTION_LEDGER_DIR || execFileSync(path.join(repo, 'bin/ronin-store'), ['promotion_ledger'], { encoding: 'utf8' }).trim();
  try {
    const out = guardRestart(repo, ledger, process.env.RONIN_UNRECEIPTED_DEV ?? '');
    if (out.ok) { console.log(`restart guard: ok — ${out.reason}`); process.exit(0); }
    console.error(`ronin-guard: refusing to restart Ronin — ${out.reason}.`);
    console.error('ronin-guard: Promote the team through bin/ronin-promote so this exact dev tip receives a receipt.');
    console.error('ronin-guard: Owner-only one-shot override: RONIN_UNRECEIPTED_DEV=1 systemctl --user restart ronin');
    process.exit(4);
  } catch (e) {
    console.error(`ronin-guard: refusing to restart Ronin — receipt check could not prove the tip (${e.message}).`);
    process.exit(4);
  }
}
