/** Ronin-owned Hermes connections and named launch setups. Secrets never enter projections. */
import { appendEgress } from './activation/egress.js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'dotenv';
import { readCredential, writeCredential } from './credential-store.js';
import { storeDir, REPO_ROOT } from './resources.js';

export interface HermesConnection { id: string; name: string; provider: 'openai' | 'mistral' | 'custom'; baseUrl: string; models: string[]; discoveredAt?: string; credentialEnv?: string }
export interface HermesSetup { id: string; name: string; connection: string; model: string; reasoning: string; approvals: 'off' | 'prompt' }
export interface HermesSettings { connections: HermesConnection[]; setups: HermesSetup[] }
const empty = (): HermesSettings => ({ connections: [], setups: [] });
const readStoredSettings = () => readCredential<HermesSettings>('hermes-setups', empty());
const keyPath = (id: string) => path.join(storeDir('services_secrets'), `hermes-${id}.env`);
const idPattern = /^[a-z0-9-]+$/;
const modelPattern = /^[A-Za-z0-9._:/-]+$/;
const efforts = ['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'];
function required(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`); return value.trim(); }
let pending: Promise<unknown> = Promise.resolve();
function mutation<T>(fn: () => Promise<T>): Promise<T> { const next = pending.then(fn); pending = next.catch(() => {}); return next; }
async function readKey(id: string): Promise<string> { if (!idPattern.test(id)) return ''; try { return parse(await readFile(keyPath(id))).OPENAI_API_KEY || ''; } catch { return ''; } }
export async function hermesConfigured(): Promise<boolean> { const state = await readHermesSettings(); for (const c of state.connections) if (await readKey(c.id)) return true; return false; }
export async function hermesSettingsAnswer() {
  const state = await readHermesSettings();
  return { ...state, connections: await Promise.all(state.connections.map(async c => ({ ...c, configured: !!await readKey(c.id) }))) };
}
export async function saveHermesConnection(input: Record<string, unknown>): Promise<HermesConnection> {
  return mutation(async () => {
    const state = await readStoredSettings();
    const existing = state.connections.find(c => c.id === input.id);
    if (input.id && !existing) throw new Error('Connection no longer exists.');
    const provider = input.provider;
    if (provider !== 'openai' && provider !== 'mistral' && provider !== 'custom') throw new Error('Select an API provider.');
    const url = new URL(required(input.baseUrl, 'Base URL'));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTPS API base URL without credentials, query or fragment.');
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    if (/[\r\n'"\\]/.test(apiKey)) throw new Error('Invalid API key format.');
    if (!existing && !apiKey) throw new Error('API key is required.');
    const baseUrl = url.href.replace(/\/$/, '');
    if (existing && existing.baseUrl !== baseUrl && !apiKey) throw new Error('Enter a key for the changed endpoint.');
    const id = existing?.id || randomUUID();
    const changed = !existing || existing.baseUrl !== baseUrl || existing.provider !== provider || !!apiKey;
    if (existing?.credentialEnv && !apiKey && existing.baseUrl !== baseUrl) throw new Error('Update the endpoint in the credential environment, or enter a key here.');
    const connection: HermesConnection = { ...(!apiKey && existing?.credentialEnv ? { credentialEnv: existing.credentialEnv } : {}), id, name: required(input.name, 'Connection name'), provider, baseUrl,
      models: changed ? [] : existing.models, ...(!changed && existing.discoveredAt ? { discoveredAt: existing.discoveredAt } : {}) };
    if (apiKey) {
      await mkdir(path.dirname(keyPath(id)), { recursive: true });
      const tmp = `${keyPath(id)}.tmp`;
      await writeFile(tmp, `OPENAI_API_KEY='${apiKey}'\nOPENAI_BASE_URL='${baseUrl}'\n`, { mode: 0o600 });
      await rename(tmp, keyPath(id));
    }
    state.connections = [...state.connections.filter(c => c.id !== id), connection];
    await writeCredential('hermes-setups', state);
    return connection;
  });
}
export async function discoverHermesModels(id: string): Promise<string[]> {
  return mutation(async () => {
    const state = await readStoredSettings(); const c = state.connections.find(c => c.id === id);
    if (!c) throw new Error('Connection no longer exists.');
    const key = await readKey(c.id); if (!key) throw new Error('API key missing.');
    let response: Response;
    const started = Date.now();
    const record = (status: number) => appendEgress({ at: new Date().toISOString(), host: new URL(c.baseUrl).host, path: new URL(c.baseUrl).pathname + '/models', method: 'GET', status, outcome: status >= 200 && status < 300 ? 'ok' : 'failed', ms: Date.now() - started }).catch(() => {});
    try { response = await fetch(`${c.baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { await record(0); throw new Error('Could not reach this API connection.'); }
    await record(response.status);
    if (!response.ok) throw new Error(`Model discovery failed (HTTP ${response.status}).`);
    const body = await response.json().catch(() => { throw new Error('API returned an unreadable model list.'); }) as { data?: { id?: unknown }[] };
    if (!Array.isArray(body.data)) throw new Error('API did not return an OpenAI-compatible model list.');
    c.models = [...new Set(body.data.flatMap(row => row && typeof row.id === 'string' && modelPattern.test(row.id) ? [row.id] : []))].sort();
    c.discoveredAt = new Date().toISOString(); await writeCredential('hermes-setups', state); return c.models;
  });
}
export async function saveHermesSetup(input: Record<string, unknown>): Promise<HermesSetup> {
  return mutation(async () => {
    const state = await readStoredSettings(); const c = state.connections.find(c => c.id === input.connection);
    if (!c) throw new Error('Select an API connection.');
    const model = required(input.model, 'Model');
    if (!c.models.includes(model)) throw new Error('Select a model discovered from this connection.');
    const reasoning = required(input.reasoning, 'Reasoning');
    if (!efforts.includes(reasoning)) throw new Error('Unsupported reasoning setting.');
    if (c.provider !== 'openai' && reasoning !== 'default') throw new Error('Use provider default reasoning for this connection.');
    if (input.approvals !== 'off' && input.approvals !== 'prompt') throw new Error('Select an approval mode.');
    if (input.id && !state.setups.some(s => s.id === input.id)) throw new Error('Setup no longer exists.');
    const name = required(input.name, 'Setup name');
    if (state.setups.some(s => s.id !== input.id && s.name.toLowerCase() === name.toLowerCase())) throw new Error('Setup names must be unique.');
    const setup: HermesSetup = { id: typeof input.id === 'string' ? input.id : randomUUID(), name, connection: c.id, model, reasoning, approvals: input.approvals };
    state.setups = [...state.setups.filter(s => s.id !== setup.id), setup]; await writeCredential('hermes-setups', state); return setup;
  });
}
export async function deleteHermesEntry(kind: 'connections' | 'setups', id: string) {
  return mutation(async () => {
    const state = await readStoredSettings();
    if (kind === 'connections' && state.setups.some(s => s.connection === id)) throw new Error('Remove the setups using this connection first.');
    // Keep the private credential file for already-running profiles. Removing a setup does not revoke their key.
    if (kind === 'connections') {
      const source = state.connections.find(row => row.id === id)?.credentialEnv;
      if (source) throw new Error(`Remove ${source} from the environment to disconnect this API.`);
      state.connections = state.connections.filter(row => row.id !== id);
    }
    else state.setups = state.setups.filter(row => row.id !== id);
    await writeCredential('hermes-setups', state);
  });
}
const environmentProviders: Record<string, { name: string; provider: HermesConnection['provider']; baseUrl: string }> = {
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
/** Reconcile references to existing credentials. API access is only checked by model discovery. */
export function readHermesSettings(environment?: NodeJS.ProcessEnv): Promise<HermesSettings> {
  return mutation(async () => {
    const state = await readStoredSettings(); let changed = false;
    const discovered = environmentConnections(environment || await credentialEnvironment());
    for (const found of discovered) {
      let c = state.connections.find(c => c.credentialEnv === found.credentialEnv);
      // An explicitly managed connection wins over automatic discovery of the same endpoint.
      if (!c && state.connections.some(c => !c.credentialEnv && c.baseUrl === found.baseUrl)) continue;
      if (!c) {
        c = { id: randomUUID(), name: found.name, provider: found.provider, baseUrl: found.baseUrl, models: [], credentialEnv: found.credentialEnv };
        state.connections.push(c); changed = true;
      }
      if (c.baseUrl !== found.baseUrl) { c.baseUrl = found.baseUrl; c.models = []; delete c.discoveredAt; changed = true; }
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
    if (changed) await writeCredential('hermes-setups', state);
    return state;
  });
}
/** Fresh home per birth; immutable settings snapshot, shared credential link for rotation on restart. */
export async function prepareHermesHome(setupId: string, home: string) {
  const state = await readStoredSettings(); const setup = state.setups.find(s => s.id === setupId);
  const connection = state.connections.find(c => c.id === setup?.connection);
  if (!setup || !connection || !await readKey(connection.id)) throw new Error('Hermes setup or API credential is unavailable.');
  await mkdir(home, { recursive: true, mode: 0o700 });
  // Remove inherited links themselves, never write through them into the default home.
  for (const file of ['config.yaml', '.env', 'ronin-setup.json']) await rm(path.join(home, file), { force: true });
  const config = { model: { provider: connection.provider === 'openai' ? 'openai' : 'custom', default: setup.model, base_url: connection.baseUrl },
    agent: setup.reasoning === 'default' ? {} : { reasoning_effort: setup.reasoning }, approvals: { mode: setup.approvals === 'off' ? 'off' : 'manual' },
    telemetry: { enabled: false } };
  await writeFile(path.join(home, 'config.yaml'), JSON.stringify(config, null, 2), { mode: 0o600 });
  await writeFile(path.join(home, 'ronin-setup.json'), JSON.stringify({ setup, connection: { id: connection.id, name: connection.name, provider: connection.provider, baseUrl: connection.baseUrl } }, null, 2), { mode: 0o600 });
  await symlink(keyPath(connection.id), path.join(home, '.env'));
  return { HERMES_HOME: home };
}
