import path from 'node:path';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { readFileSync, statSync } from 'node:fs';
import { storeDir } from './resources.js';

const credentialFile = (name: string): string => path.join(storeDir('services_secrets'), `${name}.json`);

export async function readCredential<T>(name: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(credentialFile(name), 'utf8')) as T; }
  catch { return fallback; }
}

export function readCredentialSync<T>(name: string, fallback: T): T {
  try { return JSON.parse(readFileSync(credentialFile(name), 'utf8')) as T; }
  catch { return fallback; }
}

export function credentialMtime(name: string): number {
  try { return statSync(credentialFile(name)).mtimeMs; }
  catch { return 0; }
}

export async function writeCredential(name: string, value: unknown): Promise<void> {
  const file = credentialFile(name);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
  await rename(temporary, file);
}
