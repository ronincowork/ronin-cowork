import { serviceConnections } from './accounts.js';
import { hermesSettingsAnswer } from './hermes-setups.js';

/** One public, credential-free record per connection. Legacy stores keep the same ids. */
export async function modelServices() {
  const state = await hermesSettingsAnswer();
  const accounts = await serviceConnections(state);
  return accounts.map(({ models: discovered, offered: _offered, ...connection }) => ({
    ...connection,
    name: connection.kind === 'ronin_api' ? 'Ronin Gateway' : connection.name,
    service_type: connection.kind === 'ronin_api' ? 'gateway' : /^https:\/\/openrouter\.ai\//.test(connection.baseUrl) ? 'openrouter' : 'private_api',
    discovered,
    models: state.setups.filter(entry => entry.connection === connection.id &&
      (connection.kind !== 'ronin_api' || !connection.discoveredAt || discovered.includes(entry.model)))
      .map(({ id, model, name, reasoning, approvals }) => ({ id, model, name, reasoning, approvals })),
  }));
}
export type ModelService = Awaited<ReturnType<typeof modelServices>>[number];
