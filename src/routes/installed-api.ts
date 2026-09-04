/**
 * WHAT IS ON THIS MACHINE — one answer, read by every surface that says "installed".
 *
 * Three facts kept getting folded into one word, "off" (owner, 2026-09-03):
 *   installed  — the Services parts present in this process (`listServices()`), and
 *                Ronin Cowork itself (its commit or release);
 *   activated  — whether this box holds a Ronin Services entitlement (the activation
 *                record: an email, a confirmation, a token);
 *   switched   — whether a Routine is on for new Agents (the Campaign's map).
 * An install is not a switch. This route says all three, and the Routines page (installs
 * and switches together, owner 2026-09-03), the Templates card and the library door read it.
 */
import type express from 'express';
import { homedir } from 'node:os';
import { isEntitled } from '../activation/flow.js';
import { readState } from '../activation/state.js';
import { initialCampaign } from '../campaigns.js';
import { listRoutines } from '../resource-adapters.js';
import { routineChoices } from '../routines.js';
import { listParkedServices, listServices } from '../sockets.js';
import { discoverParts, partClaims } from '../parts.js';
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
    parked: { name: string; routine: string }[];
    installed: boolean;
    /** The switch and the running copy disagree — the switch takes effect at the next restart. */
    restart_needed: boolean;
    activated: boolean;
    stage: string;
    /** The Campaign's default switch for the Ronin Services Routine. */
    switched_on: boolean;
  };
  /** Every Routine, with the Campaign's default switch — switches, not installs. */
  routines: { name: string; label: string; blurb: string; on: boolean }[];
}

export async function installedAnswer(): Promise<InstalledAnswer> {
  const [state, entitled, campaign, routines] = await Promise.all([readState().catch(() => null), isEntitled().catch(() => false), initialCampaign().catch(() => null), listRoutines()]);
  const map = routineChoices(campaign?.config?.agent_defaults?.routines ?? {});
  const loaded = listServices();
  const parked = listParkedServices();
  const parts = [...new Set([...discoverParts().map((part) => part.name), ...loaded, ...parked.map((part) => part.name)])].sort();
  const claims = partClaims(routines);
  const switchedOn = map.ronin_services === true;
  // The running copy read the switch at start; if the switch moved since, only a restart honours it.
  const restartNeeded = parts.some((part) => claims.get(part) === 'ronin_services' && (switchedOn ? !loaded.includes(part) : loaded.includes(part)));
  return {
    cowork: roninIdentity(),
    services: { parts, loaded, parked, installed: parts.length > 0, activated: entitled, stage: state?.stage ?? 'not_requested', switched_on: switchedOn, restart_needed: restartNeeded },
    routines: routines.map((r) => ({ name: r.name, label: r.label, blurb: r.blurb, on: map[r.name] === true })),
  };
}

/** One sentence on Ronin Services for a door that needs it — accurate to the three facts. */
export async function servicesStatusSentence(): Promise<string> {
  const a = await installedAnswer();
  if (a.services.activated) return 'Ronin Services is activated on this box.';
  if (a.services.installed) return `Ronin Services is installed on this box (${a.services.parts.join(', ')}) but not activated: no entitlement yet. Activate it on the Campaign page → Routines and Installs, on the Ronin Services row: an email and a confirmation.`;
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
