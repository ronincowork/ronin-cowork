import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { modelServices } from './model-services.js';
import { isHouse, keyPath } from './hermes-setups.js';
import { gatewayRelay } from './gateway-relay.js';
import { REPO_ROOT } from './resources.js';

export const SERVICE_MODEL_PREFIX = 'service:';

/** Expand the stable receipt command only at process start, including a restore.
 * The credential is read by the child, never copied into tmux argv or the receipt. */
export async function serviceLaunch(cli: string, argv: string[], person: string, retainedHome?: string): Promise<string[]> {
  const modelFlag = cli === 'hermes' ? '-m' : '--model';
  const pos = argv.indexOf(modelFlag);
  if (pos < 0 || !argv[pos + 1]?.startsWith(SERVICE_MODEL_PREFIX)) return argv;
  const id = argv[pos + 1]!.slice(SERVICE_MODEL_PREFIX.length);
  if (cli === 'hermes' && retainedHome) {
    const snapshot = JSON.parse(await readFile(path.join(retainedHome, 'ronin-setup.json'), 'utf8'));
    if (snapshot.setup?.id !== id || typeof snapshot.setup.model !== 'string') throw new Error('Saved Hermes setup is unavailable.');
    const args = [...argv];
    args[pos + 1] = snapshot.setup.model;
    return args;
  }
  const services = await modelServices();
  const service = services.find(s => s.bound.includes(cli) && s.models.some(m => m.id === id));
  const model = service?.models.find(m => m.id === id);
  if (!service?.configured || !model) throw new Error('This model service or named model is unavailable for this harness.');
  const args = [...argv];
  args[pos + 1] = model.model;
  if (cli === 'hermes') return args; // The isolated home is provisioned from this same setup ID.
  const house = await isHouse(service.baseUrl);
  if (cli === 'codex' && house) {
    // Hosted Codex goes through Services' metered relay. Its pass and person header stay there.
    const relay = gatewayRelay();
    if (!relay) throw new Error('Ronin Gateway relay is unavailable.');
    return relay(args, person);
  }
  if (house) throw new Error('This harness has no hosted Gateway relay.');
  let config = '';
  if (cli === 'codex') {
    const prefix = 'model_providers.ronin_service';
    args.splice(1, 0, '-c', 'model_provider="ronin_service"', '-c', prefix + '.name="Ronin"',
      '-c', prefix + '.wire_api="responses"', '-c', prefix + '.env_key="RONIN_MODEL_SERVICE_KEY"',
      '-c', prefix + '.base_url=' + JSON.stringify(service.baseUrl));
    if (model.reasoning !== 'default') args.splice(1, 0, '-c', 'model_reasoning_effort=' + JSON.stringify(model.reasoning));
  } else if (cli === 'opencode') {
    args[pos + 1] = 'ronin_service/' + model.model;
    config = JSON.stringify({ provider: { ronin_service: { npm: '@ai-sdk/openai-compatible', name: service.name,
      options: { baseURL: service.baseUrl, apiKey: '{env:RONIN_MODEL_SERVICE_KEY}' },
      models: { [model.model]: { name: model.name } } } } });
  } else throw new Error('No model service adapter for this harness.');
  return ['/bin/sh', '-c',
    'RONIN_MODEL_SERVICE_KEY="$("$1" "$2" "$3" "$4")" || exit 1; export RONIN_MODEL_SERVICE_KEY; if [ -n "$5" ]; then export OPENCODE_CONFIG_CONTENT="$5"; fi; shift 5; exec "$@"',
    'ronin-model-service', process.execPath, path.join(REPO_ROOT, 'libexec/model-service-key.mjs'),
    keyPath(service.id), service.baseUrl, config, ...args];
}
