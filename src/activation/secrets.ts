import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';

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

/** The office's entitlement, written by the provisioner beside office_record.json in the office_unit store
 *  (ronin-cloud office_kohai/unit-install.sh); Ronin only reads it. Services' account part sends it to HQ
 *  (account/read.ts, account/tomodachi-send.ts). Null when there is none: a self-hosted office. */
export const getEntitlementToken = () => readSecret(path.join(storeDir('office_unit'), 'entitlement_token'));
export const getHouseToken = () => readSecret(houseTokenFile());
export const putHouseToken = (v: string) => writeSecret(houseTokenFile(), v);
