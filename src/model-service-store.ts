/** Ronin-owned Hermes connections and named launch setups. Secrets never enter projections. */
import { readModelCatalog } from './model-catalog.js';
import { appendEgress } from './activation/egress.js';
import { getHouseToken } from './activation/secrets.js';
import { readOfficeRecord } from './office-record.js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'dotenv';
import { readCredential, writeCredential } from './credential-store.js';
import { storeDir, REPO_ROOT } from './resources.js';

/** A connection is a model service (KAN-236): `kind` is an optional fact on the record; absent,
 * `accountKind` derives it. Which harnesses can use it is worked out in src/model-services.ts, never stored. */
export type AccountKind = 'personal_api' | 'ronin_api';
export interface ModelServiceRecord { id: string; name: string; provider: 'openai' | 'mistral' | 'custom'; baseUrl: string; wireApi?: 'chat' | 'responses'; models: string[]; modelNames?: Record<string, string>; modelInfo?: Record<string, { tier?: string; use_for?: string }>; discoveredAt?: string; credentialEnv?: string; starterModelsPending?: true; kind?: AccountKind }
/** `tier` and `use_for` are the Ronin Gateway's own words for its model options; a named option has neither. */
export interface ModelOption { id: string; name: string; connection: string; model: string; reasoning: string; approvals: 'off' | 'prompt'; tier?: string; use_for?: string }

export interface ModelServiceStore { connections: ModelServiceRecord[]; setups: ModelOption[] }
const empty = (): ModelServiceStore => ({ connections: [], setups: [] });
const readStoredModelServices = () => readCredential<ModelServiceStore>('hermes-setups', empty());
export const keyPath = (id: string) => path.join(storeDir('services_secrets'), `hermes-${id}.env`);
const idPattern = /^[a-z0-9-]+$/;
const modelPattern = /^[A-Za-z0-9._:/-]+$/;
export const isOpenRouterService = (baseUrl: string) => baseUrl.replace(/\/$/, '') === 'https://openrouter.ai/api/v1';

/** Invoked under the settings mutation lock. Only new connections opt in; an older
 * office's hand-curated list, including an intentionally empty one, stays its own. */
