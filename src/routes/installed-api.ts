/**
 * WHAT IS ON THIS MACHINE — one answer, read by every surface that says "installed".
 *
 * Two facts kept getting folded into one word, "off" (owner, 2026-09-03):
 *   installed  — the Services parts present in this process (`listServices()`), and
 *                Ronin Cowork itself (its commit or release);
 *   switched   — whether a Routine is on for new Agents (the Campaign's map).
 * An install is not a switch. Installed is the gate (owner, 2026-09-19): Ronin Services
 * cannot be installed without a registration, so no surface asks a second question about
 * whether this box is entitled. This route says both, and the Routines page (installs and
 * switches together, owner 2026-09-03), the Templates card and the library door read it.
 */
import type express from 'express';
import { homedir } from 'node:os';
import { readState } from '../activation/state.js';
import { initialCampaign } from '../campaigns.js';
import { listInstallations } from '../resource-adapters.js';
import { switches } from '../instruction-cascade.js';
import { listParkedServices, listServiceCapabilities, listServiceFailures, listServices } from '../sockets.js';
import { discoverParts } from '../parts.js';
import { roninIdentity } from './version.js';

const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');

export interface InstalledAnswer {
  cowork: { release: string | null; commit: string; dirty: boolean | null; startedAt: string };
  services: {
    /** Parts on this machine — on disk, whether or not they run: koshi, koe, michi, gbrain, counting, machine, rireki … */
    parts: string[];
    /** Parts this server loaded and runs. */
    loaded: string[];
    /** Parts on disk this server did not load: the Routine that claims them was off at start. */
    parked: { name: string; routine?: string; reason?: string }[];
    installed: boolean;
    /** The switch and the running copy disagree — the switch takes effect at the next restart. */
    restart_needed: boolean;
    stage: string;
    /** The Campaign's default switch for the Ronin Services Routine. */
    switched_on: boolean;
    desired: Record<string, boolean>;
    capabilities: { desired: Record<string, boolean>; running: string[]; disagrees: string[]; parked: { name: string; reason: string }[] };
  };
  /** Every Routine, with the Campaign's default switch — switches, not installs. */
  installations: { name: string; label: string; blurb: string; on: boolean; available: boolean; requires: string[] }[];
}

export async function installedAnswer(): Promise<InstalledAnswer> {
  const [state, campaign, installations] = await Promise.all([readState().catch(() => null), initialCampaign().catch(() => null), listInstallations()]);
  const map = switches(campaign?.config?.installations ?? {});
  const loaded = listServices();
  const parkedByName = new Map(listParkedServices().map((part) => [part.name, part]));
  for (const failure of listServiceFailures()) parkedByName.set(failure.name, failure);
  const parked = [...parkedByName.values()];
  const parts = [...new Set([...discoverParts().map((part) => part.name), ...loaded, ...parked.map((part) => part.name)])].sort();
  const switchedOn = map.ronin_services === true;
  const desired = campaign?.config?.services?.parts ?? {};
  const runtime = listServiceCapabilities();
  const runningCapabilities = new Set(runtime.running);
  const partialCapabilities = new Set(runtime.partial);
  const permanentlyParked = new Set(runtime.parked.map((capability) => capability.name));
  const disagrees = runtime.known.filter((name) => desired[name] === true
    ? !runningCapabilities.has(name)
    : runningCapabilities.has(name) || partialCapabilities.has(name));
  const capabilities = { desired, running: runtime.running, disagrees, parked: runtime.parked };
  const restartNeeded = runtime.known.some((name) => !permanentlyParked.has(name) && (switchedOn
    ? disagrees.includes(name)
    : runningCapabilities.has(name) || partialCapabilities.has(name)));
  return {
    cowork: roninIdentity(),
    services: { parts, loaded, parked, desired, capabilities, installed: parts.length > 0, stage: state?.stage ?? 'not_requested', switched_on: switchedOn, restart_needed: restartNeeded },
    installations: installations.map((r) => ({ name: r.name, label: r.label, blurb: r.blurb, on: map[r.name] === true, available: r.requires.every((name) => map[name] === true), requires: r.requires })),
  };
}

/** One sentence on Ronin Services for a door that needs it — accurate to the three facts. */
export async function servicesStatusSentence(): Promise<string> {
  const a = await installedAnswer();
  if (a.services.installed) return `Ronin Services is installed on this box (${a.services.parts.join(', ')}).`;
  return 'Ronin Services is not installed on this box. The Campaign page → Routines and Installs, on the Ronin Services row, is where it starts: an email and a confirmation.';
}

export function registerInstalled(app: express.Express): void {
  app.get('/api/installed', async (_req, res) => {
    try {
      res.json(await installedAnswer());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });
}
