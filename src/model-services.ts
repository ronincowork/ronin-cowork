/**
 * MODEL SERVICES — the one reading of the model service store (src/model-service-store.ts) that the
 * pages, the harness catalog and a launch take: each service with its type, the harnesses that can
 * use it, the model IDs it listed and its model options. Credential-free.
 */
import { readOfficeRecord } from './office-record.js';
import { accountKind, deleteModelServiceEntry, discoverModelIds, isOpenRouterService, modelServiceStoreAnswer, saveModelService, type ModelServiceRecord } from './model-service-store.js';

/** The Ronin Gateway's office door on a developer's own box (ronin-services/model_gateway side by side). */
export const RONIN_GATEWAY_BASE_URL = 'http://127.0.0.1:4912/v1';
/** Where this Ronin's Gateway calls go: the office record's gateway_office when it is an office on an
 * office_park, the local door when self-hosted. A record that will not read is a fault, thrown, never
 * a fallback: the reader contract has no third hosting state. */
export async function roninGatewayBaseUrl(): Promise<string> {
  const office = await readOfficeRecord();
  if (office.hosting === 'unreadable') throw new Error(`office record unreadable: ${office.error}`);
  return office.hosting === 'office_unit' ? `${office.record.gateway_office}/v1` : RONIN_GATEWAY_BASE_URL;
}
/** The id of the Ronin Gateway shown before one is saved. */
export const RONIN_GATEWAY_SEED_ID = 'ronin_api';

/** WHICH HARNESSES CAN USE A MODEL SERVICE (owner, 26 Nov 2026; KAN-896): a technical fact the
 * service reports, never a choice kept on it. A harness is here when Ronin has a launch adapter for
 * it (src/model-service-launch.ts), with the API protocols that adapter speaks. Claude Code has none,
 * so it uses no model service. Which services and model options a harness shows in New Agent is that
 * harness's own setting (`newAgentModels`). */
const SPEAKS: Record<string, ReadonlyArray<'chat' | 'responses'>> = { hermes: ['chat', 'responses'], codex: ['responses'], opencode: ['chat'] };
export const worksWith = (wire: 'chat' | 'responses'): string[] => Object.keys(SPEAKS).filter(harness => SPEAKS[harness]!.includes(wire));
/** The service types a harness can use: the Ronin Gateway speaks Responses, OpenRouter chat, an API key either. */
export const serviceTypesFor = (harness: string): Array<'gateway' | 'private_api' | 'openrouter'> => {
  const speaks = SPEAKS[harness] ?? [];
  return [...(speaks.includes('responses') ? ['gateway' as const] : []), ...(speaks.length ? ['private_api' as const] : []), ...(speaks.includes('chat') ? ['openrouter' as const] : [])];
};

const project = (c: ModelServiceRecord & { configured: boolean }) => {
  const wire: 'chat' | 'responses' = c.wireApi ?? (c.provider === 'openai' ? 'responses' : 'chat');
  return {
    id: c.id, kind: accountKind(c), name: c.name, provider: c.provider, baseUrl: c.baseUrl, wire, configured: c.configured,
    seeded: false, fault: undefined as string | undefined,
    ...(c.credentialEnv ? { credentialEnv: c.credentialEnv } : {}), bound: worksWith(wire), discovered: c.models,
    ...(c.discoveredAt ? { discoveredAt: c.discoveredAt } : {}),
  };
};

/** Every model service, one record each; the Ronin Gateway is seeded, not configured, until one is
 * saved ("disabled, never hidden"). */
export async function modelServices() {
  const state = await modelServiceStoreAnswer();
  const services = state.connections.map(project);
  if (!services.some(service => service.kind === 'ronin_api')) {
    // An unreadable office record is said on the seed, not papered over with the local door.
    let baseUrl = '', fault: string | undefined;
    try { baseUrl = await roninGatewayBaseUrl(); } catch (e) { fault = (e as Error).message; }
    services.push({ id: RONIN_GATEWAY_SEED_ID, kind: 'ronin_api', name: 'Ronin Gateway', provider: 'custom', baseUrl, wire: 'responses',
      configured: false, seeded: true, fault, bound: worksWith('responses'), discovered: [] });
  }
  return services.map(service => ({
    ...service,
    name: service.kind === 'ronin_api' ? 'Ronin Gateway' : service.name,
    service_type: service.kind === 'ronin_api' ? 'gateway' as const : isOpenRouterService(service.baseUrl) ? 'openrouter' as const : 'private_api' as const,
    discoveredNames: state.connections.find(c => c.id === service.id)?.modelNames || {},
    /** Ronin Gateway only: why it can't be used, as its last list read found it; absent is ready (w1028). */
    ...(state.connections.find(c => c.id === service.id)?.gatewayStatus ? { status: state.connections.find(c => c.id === service.id)!.gatewayStatus } : {}),
    models: state.setups.filter(entry => entry.connection === service.id)
      .map(({ id, model, name, reasoning, approvals, tier, use_for }) => ({ id, model, name, reasoning, approvals, ...(tier ? { tier } : {}), ...(use_for ? { use_for } : {}) })),
  }));
}
export type ModelService = Awaited<ReturnType<typeof modelServices>>[number];

/** Save a model service: a private API or OpenRouter key, or the Ronin Gateway (custom, Responses protocol). */
export async function saveService(input: Record<string, unknown>) {
  const kind = input.kind === 'ronin_api' ? 'ronin_api' : 'personal_api';
  const id = input.id === RONIN_GATEWAY_SEED_ID ? undefined : input.id;
  if (kind === 'ronin_api') {
    return saveModelService({ id, kind, name: typeof input.name === 'string' && input.name.trim() ? input.name : 'Ronin Gateway', provider: 'custom', wireApi: 'responses',
      // The same office-aware default the seed shows; an unreadable record refuses the save with its reason.
      baseUrl: typeof input.baseUrl === 'string' && input.baseUrl.trim() ? input.baseUrl : await roninGatewayBaseUrl(), apiKey: input.apiKey ?? input.token });
  }
  const saved = await saveModelService({ ...input, id, kind });
  // The key is already saved. If discovery is offline the owner can retry via Discover.
  if (saved.starterModelsPending) await discoverModelIds(saved.id).catch(() => {});
  return saved;
}
export const deleteService = (id: string) => deleteModelServiceEntry('connections', id);
export const deleteModelOption = (id: string) => deleteModelServiceEntry('setups', id);
