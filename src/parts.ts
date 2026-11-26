/**
 * SERVICES PARTS — what is on disk, and which of it this server runs.
 *
 * A part is a directory under `src/services/` with a `register` entry. Parts arrive with
 * Ronin Services, which ships with Cowork; where Services is present, every part runs (owner,
 * 2026-11-26, KAN-914: no Services switch, no per-feature switch). A part is left out only when
 * it parks itself (`PARKED.md`) or fails to load.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVICES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'services');

export interface PartOnDisk { name: string; entry: string; parked?: string }

/** Every part present on disk, in name order. Not what runs — see `partsToLoad`. */
export function discoverParts(dir = SERVICES_DIR): PartOnDisk[] {
  if (!fs.existsSync(dir)) return [];
  const out: PartOnDisk[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const entry = ['register.js', 'register.ts'].map((f) => path.join(dir, name, f)).find((p) => fs.existsSync(p));
    if (entry) {
      const marker = path.join(dir, name, 'PARKED.md');
      const parked = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').split(/\r?\n/).find((line) => line.trim())?.trim() : undefined;
      out.push({ name, entry, ...(parked ? { parked } : {}) }); // a stray file or a README is not a part
    }
  }
  return out;
}

export interface PartsPlan<T extends { name: string; parked?: string }> {
  load: T[];
  /** Self-declared parked: on disk, not run. */
  parked: { name: string; reason: string }[];
}

/** Every part present loads, but one that parks itself. */
export function partsToLoad<T extends { name: string; parked?: string }>(parts: T[]): PartsPlan<T> {
  const plan: PartsPlan<T> = { load: [], parked: [] };
  for (const part of parts) {
    if (part.parked) plan.parked.push({ name: part.name, reason: part.parked });
    else plan.load.push(part);
  }
  return plan;
}
