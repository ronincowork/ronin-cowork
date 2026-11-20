import os from 'node:os';
import path from 'node:path';
import { isOfficeHost } from './office-record.js';
import { storeDir } from './resources.js';

/**
 * WHAT OPENS ON THIS MACHINE (KAN-756), the one rule the file viewer (document-file.ts, /api/file,
 * /raw), Chat links (file-link.ts) and the folder browser (/api/folders) share.
 *
 * A hosted office (office_unit): Ronin owns the VM, so the office user's whole home folder opens,
 * except anything hidden — a path part under home starting with "." — even through a direct link.
 * Ronin's own session folders (an Agent's brief, drop/ and scratchpad, under the data root) are
 * Ronin's, not the user's hidden files, and open as before.
 * Self-hosted: unchanged — what opens today opens; nothing more.
 */

const HOME = path.resolve(os.homedir());

const inside = (root: string, file: string): boolean => {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/** A path part under home that starts with ".", outside Ronin's own session folders. */
export function hiddenInHome(file: string): boolean {
  const resolved = path.resolve(file);
  if (!inside(HOME, resolved) || inside(storeDir('session'), resolved)) return false;
  return path.relative(HOME, resolved).split(path.sep).some((part) => part.startsWith('.'));
}

/** True when this machine never opens `file` (each form given: as written, and as it resolves). */
export async function refusedHere(...files: string[]): Promise<boolean> {
  return (await isOfficeHost()) && files.some((file) => !!file && hiddenInHome(file));
}

/** The folders a relative path is also looked for in, after the Agent's own: home on an office. */
export async function openBases(): Promise<string[]> {
  return (await isOfficeHost()) ? [HOME] : [];
}

export const HIDDEN_REFUSED = 'Hidden files and folders don\'t open in this office.';
