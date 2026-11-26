/**
 * ACCOUNTS AND PRESETS (KAN-236, the Agent Harness workbench): one reading of the Hermes record as the
 * workbench's account list. There is no second store. A Hermes connection is an account of kind
 * `personal_api` (a vendor key or an OpenAI-compatible endpoint) or `ronin_api` (the house model gateway,
 * Ronin Cloud); a Hermes named setup is a preset of the hermes harness. Native CLI sign-ins are the
 * `subscription` kind and are never stored here: the harness owns them. These are provider accounts for
 * launching Agents, not Ronin Cloud customer or subscription accounts.
 */
import { readOfficeRecord } from './office-record.js';
import { accountKind, deleteHermesEntry, discoverHermesModels, hermesSettingsAnswer, saveHermesConnection, saveHermesSetup, type AccountKind, type HermesConnection } from './hermes-setups.js';

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
/** WHICH HARNESSES CAN USE A MODEL SERVICE (owner, 26 Nov 2026; KAN-896): a technical fact the
 * service reports, never a choice kept on it. A harness is here when Ronin has a launch adapter for
 * it (src/model-service-launch.ts), with the API protocols that adapter speaks. Claude Code has none,
 * so it uses no model service. Which services and model options a harness shows in New Agent is that
 * harness's own setting (`newAgentModels`). */
const SPEAKS: Record<string, ReadonlyArray<'chat' | 'responses'>> = { hermes: ['chat', 'responses'], codex: ['responses'], opencode: ['chat'] };
export const worksWith = (wire: 'chat' | 'responses'): string[] => Object.keys(SPEAKS).filter(harness => SPEAKS[harness]!.includes(wire));

export interface Account {
  id: string; kind: AccountKind; name: string; provider: HermesConnection['provider']; baseUrl: string; wire: 'chat' | 'responses';
  configured: boolean; seeded?: boolean; credentialEnv?: string; bound: string[]; models: string[]; discoveredAt?: string;
  /** The seed only: why no gateway address can be offered (the office record will not read). */
  fault?: string;
}
export interface Preset { id: string; name: string; harness: 'hermes'; account: string; model: string; reasoning: string; approvals: 'off' | 'prompt' }
export interface AccountsAnswer { accounts: Account[]; presets: Preset[]; kinds: AccountKind[] }

async function project(c: HermesConnection & { configured: boolean }): Promise<Account> {
  const kind = accountKind(c);
  const wire = c.wireApi ?? (c.provider === 'openai' ? 'responses' : 'chat');
  return {
    id: c.id, kind, name: c.name, provider: c.provider, baseUrl: c.baseUrl, wire,
    configured: c.configured, ...(c.credentialEnv ? { credentialEnv: c.credentialEnv } : {}),
    bound: worksWith(wire), models: c.models, ...(c.discoveredAt ? { discoveredAt: c.discoveredAt } : {}),
  };
}

/** Every account, the Ronin API seeded greyed when no gateway account exists yet ("disabled, never hidden"), and every preset. */
export async function serviceConnections(state: Awaited<ReturnType<typeof hermesSettingsAnswer>>): Promise<Account[]> {
  const accounts = await Promise.all(state.connections.map(project));
  if (!accounts.some(a => a.kind === 'ronin_api')) {
    // An unreadable office record is said on the seed, not papered over with the local door.
    let baseUrl = '', fault: string | undefined;
    try { baseUrl = await roninApiBaseUrl(); } catch (e) { fault = (e as Error).message; }
    accounts.push({ id: RONIN_API_SEED_ID, kind: 'ronin_api', name: 'Ronin API', provider: 'custom', baseUrl, wire: 'responses', configured: false, seeded: true,
      bound: worksWith('responses'), models: [], ...(fault ? { fault } : {}) });
  }
  return accounts;
}

/** Legacy flat projections retained for existing Accounts and Presets clients. */
export async function accountsAnswer(): Promise<AccountsAnswer> {
  const state = await hermesSettingsAnswer();
  const accounts = await serviceConnections(state);
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
      baseUrl: typeof input.baseUrl === 'string' && input.baseUrl.trim() ? input.baseUrl : await roninApiBaseUrl(), apiKey: input.apiKey ?? input.token });
  }
  const saved = await saveHermesConnection({ ...input, id, kind });
  // The key is already saved. If discovery is offline the owner can retry via Discover.
  if (saved.starterModelsPending) await discoverHermesModels(saved.id).catch(() => {});
  return saved;
}
export const discoverAccount = (id: string) => discoverHermesModels(id);
export const deleteAccount = (id: string) => deleteHermesEntry('connections', id);
/** A preset names harness, account, model and knobs; today every preset is Hermes's, saved as its named setup. */
export async function savePreset(input: Record<string, unknown>) {
  if (input.harness !== undefined && input.harness !== 'hermes') throw new Error('Presets are Hermes setups until another harness has a binding.');
  return saveHermesSetup({ ...input, connection: input.account ?? input.connection });
}
export const deletePreset = (id: string) => deleteHermesEntry('setups', id);
