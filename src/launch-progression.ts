/**
 * THE LAUNCH PROGRESSION (owner, 26 Nov 2026; KAN-894) — the harness and model service a launch gets
 * when nothing names one: an Agent with no default set, and Irasshai always. Each step is a harness,
 * a model service and a model; the first step that works is the launch.
 *
 * | Step        | Harness                               | Model service   | Model                              |
 * |-------------|---------------------------------------|-----------------|------------------------------------|
 * | cli         | the default's, else first signed in   | its own sign-in | CLI default                        |
 * | gateway     | Codex, else Hermes                    | Ronin Gateway   | `default` (the office's tier)      |
 * | private_api | Codex, else Hermes                    | a private API   | the service's first model option   |
 * | openrouter  | Codex, else Hermes                    | OpenRouter      | the service's first model option   |
 *
 * An Agent walks cli, gateway, private_api, openrouter. Irasshai walks gateway, private_api,
 * openrouter, cli. A service step needs an installed harness that works with the service. Working is
 * signed in, key present, or the Gateway answering on its port: no test call. The progression writes
 * nothing.
 *
 * This is routing policy and it is the whole of it. What a harness shows in New Agent
 * (`newAgentModels`) is form display only and is never read here: hiding a service to tidy the form
 * must not change which credential Irasshai or a no-default launch uses (owner, 26 Nov 2026).
 */
import { createConnection } from 'node:net';
import { readAgentsSection } from './machine-state.js';
import { modelServices, type ModelService } from './model-services.js';
import { NATIVE_MODEL, harnessRows, type HarnessRows } from './harness-catalog.js';
import { readHarnessSummary } from './harness-summary.js';

export type Step = 'cli' | 'gateway' | 'private_api' | 'openrouter';
export const AGENT_ORDER: readonly Step[] = ['cli', 'gateway', 'private_api', 'openrouter'];
export const IRASSHAI_ORDER: readonly Step[] = ['gateway', 'private_api', 'openrouter', 'cli'];
/** The harnesses a service step tries, in order (owner: Codex first, then Hermes). */
export const SERVICE_HARNESSES: readonly string[] = ['codex', 'hermes'];
export interface Route { provider: string; model: string }

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

async function serviceRoute(type: ModelService['service_type'], services: ModelService[], harnesses: HarnessRows[]): Promise<Route | null> {
  for (const service of services) {
    if (service.service_type !== type || !service.configured) continue;
    if (type === 'gateway' && !await reachable(service.baseUrl)) continue;
    for (const cli of SERVICE_HARNESSES) {
      const choices = (harnesses.find(entry => entry.cli === cli)?.models ?? [])
        .filter(row => row.service_id === service.id && row.selectable);
      if (!choices.length) continue;
      // The Gateway's `default` is the office's tier; elsewhere the service's first model option.
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
  const [services, harnesses, agents] = await Promise.all([modelServices(), harnessRows(summary), readAgentsSection()]);
  const written = ((agents.sessions as { default?: { provider?: string } } | undefined)?.default?.provider ?? '').trim();
  for (const step of order) {
    if (step !== 'cli') {
      const route = await serviceRoute(step, services, harnesses);
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