async function seedOpenRouterModels(state: ModelServiceStore): Promise<boolean> {
  const pending = state.connections.filter(c => c.starterModelsPending && c.discoveredAt && isOpenRouterService(c.baseUrl));
  if (!pending.length) return false;
  const starters = (await readModelCatalog()).openrouter_starters.filter(row => modelPattern.test(row.id) && !row.id.startsWith('-'));
  if (!starters.length) return false; // Pre-publication catalogs can already exist on the office.
  for (const connection of pending) {
    for (const row of starters) {
      const name = row.name || row.id;
      if (!connection.models.includes(row.id)) continue;
      if (state.setups.some(s => s.connection === connection.id && (s.model === row.id || s.name.toLowerCase() === name.toLowerCase()))) continue;
      state.setups.push({ id: randomUUID(), connection: connection.id, name, model: row.id, reasoning: 'default', approvals: 'off' });
    }
    delete connection.starterModelsPending;
  }
  return true;
}
const efforts = ['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'];
function required(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`); return value.trim(); }
let pending: Promise<unknown> = Promise.resolve();
function mutation<T>(fn: () => Promise<T>): Promise<T> { const next = pending.then(fn); pending = next.catch(() => {}); return next; }
/** In an office_unit the connection to its gateway_office holds no key of its own: the house token is on disk once,
 * `house_token` in the office_unit store, written by the office's provisioning and only read here. */
export async function isHouse(baseUrl: string): Promise<boolean> {
  const office = await readOfficeRecord();
  return office.hosting === 'office_unit' && new URL(baseUrl).origin === new URL(office.record.gateway_office).origin;
}
export async function readKey(c: Pick<ModelServiceRecord, 'id' | 'baseUrl'>): Promise<string> {
  if (await isHouse(c.baseUrl)) { const token = await getHouseToken(); return token && !/[\r\n'"\\]/.test(token) ? token : ''; }
  if (!idPattern.test(c.id)) return '';
  try { return parse(await readFile(keyPath(c.id))).OPENAI_API_KEY || ''; } catch { return ''; }
}
/** WHO HEARS A HERMES CHANGE (owner, 25 Nov 2026): every write, whoever made it (a page, Irasshai's tool, her
 *  service, a discovery), is heard here; the routes push it so every Hermes bar reads again. */
const written = new Set<() => void>();
export const onModelServicesWritten = (fn: () => void) => { written.add(fn); };
async function writeModelServiceStore(state: ModelServiceStore): Promise<void> { await writeCredential('hermes-setups', state); for (const fn of written) fn(); }
export async function modelServiceConfigured(): Promise<boolean> { const state = await readModelServiceStore(); for (const c of state.connections) if (await readKey(c)) return true; return false; }
const isGateway = (baseUrl: string) => /^http:\/\/127\.0\.0\.1:\d+(\/|$)/.test(baseUrl);
/** A connection with no saved kind is the house gateway when it points at the local door; a hosted office's seed carries its kind. */
export const accountKind = (c: Pick<ModelServiceRecord, 'kind' | 'baseUrl'>): AccountKind => c.kind ?? (isGateway(c.baseUrl) ? 'ronin_api' : 'personal_api');
/** The Hermes state as the page reads it: each connection with its key's presence and its kind resolved. */
export async function modelServiceStoreAnswer() {
  const state = await readModelServiceStore();
  return { ...state, connections: await Promise.all(state.connections.map(async c => ({ ...c, kind: accountKind(c), configured: !!await readKey(c) }))) };
}
export async function saveModelService(input: Record<string, unknown>): Promise<ModelServiceRecord> {
  return mutation(async () => {
    const state = await readStoredModelServices();
    const existing = state.connections.find(c => c.id === input.id);
    if (input.id && !existing) throw new Error('Connection no longer exists.');
    const provider = input.provider;
    if (provider !== 'openai' && provider !== 'mistral' && provider !== 'custom') throw new Error('Select an API provider.');
    const wireApi = input.wireApi ?? existing?.wireApi;
    if (wireApi !== undefined && wireApi !== 'chat' && wireApi !== 'responses') throw new Error('Select Chat Completions or Responses.');
    const endpoint = required(input.baseUrl, 'Base URL');
    const url = new URL(endpoint);
    const localGateway = url.protocol === 'http:' && url.hostname === '127.0.0.1' && !!url.port && /^http:\/\/127\.0\.0\.1:\d+\//.test(endpoint);
    // In an office on an office_park the house gateway is the record's gateway_office, on the office network; plain
    // HTTP to exactly that origin is allowed, nothing else off HTTPS.
    const hostedGateway = await isHouse(url.href);
    if ((!localGateway && !hostedGateway && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTPS API base URL (or http://127.0.0.1:port/ for a local gateway, or this office\'s own house gateway) without credentials, query or fragment.');
    // The house gateway's key is the office's house_token, read where it lies: a key entered here is not kept.
    const apiKey = !hostedGateway && typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    if (/[\r\n'"\\]/.test(apiKey)) throw new Error('Invalid API key format.');
    if (!existing && !apiKey && !hostedGateway) throw new Error('API key is required.');
    const baseUrl = url.href.replace(/\/$/, '');
    if (existing && existing.baseUrl !== baseUrl && !apiKey && !hostedGateway) throw new Error('Enter a key for the changed endpoint.');
    const id = existing?.id || randomUUID();
    const changed = !existing || existing.baseUrl !== baseUrl || existing.provider !== provider || !!apiKey;
    if (existing?.credentialEnv && !apiKey && !hostedGateway && existing.baseUrl !== baseUrl) throw new Error('Update the endpoint in the credential environment, or enter a key here.');
    const kind = input.kind ?? existing?.kind;
    if (kind !== undefined && kind !== 'personal_api' && kind !== 'ronin_api') throw new Error('Select an account kind.');
    const connection: ModelServiceRecord = { ...(!apiKey && existing?.credentialEnv ? { credentialEnv: existing.credentialEnv } : {}), id, name: required(input.name, 'Connection name'), provider, baseUrl, ...(wireApi ? { wireApi } : {}),
      ...(isOpenRouterService(baseUrl) && (!existing || !isOpenRouterService(existing.baseUrl) || existing.starterModelsPending) ? { starterModelsPending: true as const } : {}),
      models: changed ? [] : existing.models, ...(!changed && existing.modelNames ? { modelNames: existing.modelNames } : {}), ...(!changed && existing.modelInfo ? { modelInfo: existing.modelInfo } : {}), ...(!changed && existing.discoveredAt ? { discoveredAt: existing.discoveredAt } : {}),
      ...(kind ? { kind } : {}) };
    if (apiKey) {
      await mkdir(path.dirname(keyPath(id)), { recursive: true });
      const tmp = `${keyPath(id)}.tmp`;
      await writeFile(tmp, `OPENAI_API_KEY='${apiKey}'\nOPENAI_BASE_URL='${baseUrl}'\n`, { mode: 0o600 });
      await rename(tmp, keyPath(id));
    }
    // A connection that was keyed and now points at the house gateway keeps no copy of any key.
    if (hostedGateway) await rm(keyPath(id), { force: true });
    state.connections = [...state.connections.filter(c => c.id !== id), connection];
    await writeModelServiceStore(state);
    return connection;
  });
}
export async function discoverModelIds(id: string): Promise<string[]> {
  return mutation(async () => {
    const state = await readStoredModelServices(); const c = state.connections.find(c => c.id === id);
    if (!c) throw new Error('Connection no longer exists.');
    const key = await readKey(c); if (!key) throw new Error('API key missing.');
    let response: Response;
    const listPath = isOpenRouterService(c.baseUrl) ? '/models/user' : '/models';
    const started = Date.now();
    const record = (status: number) => appendEgress({ at: new Date().toISOString(), host: new URL(c.baseUrl).host, path: new URL(c.baseUrl).pathname + listPath, method: 'GET', status, outcome: status >= 200 && status < 300 ? 'ok' : 'failed', ms: Date.now() - started }).catch(() => {});
    try { response = await fetch(c.baseUrl + listPath, { headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { await record(0); throw new Error('Could not reach this API connection.'); }
    await record(response.status);
    if (!response.ok) throw new Error(`Model discovery failed (HTTP ${response.status}).`);
    const body = await response.json().catch(() => { throw new Error('API returned an unreadable model list.'); }) as { data?: { id?: unknown; name?: unknown; tier?: unknown; use_for?: unknown }[] };
    if (!Array.isArray(body.data)) throw new Error('API did not return an OpenAI-compatible model list.');
    c.modelNames = Object.fromEntries(body.data.flatMap(row => typeof row?.id === 'string' && typeof row.name === 'string' && row.name.trim() ? [[row.id, row.name.trim()]] : []));
    // The Gateway says each model's tier and "use it for" line beside its name (KAN-895); null or absent is none.
    const words = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    if (accountKind(c) === 'ronin_api') c.modelInfo = Object.fromEntries(body.data.flatMap(row => {
      const tier = words(row?.tier)?.toLowerCase(), use_for = words(row?.use_for);
      return typeof row?.id === 'string' && (tier || use_for) ? [[row.id, { ...(tier ? { tier } : {}), ...(use_for ? { use_for } : {}) }]] : [];
    }));
    c.models = [...new Set(body.data.flatMap(row => row && typeof row.id === 'string' && modelPattern.test(row.id) ? [row.id] : []))];
    if (accountKind(c) !== 'ronin_api') c.models.sort();
    c.discoveredAt = new Date().toISOString();
    await seedOpenRouterModels(state);
    await writeModelServiceStore(state); return c.models;
  });
}
/** The Ronin Gateway's model list, read at start-up and on Refresh (its model options are that list,
 *  withGatewayOptions). A failed read keeps the last list: the next start or Refresh tries again. */
export async function readGatewayModels(): Promise<void> {
  const { connections } = await readModelServiceStore();
  for (const c of connections) if (accountKind(c) === 'ronin_api') await discoverModelIds(c.id).catch(() => {});
}
export async function saveModelOption(input: Record<string, unknown>): Promise<ModelOption> {
  return mutation(async () => {
    const state = await readStoredModelServices(); const c = state.connections.find(c => c.id === input.connection);
    if (!c) throw new Error('Select an API connection.');
    if (accountKind(c) === 'ronin_api') throw new Error('Ronin Gateway supplies its own model list.');
    const model = required(input.model, 'Model');
    if (!modelPattern.test(model) || model.startsWith('-')) throw new Error('Invalid API model ID.');
    const reasoning = required(input.reasoning, 'Reasoning');
    if (!efforts.includes(reasoning)) throw new Error('Unsupported reasoning setting.');
    if (c.provider !== 'openai' && c.wireApi !== 'responses' && reasoning !== 'default') throw new Error('Use provider default reasoning for this connection.');
    if (input.approvals !== 'off' && input.approvals !== 'prompt') throw new Error('Select an approval mode.');
    if (input.id && !state.setups.some(s => s.id === input.id)) throw new Error('Setup no longer exists.');
    const name = required(input.name, 'Setup name');
    if (state.setups.some(s => s.id !== input.id && s.connection === c.id && s.name.toLowerCase() === name.toLowerCase())) throw new Error('Setup names must be unique.');
    const setup: ModelOption = { id: typeof input.id === 'string' ? input.id : randomUUID(), name, connection: c.id, model, reasoning, approvals: input.approvals };
    state.setups = [...state.setups.filter(s => s.id !== setup.id), setup]; await writeModelServiceStore(state); return setup;
  });
}
export async function deleteModelServiceEntry(kind: 'connections' | 'setups', id: string) {
  return mutation(async () => {
    const state = await readStoredModelServices();
    if (kind === 'connections' && state.setups.some(s => s.connection === id)) throw new Error('Remove the setups using this connection first.');
    // Keep the private credential file for already-running profiles. Removing a setup does not revoke their key.
    if (kind === 'connections') {
      const source = state.connections.find(row => row.id === id)?.credentialEnv;
      if (source) throw new Error(`Remove ${source} from the environment to disconnect this API.`);
      state.connections = state.connections.filter(row => row.id !== id);
    }
    else state.setups = state.setups.filter(row => row.id !== id);
    await writeModelServiceStore(state);
  });
}
const environmentProviders: Record<string, { name: string; provider: ModelServiceRecord['provider']; baseUrl: string }> = {
  OPENAI: { name: 'OpenAI API', provider: 'openai', baseUrl: 'https://api.openai.com/v1' },
  MISTRAL: { name: 'Mistral API', provider: 'mistral', baseUrl: 'https://api.mistral.ai/v1' },
};
/** Pure discovery: known compatible APIs, or NAME_API_KEY paired with NAME_BASE_URL. */
export function environmentConnections(env: NodeJS.ProcessEnv) {
  return Object.entries(env).flatMap(([credentialEnv, value]) => {
    const match = /^([A-Z][A-Z0-9_]*)_API_KEY$/.exec(credentialEnv);
    const apiKey = value?.trim();
    if (!match || !apiKey || /[\r\n'"\\]/.test(apiKey)) return [];
    const prefix = match[1]; const known = environmentProviders[prefix];
    const baseUrl = (env[`${prefix}_BASE_URL`] || known?.baseUrl || '').replace(/\/$/, '');
    let url: URL;
    try { url = new URL(baseUrl); } catch { return []; }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return [];
    return [{ credentialEnv, apiKey, baseUrl, name: known?.name || `${prefix} API`, provider: known?.provider || 'custom' as const }];
  });
}
async function credentialEnvironment(): Promise<NodeJS.ProcessEnv> {
  const readEnv = async (file: string) => { try { return parse(await readFile(file)); } catch { return {}; } };
  const native = await readEnv(path.join(process.env.HERMES_HOME || path.join(os.homedir(), '.hermes'), '.env'));
  const app = await readEnv(process.env.DOTENV_CONFIG_PATH || path.join(REPO_ROOT, '.env'));
  return { ...native, ...process.env, ...app };
}
/** THE RONIN GATEWAY'S MODEL OPTIONS ARE ITS OWN LIST (owner, 25 Nov 2026): one per model the office gateway
 *  last listed, with its supplied display name and model ID; id `<connection>/<model>`. Saved setups are the ones
 *  people name, on an API key or OpenRouter. */
function withGatewayOptions(state: ModelServiceStore): ModelServiceStore {
  const gateway = state.connections.filter(c => accountKind(c) === 'ronin_api');
  return { ...state, setups: [
    ...gateway.flatMap(c => c.models.map(model => ({ id: `${c.id}/${model}`, name: Object.hasOwn(c.modelNames || {}, model) ? c.modelNames![model]! : model, connection: c.id, model, reasoning: 'default', approvals: 'off' as const, ...(Object.hasOwn(c.modelInfo || {}, model) ? c.modelInfo![model] : {}) }))),
    ...state.setups.filter(s => !gateway.some(c => c.id === s.connection)),
  ] };
}
/** Reconcile references to existing credentials. API access is only checked by model discovery. */
export function readModelServiceStore(environment?: NodeJS.ProcessEnv): Promise<ModelServiceStore> {
  return mutation(async () => {
    const state = await readStoredModelServices(); let changed = false;
    const office = await readOfficeRecord();
    if (office.hosting === 'office_unit' && !state.connections.some(c => accountKind(c) === 'ronin_api') && await getHouseToken()) {
      state.connections.push({ id: randomUUID(), kind: 'ronin_api', name: 'Ronin Gateway', provider: 'custom',
        baseUrl: office.record.gateway_office.replace(/\/$/, '') + '/v1', wireApi: 'responses', models: [] });
      changed = true;
    }
    const discovered = environmentConnections(environment || await credentialEnvironment());
    for (const found of discovered) {
      let c = state.connections.find(c => c.credentialEnv === found.credentialEnv);
      // An explicitly managed connection wins over automatic discovery of the same endpoint.
      if (!c && state.connections.some(c => !c.credentialEnv && c.baseUrl === found.baseUrl)) continue;
      if (!c) {
        c = { id: randomUUID(), name: found.name, provider: found.provider, baseUrl: found.baseUrl, models: [], credentialEnv: found.credentialEnv, ...(isOpenRouterService(found.baseUrl) ? { starterModelsPending: true } : {}) };
        state.connections.push(c); changed = true;
      }
      if (c.baseUrl !== found.baseUrl) { c.baseUrl = found.baseUrl; c.models = []; delete c.discoveredAt; delete c.modelNames; delete c.modelInfo; changed = true; }
      const content = `OPENAI_API_KEY='${found.apiKey}'\nOPENAI_BASE_URL='${found.baseUrl}'\n`;
      const previous = await readFile(keyPath(c.id), 'utf8').catch(() => '');
      if (previous !== content) {
        await mkdir(path.dirname(keyPath(c.id)), { recursive: true });
        const tmp = `${keyPath(c.id)}.tmp`;
        await writeFile(tmp, content, { mode: 0o600 }); await rename(tmp, keyPath(c.id));
      }
    }
    for (const c of state.connections) {
      if (c.credentialEnv && !discovered.some(found => found.credentialEnv === c.credentialEnv)) await rm(keyPath(c.id), { force: true });
    }
    if (await seedOpenRouterModels(state) || changed) await writeModelServiceStore(state);
    return withGatewayOptions(state);
  });
}
/** Fresh home per birth; immutable settings snapshot. A personal key is a shared credential link, for rotation on
 * restart; the house connection's .env is written here from the office_unit's house_token, never stored as a copy.
 * On the house connection every call also carries `X-Ronin-Person: <email>`, the person the Agent works for (its birth
 * receipt's user_email), so HQ can book the spend (KAN-621). A self-declared label: it sits in a file the Agent can edit.
 * No person, no header; a personal key's calls never carry it. */
export const PERSON_HEADER = 'X-Ronin-Person';
export async function prepareHermesHome(setupId: string, home: string, person?: string) {
  const state = await readModelServiceStore(); const setup = state.setups.find(s => s.id === setupId);
  const connection = state.connections.find(c => c.id === setup?.connection);
  const key = connection ? await readKey(connection) : '';
  if (!setup || !connection || !key) throw new Error('Hermes setup or API credential is unavailable.');
  await mkdir(home, { recursive: true, mode: 0o700 });
  // Remove inherited links themselves, never write through them into the default home.
  for (const file of ['config.yaml', '.env', 'ronin-setup.json']) await rm(path.join(home, file), { force: true });
  // Hermes ignores a bare custom model.api_mode=codex_responses on proxy URLs.
  // A named custom provider is its supported explicit transport contract.
  const apiMode = connection.wireApi === 'responses' ? 'codex_responses' : 'chat_completions';
  const house = await isHouse(connection.baseUrl);
  const label = house && person?.trim() ? { extra_headers: { [PERSON_HEADER]: person.trim().toLowerCase() } } : {};
  const config = { model: { provider: connection.wireApi ? 'custom:ronin' : connection.provider === 'openai' ? 'openai' : 'custom', default: setup.model, base_url: connection.baseUrl, ...(connection.wireApi ? { api_mode: apiMode } : {}) },
    ...(connection.wireApi ? { providers: { ronin: { name: 'ronin', base_url: connection.baseUrl, key_env: 'OPENAI_API_KEY', api_mode: apiMode, ...label } } } : {}),
    agent: setup.reasoning === 'default' ? {} : { reasoning_effort: setup.reasoning }, approvals: { mode: setup.approvals === 'off' ? 'off' : 'manual' },
    telemetry: { enabled: false } };
  await writeFile(path.join(home, 'config.yaml'), JSON.stringify(config, null, 2), { mode: 0o600 });
  await writeFile(path.join(home, 'ronin-setup.json'), JSON.stringify({ setup, connection: { id: connection.id, name: connection.name, provider: connection.provider, baseUrl: connection.baseUrl, wireApi: connection.wireApi } }, null, 2), { mode: 0o600 });
  if (house) await writeFile(path.join(home, '.env'), `OPENAI_API_KEY='${key}'\nOPENAI_BASE_URL='${connection.baseUrl}'\n`, { mode: 0o600 });
  else await symlink(keyPath(connection.id), path.join(home, '.env'));
  return { HERMES_HOME: home };
}
