/**
 * THE LAUNCH PROGRESSION (owner, 26 Nov 2026; KAN-894) — the harness and model service a launch gets
 * when nothing names one: an Agent with no default set, and Irasshai always. Each step is a harness,
 * a model service and a model; the first step that works is the launch.
 *
 * | Step        | Harness                               | Model service   | Model                              |
 * |-------------|---------------------------------------|-----------------|------------------------------------|
 * | cli         | the default's, else first signed in   | its own sign-in | CLI default                        |
 * | gateway     | Codex, else Hermes                    | Ronin Gateway   | `default` (the office's tier)      |
 * | private_api | Codex, else Hermes                    | a private API   | the first option the harness shows |
 * | openrouter  | Codex, else Hermes                    | OpenRouter      | the first option the harness shows |
 *
 * An Agent walks cli, gateway, private_api, openrouter. Irasshai walks gateway, private_api,
 * openrouter, cli. A service step needs an installed harness that works with the service and shows
 * it (the harness's own New Agent picks are respected). Working is signed in, key present, or the
 * Gateway answering on its port: no test call. The progression writes nothing.
 */
import { createConnection } from 'node:net';
import { readMachineSettingsSection } from './machine-settings.js';
import { readAgentsSection } from './machine-state.js';
import { modelServices, type ModelService } from './model-services.js';
import { NATIVE_MODEL, harnessRows, type HarnessRow, type HarnessRows } from './harness-catalog.js';
import { readHarnessSummary } from './harness-summary.js';

export type Step = 'cli' | 'gateway' | 'private_api' | 'openrouter';
export const AGENT_ORDER: readonly Step[] = ['cli', 'gateway', 'private_api', 'openrouter'];
export const IRASSHAI_ORDER: readonly Step[] = ['gateway', 'private_api', 'openrouter', 'cli'];
/** The harnesses a service step tries, in order (owner: Codex first, then Hermes). */
export const SERVICE_HARNESSES: readonly string[] = ['codex', 'hermes'];
export interface Route { provider: string; model: string }

/** A harness's New Agent picks per group: absent or null is the whole list, [] hides the group. */
type Picks = Record<string, Record<string, string[] | null>>;

function reachable(endpoint: string): Promise<boolean> {
  const url = new URL(endpoint);
  return new Promise(resolve => {
    const socket = createConnection(Number(url.port || (url.protocol === 'https:' ? 443 : 80)), url.hostname);
    const finish = (available: boolean) => { socket.destroy(); resolve(available); };
    socket.setTimeout(1500, () => finish(false));
    socket.once('error', () => finish(false));
    socket.once('connect', () => finish(true));
  });
}

const shown = (picks: Picks, row: HarnessRow): boolean => {
  const picked = picks[row.cli]?.[row.service_id || 'in-harness'];
  return !Array.isArray(picked) || picked.includes(row.model);
};

async function serviceRoute(type: ModelService['service_type'], services: ModelService[], harnesses: HarnessRows[], picks: Picks): Promise<Route | null> {
  for (const service of services) {
    if (service.service_type !== type || !service.configured) continue;
    if (type === 'gateway' && !await reachable(service.baseUrl)) continue;
    for (const cli of SERVICE_HARNESSES) {
      const choices = (harnesses.find(entry => entry.cli === cli)?.models ?? [])
        .filter(row => row.service_id === service.id && row.selectable && shown(picks, row));
      if (!choices.length) continue;
      // The Gateway's `default` is the office's tier; elsewhere the first option the harness shows.
      const preferred = type === 'gateway' && service.models.find(option => option.model === 'default');
      const row = (preferred && choices.find(choice => choice.model === preferred.id || choice.model === 'service:' + preferred.id)) || choices[0]!;
      return { provider: row.provider, model: row.model };
    }
  }
  return null;
}

/** The first step of `order` that works, or null when none does. */
export async function firstRoute(order: readonly Step[]): Promise<Route | null> {
  const summary = await readHarnessSummary();
  const [services, harnesses, picks, agents] = await Promise.all([
    modelServices(), harnessRows(summary), readMachineSettingsSection<Picks>('newAgentModels', {}), readAgentsSection(),
  ]);
  const written = ((agents.sessions as { default?: { provider?: string } } | undefined)?.default?.provider ?? '').trim();
  for (const step of order) {
    if (step !== 'cli') {
      const route = await serviceRoute(step, services, harnesses, picks);
      if (route) return route;
      continue;
    }
    // Sign-in order: the first sign-in is the written default (KAN-725); it leads while still signed in.
    const signedIn = harnesses.filter(entry => summary?.signed_in.includes(entry.cli) && summary.operational.includes(entry.cli));
    const entry = signedIn.find(candidate => candidate.provider === written) ?? signedIn[0];
    const row = entry?.models.find(candidate => !candidate.service_id && candidate.model === NATIVE_MODEL);
    if (row) return { provider: row.provider, model: row.model };
  }
  return null;
}
