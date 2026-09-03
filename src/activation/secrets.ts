import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';

const dir = () => storeDir('services_secrets');
const claimFile = () => path.join(dir(), 'claim_secret');
const tokenFile = () => path.join(dir(), 'entitlement_token');

async function writeSecret(file: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, value, { mode: 0o600 });
  await fs.rename(tmp, file);
}

async function readSecret(file: string): Promise<string | null> {
  try {
    const v = (await fs.readFile(file, 'utf8')).trim();
    return v || null;
  } catch {
    return null;
  }
}

export const putClaimSecret = (v: string) => writeSecret(claimFile(), v);
export const getClaimSecret = () => readSecret(claimFile());
export const putEntitlementToken = (v: string) => writeSecret(tokenFile(), v);
export const getEntitlementToken = () => readSecret(tokenFile());

export async function clearClaimSecret(): Promise<void> {
  await fs.rm(claimFile(), { force: true });
}
