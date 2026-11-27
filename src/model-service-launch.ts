import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { launchFormat, modelServices } from './model-services.js';
import { isHouse, keyPath } from './model-service-store.js';
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
  const format = service ? launchFormat(cli, service.formats) : null;
  if (!service?.configured || !model || !format) throw new Error('This model service or named model is unavailable for this harness.');
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
  // Each harness's adapter, in the format the rule picked: Codex Responses, OpenCode Chat, Claude Code Anthropic.
  let config = '';
  let anthropicBase = '';
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
  } else if (cli === 'claude' && format === 'anthropic') {
    // Claude Code speaks Anthropic's format to the service's address without its /v1 (the client adds it), the key
    // as its auth token, its own API key blank so its own sign-in is not used (openrouter.ai/docs, Claude Code).
    anthropicBase = service.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  } else throw new Error('No model service adapter for this harness.');
  return ['/bin/sh', '-c',
    'RONIN_MODEL_SERVICE_KEY="$("$1" "$2" "$3" "$4")" || exit 1; export RONIN_MODEL_SERVICE_KEY; if [ -n "$5" ]; then export OPENCODE_CONFIG_CONTENT="$5"; fi; if [ -n "$6" ]; then export ANTHROPIC_BASE_URL="$6" ANTHROPIC_AUTH_TOKEN="$RONIN_MODEL_SERVICE_KEY" ANTHROPIC_API_KEY=""; fi; shift 6; exec "$@"',
    'ronin-model-service', process.execPath, path.join(REPO_ROOT, 'libexec/model-service-key.mjs'),
    keyPath(service.id), service.baseUrl, config, anthropicBase, ...args];
}
