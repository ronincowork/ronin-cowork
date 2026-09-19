/**
 * SERVICES PARTS — what is on disk, and which of it this server runs.
 *
 * A part is a directory under `src/services/` with a `register` entry. Parts arrive with
 * Ronin (they are the install); whether one RUNS is the owner's switch: an installation
 * claims the parts it runs, and a claimed part loads only while that installation is on
 * for the Campaign. Off is "as if not installed" —
 * no timers, no routes, no recorder — with the files left in place (owner, 2026-09-04:
 * the recorder ran for a Campaign whose Services switch was off, and its per-tile ticks
 * were the bulk of the server's process spawning). An unclaimed part always loads.
 *
 * The switch is read once, at start. A change on the Installations card takes effect at the
 * next restart; `/api/installed` says so, and the Services row shows it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InstallationRow } from './resource-adapters.js';
import { switches } from './instruction-cascade.js';

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
  /** Self-declared parked, or claimed by an installation whose switch is off: on disk, not run. */
  parked: { name: string; installation?: string; reason?: string }[];
  capabilities: { name: string; parts: string[] }[];
}

/** The server-only expansion from saved capability choices to implementation parts.
 * Parts carry no switches of their own and this module never imports the UI catalog. */
export const SERVICE_CAPABILITY_PARTS = Object.freeze({
  task_manager: ['michi', 'kanban'],
  terminal_transcript: ['rireki'],
  voice_hotwords: ['koe'],
  usage_stats: ['counting'],
  project_coordinator: ['koshi'],
  local_weights: ['koshi_weights'],
} as const);

/** Which installation claims each part; the first claim wins, in catalog order. */
export function partClaims(installations: Pick<InstallationRow, 'name' | 'parts'>[]): Map<string, string> {
  const claims = new Map<string, string>();
  for (const installation of installations) for (const part of installation.parts) if (!claims.has(part)) claims.set(part, installation.name);
  return claims;
}

/** The rule: a claimed part loads only while its installation switch is on; an unclaimed part always loads. */
export function partsToLoad<T extends { name: string; parked?: string }>(
  parts: T[],
  installations: Pick<InstallationRow, 'name' | 'parts'>[],
  values: unknown,
  selectedParts: unknown,
): PartsPlan<T> {
  const claims = partClaims(installations);
  const on = switches(values);
  const selected = switches(selectedParts);
  // This is the sole capability-to-part expansion. Downstream runtime reporting consumes
  // this startup plan; neither routes nor browser code repeat the implementation map.
  const capabilities = Object.entries(SERVICE_CAPABILITY_PARTS)
    .map(([name, names]) => ({ name, parts: [...names] }));
  const selectedPart = new Set<string>(capabilities
    .filter(({ name }) => selected[name] === true)
    .flatMap(({ parts: names }) => names));
  // A part that no capability maps has no component to switch: its installation's own
  // switch governs it alone. Without this, claiming such a part would park it whether the
  // switch was on or off.
  const capabilityParts = new Set<string>(capabilities.flatMap(({ parts: names }) => names));
  const plan: PartsPlan<T> = { load: [], parked: [], capabilities };
  for (const part of parts) {
    const installation = claims.get(part.name);
    if (part.parked) plan.parked.push({ name: part.name, reason: part.parked });
    else if (installation && on[installation] !== true) plan.parked.push({ name: part.name, installation, reason: 'master_off' });
    else if (part.name === 'counting' && (!installation || !selectedPart.has(part.name))) plan.parked.push({ name: part.name, ...(installation ? { installation } : {}), reason: 'component_off' });
    else if (installation && capabilityParts.has(part.name) && !selectedPart.has(part.name)) plan.parked.push({ name: part.name, installation, reason: 'component_off' });
    else plan.load.push(part);
  }
  return plan;
}
