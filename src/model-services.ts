/**
 * MODEL SERVICES — the one reading of the model service store (src/model-service-store.ts) that the
 * pages, the harness catalog and a launch take: each service with its type, the harnesses that can
 * use it, the model IDs it listed and its model entries. Credential-free.
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

/** WHICH HARNESSES CAN USE A MODEL SERVICE (owner, 27 Nov 2026; docs/architecture/harness-catalog.md, One harness
 * panel): one rule for every outside service. A service speaks request formats; a harness's launch adapter
 * (src/model-service-launch.ts) speaks formats; a harness can use a service wherever they share one, and its
 * launch uses the harness's first shared format. A technical fact, never a choice kept on the service. Which
 * services and model entries a harness shows in New Agent is that harness's own setting (`newAgentModels`). */
export type ServiceFormat = 'responses' | 'chat' | 'anthropic';
type ServiceType = 'gateway' | 'private_api' | 'openrouter';
const HARNESS_FORMATS: Record<string, readonly ServiceFormat[]> = { codex: ['responses'], claude: ['anthropic'], hermes: ['chat', 'responses'], opencode: ['chat'] };
/** What a service speaks: the Ronin Gateway, Responses; OpenRouter, all three (openrouter.ai/docs); an API key,
 *  the one chosen when it was added. */
const formatsOf = (type: ServiceType, wire: 'chat' | 'responses'): ServiceFormat[] =>
  type === 'gateway' ? ['responses'] : type === 'openrouter' ? ['responses', 'chat', 'anthropic'] : [wire];
/** The harnesses a service speaking `formats` serves. */
export const worksWith = (formats: readonly ServiceFormat[]): string[] => Object.keys(HARNESS_FORMATS).filter(harness => HARNESS_FORMATS[harness]!.some(f => formats.includes(f)));
/** The format a launch of `harness` on a service speaking `formats` uses; null when they share none. */
export const launchFormat = (harness: string, formats: readonly ServiceFormat[]): ServiceFormat | null => (HARNESS_FORMATS[harness] ?? []).find(f => formats.includes(f)) ?? null;
/** The service types a harness can use: each type whose formats it shares (an API key can be either Chat or Responses). */
export const serviceTypesFor = (harness: string): ServiceType[] => {
  const speaks = HARNESS_FORMATS[harness] ?? [];
  const can = (formats: ServiceFormat[]) => speaks.some(f => formats.includes(f));
  return [...(can(['responses']) ? ['gateway' as const] : []), ...(can(['chat', 'responses']) ? ['private_api' as const] : []), ...(can(formatsOf('openrouter', 'chat')) ? ['openrouter' as const] : [])];
};

const typeOf = (c: { kind?: string; baseUrl: string }, kind: string): ServiceType => kind === 'ronin_api' ? 'gateway' : isOpenRouterService(c.baseUrl) ? 'openrouter' : 'private_api';
const project = (c: ModelServiceRecord & { configured: boolean }) => {
  const wire: 'chat' | 'responses' = c.wireApi ?? (c.provider === 'openai' ? 'responses' : 'chat');
  const kind = accountKind(c);
  const formats = formatsOf(typeOf(c, kind), wire);
  return {
    id: c.id, kind, name: c.name, provider: c.provider, baseUrl: c.baseUrl, wire, formats, configured: c.configured,
    seeded: false, fault: undefined as string | undefined,
    ...(c.credentialEnv ? { credentialEnv: c.credentialEnv } : {}), bound: worksWith(formats), discovered: c.models,
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
      formats: formatsOf('gateway', 'responses'), configured: false, seeded: true, fault, bound: worksWith(formatsOf('gateway', 'responses')), discovered: [] });
  }
  return services.map(service => ({
    ...service,
    name: service.kind === 'ronin_api' ? 'Ronin Gateway' : service.name,
    service_type: typeOf(service, service.kind),
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
export const deleteModelEntry = (id: string) => deleteModelServiceEntry('setups', id);
