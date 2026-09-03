import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { REPO_ROOT } from '../resources.js';
import { now, writeReceipt, type PromotionReceipt } from './receipts.js';

const execFileP = promisify(execFile);

export function promotionUnitName(id: string): string {
  return `ronin-promote-${id.replace(/[^a-zA-Z0-9_.-]/g, '-')}`;
}

export async function queuePromotionContinuation(receipt: PromotionReceipt, ledgerDir?: string): Promise<PromotionReceipt> {
  const unit = promotionUnitName(receipt.id);
  const queued = {
    ...receipt,
    updated_at: now(),
    restart: { unit: `${unit}.service`, at: now(), ok: true, detail: 'restart and health continuation queued' },
  };
  await writeReceipt(queued, ledgerDir);
  await execFileP('systemctl', ['--user', 'stop', `${unit}.service`], { timeout: 10_000 }).catch(() => undefined);
  await execFileP('systemctl', ['--user', 'reset-failed', `${unit}.service`], { timeout: 10_000 }).catch(() => undefined);
  try {
    await execFileP('systemd-run', [
      '--user', '--collect', `--unit=${unit}`, `--property=WorkingDirectory=${REPO_ROOT}`,
      process.execPath, '--import', 'tsx', path.join(REPO_ROOT, 'src', 'commands', 'promotion-finish.ts'), receipt.id,
    ], { cwd: REPO_ROOT, timeout: 15_000 });
  } catch (error) {
    const failed = { ...queued, updated_at: now(), restart: { ...queued.restart, ok: false, detail: String((error as Error).message ?? error) } };
    await writeReceipt(failed, ledgerDir);
    throw error;
  }
  return queued;
}

export async function promotionUnitProgress(receipt: PromotionReceipt): Promise<object | null> {
  if (receipt.state !== 'restarting' || !receipt.restart?.unit) return null;
  try {
    const { stdout } = await execFileP('systemctl', [
      '--user', 'show', receipt.restart.unit,
      '--property=ActiveState,SubState,Result,ExecMainStatus', '--output=json',
    ], { timeout: 5_000 });
    return JSON.parse(stdout) as object;
  } catch (error) {
    return { unit: receipt.restart.unit, detail: String((error as Error).message ?? error).split('\n')[0] };
  }
}
