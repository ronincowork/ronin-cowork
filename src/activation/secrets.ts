import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';

// The office_unit store (mode 0700): the tokens sit beside office_record.json, not in services_secrets.
const dir = () => storeDir('office_unit');
const tokenFile = () => path.join(dir(), 'entitlement_token');
// A hosted office's own credential for the model gateway, written by the provisioner; Ronin never mints it.
const houseTokenFile = () => path.join(dir(), 'house_token');

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

export const putEntitlementToken = (v: string) => writeSecret(tokenFile(), v);
export const getEntitlementToken = () => readSecret(tokenFile());
export const getHouseToken = () => readSecret(houseTokenFile());
export const putHouseToken = (v: string) => writeSecret(houseTokenFile(), v);

export async function clearEntitlementToken(): Promise<void> {
  await fs.rm(tokenFile(), { force: true });
}

/** An entitlement is held when its token file is. Identity transport only: it unlocks nothing. */
export async function isEntitled(): Promise<boolean> {
  return (await getEntitlementToken()) !== null;
}
