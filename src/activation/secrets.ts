/**
 * THE SERVICES SECRET STORE — the two credentials this install holds, and nothing else.
 *
 * They live on the USER root, not the data root, and that is a decision with a consequence:
 * an uninstall LEAVES the user root and DELETES the data root. Putting an entitlement on the
 * data root would destroy it when someone removed the free half — costing them an email round
 * trip to get back something they already own.
 *
 * The store table's own test decides it: "if deleting it would lose the user's own work or
 * their choices, it is user." An entitlement is theirs.
 *
 * Mode 0600 on both the directory's files and the files themselves. Never logged, never
 * returned to the browser, never included in a settei record.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../stores.js';

const dir = () => storeDir('services_secrets');
const claimFile = () => path.join(dir(), 'claim_secret');
const tokenFile = () => path.join(dir(), 'entitlement_token');

async function writeSecret(file: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  // Written to a temp file then renamed, so a crash cannot leave a half-written credential
  // that authenticates as nothing and is indistinguishable from a wrong one.
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

/** Cancelling or replacing an address must not leave the previous claim secret usable. */
export async function clearClaimSecret(): Promise<void> {
  await fs.rm(claimFile(), { force: true });
}
