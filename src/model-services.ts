import { serviceConnections } from './accounts.js';
import { hermesSettingsAnswer, isOpenRouterService } from './hermes-setups.js';

/** One public, credential-free record per connection. Legacy stores keep the same ids. */
export async function modelServices() {
  const state = await hermesSettingsAnswer();
  const accounts = await serviceConnections(state);
  return accounts.map(({ models: discovered, offered: _offered, ...connection }) => ({
    ...connection,
    name: connection.kind === 'ronin_api' ? 'Ronin Gateway' : connection.name,
    service_type: connection.kind === 'ronin_api' ? 'gateway' : isOpenRouterService(connection.baseUrl) ? 'openrouter' : 'private_api',
    discovered,
    discoveredNames: state.connections.find(c => c.id === connection.id)?.modelNames || {},
    models: state.setups.filter(entry => entry.connection === connection.id)
      .map(({ id, model, name, reasoning, approvals }) => ({ id, model, name, reasoning, approvals })),
  }));
}
export type ModelService = Awaited<ReturnType<typeof modelServices>>[number];
