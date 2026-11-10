import fs from 'node:fs/promises';
import path from 'node:path';
import { officeRecordFile } from '../office-record.js';
import { storeDir } from '../resources.js';

// One entitlement, filed by who wrote it. In an office_unit (an office record is present, readable or
// not) it is the provisioner's, beside office_record.json in the office_unit store, and Ronin only
// reads it. Self-hosted it is the Services key Ronin itself saved, in services_secrets.
async function tokenFile(): Promise<string> {
  const hosted = await fs.access(officeRecordFile()).then(() => true, () => false);
  return path.join(storeDir(hosted ? 'office_unit' : 'services_secrets'), 'entitlement_token');
}
// A hosted office's own credential for the model gateway, written by the provisioner; Ronin never mints it.
const houseTokenFile = () => path.join(storeDir('office_unit'), 'house_token');

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

export const putEntitlementToken = async (v: string) => writeSecret(await tokenFile(), v);
export const getEntitlementToken = async () => readSecret(await tokenFile());
export const getHouseToken = () => readSecret(houseTokenFile());
export const putHouseToken = (v: string) => writeSecret(houseTokenFile(), v);

export async function clearEntitlementToken(): Promise<void> {
  await fs.rm(await tokenFile(), { force: true });
}

/** An entitlement is held when its token file is. Identity transport only: it unlocks nothing. */
export async function isEntitled(): Promise<boolean> {
  return (await getEntitlementToken()) !== null;
}
