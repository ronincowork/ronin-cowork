/**
 * ACCOUNTS AND PRESETS (KAN-236, the Agent Harness workbench): one reading of the Hermes record as the
 * workbench's account list. There is no second store. A Hermes connection is an account of kind
 * `personal_api` (a vendor key or an OpenAI-compatible endpoint) or `ronin_api` (the house model gateway,
 * Ronin Cloud); a Hermes named setup is a preset of the hermes harness. Native CLI sign-ins are the
 * `subscription` kind and are never stored here: the harness owns them. These are provider accounts for
 * launching Agents, not Ronin Cloud customer or subscription accounts.
 */
import { listProviderCatalog } from './model-providers.js';
import { readOfficeRecord } from './office-record.js';
import { deleteHermesEntry, discoverHermesModels, hermesSettingsAnswer, saveHermesConnection, saveHermesSetup, updateHermesConnectionLists, type AccountKind, type HermesConnection } from './hermes-setups.js';

/** The house gateway's office door on a developer's own box (ronin-services/model_gateway side by side). */
export const RONIN_API_BASE_URL = 'http://127.0.0.1:4912/v1';
/** Where this Ronin's house calls go: the office record's gateway_office when it is an office on an
 * office_park, the local door when self-hosted. A record that will not read is a fault, thrown, never
 * a fallback: the reader contract has no third hosting state. */
export async function roninApiBaseUrl(): Promise<string> {
  const office = await readOfficeRecord();
  if (office.hosting === 'unreadable') throw new Error(`office record unreadable: ${office.error}`);
  return office.hosting === 'office_unit' ? `${office.record.gateway_office}/v1` : RONIN_API_BASE_URL;
}
export const RONIN_API_SEED_ID = 'ronin_api';
/** The Ronin API does not serve Claude Code (owner, 2026-11-03). */
const NOT_ON_RONIN_API = new Set(['claude']);
/** Harnesses with a binding today: the only ones a launch can actually run on an account. */
export const BOUND_HARNESSES = ['hermes'];
/** Which harnesses a vendor's own key serves natively (the plan's provider-section rule, until the catalog carries `harnesses:`). */
const NATIVE_HARNESSES: Record<HermesConnection['provider'], string[]> = { openai: ['hermes', 'codex'], mistral: ['hermes'], custom: ['hermes'] };

export interface Account {
  id: string; kind: AccountKind; name: string; provider: HermesConnection['provider']; baseUrl: string; wire: 'chat' | 'responses';
  configured: boolean; seeded?: boolean; credentialEnv?: string; harnesses: string[]; bound: string[]; models: string[]; offered: string[]; discoveredAt?: string;
  /** The seed only: why no gateway address can be offered (the office record will not read). */
  fault?: string;
}
export interface Preset { id: string; name: string; harness: 'hermes'; account: string; model: string; reasoning: string; approvals: 'off' | 'prompt' }
export interface AccountsAnswer { accounts: Account[]; presets: Preset[]; kinds: AccountKind[] }

const isGateway = (baseUrl: string) => /^http:\/\/127\.0\.0\.1:\d+(\/|$)/.test(baseUrl);
/** A connection with no saved kind is the house gateway when it points at the local door; a hosted office's seed carries its kind. */
export const accountKind = (c: Pick<HermesConnection, 'kind' | 'baseUrl'>): AccountKind => c.kind ?? (isGateway(c.baseUrl) ? 'ronin_api' : 'personal_api');

async function roninApiHarnesses(): Promise<string[]> {
  const clis = (await listProviderCatalog()).flatMap(entry => entry.cli && !NOT_ON_RONIN_API.has(entry.cli) ? [entry.cli] : []);
  return [...new Set(['hermes', ...clis])];
}
async function defaultHarnesses(kind: AccountKind, provider: HermesConnection['provider']): Promise<string[]> {
  return kind === 'ronin_api' ? roninApiHarnesses() : NATIVE_HARNESSES[provider] ?? ['hermes'];
}

async function project(c: HermesConnection & { configured: boolean }): Promise<Account> {
  const kind = accountKind(c);
  const harnesses = c.harnesses ?? await defaultHarnesses(kind, c.provider);
  return {
    id: c.id, kind, name: c.name, provider: c.provider, baseUrl: c.baseUrl, wire: c.wireApi ?? (c.provider === 'openai' ? 'responses' : 'chat'),
    configured: c.configured, ...(c.credentialEnv ? { credentialEnv: c.credentialEnv } : {}),
    harnesses, bound: harnesses.filter(h => BOUND_HARNESSES.includes(h)), models: c.models, offered: c.offered ?? c.models, ...(c.discoveredAt ? { discoveredAt: c.discoveredAt } : {}),
  };
}

/** Every account, the Ronin API seeded greyed when no gateway account exists yet ("disabled, never hidden"), and every preset. */
export async function accountsAnswer(): Promise<AccountsAnswer> {
  const state = await hermesSettingsAnswer();
  const accounts = await Promise.all(state.connections.map(project));
  if (!accounts.some(a => a.kind === 'ronin_api')) {
    // An unreadable office record is said on the seed, not papered over with the local door.
    let baseUrl = '', fault: string | undefined;
    try { baseUrl = await roninApiBaseUrl(); } catch (e) { fault = (e as Error).message; }
    accounts.push({ id: RONIN_API_SEED_ID, kind: 'ronin_api', name: 'Ronin API', provider: 'custom', baseUrl, wire: 'responses', configured: false, seeded: true,
      harnesses: await roninApiHarnesses(), bound: BOUND_HARNESSES, models: [], offered: [], ...(fault ? { fault } : {}) });
  }
  const presets: Preset[] = state.setups.map(s => ({ id: s.id, name: s.name, harness: 'hermes', account: s.connection, model: s.model, reasoning: s.reasoning, approvals: s.approvals }));
  return { accounts, presets, kinds: ['personal_api', 'ronin_api'] };
}

/** Save an account: a Personal API as a Hermes connection; a Ronin API as the gateway connection (custom, Responses wire). */
export async function saveAccount(input: Record<string, unknown>) {
  const kind = input.kind === 'ronin_api' ? 'ronin_api' : 'personal_api';
  const id = input.id === RONIN_API_SEED_ID ? undefined : input.id;
  if (kind === 'ronin_api') {
    return saveHermesConnection({ id, kind, name: typeof input.name === 'string' && input.name.trim() ? input.name : 'Ronin API', provider: 'custom', wireApi: 'responses',
      // The same office-aware default the seed shows; an unreadable record refuses the save with its reason.
      baseUrl: typeof input.baseUrl === 'string' && input.baseUrl.trim() ? input.baseUrl : await roninApiBaseUrl(), apiKey: input.apiKey ?? input.token, harnesses: input.harnesses });
  }
  return saveHermesConnection({ ...input, id, kind });
}
export const discoverAccount = (id: string) => discoverHermesModels(id);
export const updateAccountLists = (id: string, lists: { harnesses?: unknown; offered?: unknown }) => updateHermesConnectionLists(id, lists);
export const deleteAccount = (id: string) => deleteHermesEntry('connections', id);
/** A preset names harness, account, model and knobs; today every preset is Hermes's, saved as its named setup. */
export async function savePreset(input: Record<string, unknown>) {
  if (input.harness !== undefined && input.harness !== 'hermes') throw new Error('Presets are Hermes setups until another harness has a binding.');
  return saveHermesSetup({ ...input, connection: input.account ?? input.connection });
}
export const deletePreset = (id: string) => deleteHermesEntry('setups', id);
