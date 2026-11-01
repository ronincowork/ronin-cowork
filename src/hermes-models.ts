import { execFile } from './spawn-broker.js';
import type { ModelConnection, ModelRow } from './model-providers.js';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const safeId = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/;

function modelRows(value: unknown): ModelRow[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : Object.keys(object(value));
  return values.flatMap(value => {
    const row = object(value);
    const id = text(typeof value === 'string' ? value : row.id ?? row.name);
    return safeId.test(id) ? [{ id, name: text(row.name) || id }] : [];
  });
}

/** Only configuration deliberately saved in Hermes. Never borrow Codex's account or list.
 * The CLI owns credentials and endpoint routing; none of those fields enter our record.
 */
export function hermesConnections(model: unknown, providers: unknown, custom: unknown): ModelConnection[] {
  const found = new Map<string, ModelConnection>();
  const add = (provider: string, label: string, rows: ModelRow[]) => {
    if (!safeId.test(provider) || provider === 'auto') return;
    const previous = found.get(provider);
    const all = [...(previous?.rows ?? []), ...rows];
    found.set(provider, { provider, label: previous?.label || label || provider,
      rows: all.filter((row, index) => all.findIndex(other => other.id === row.id) === index) });
  };
  for (const [name, value] of Object.entries(object(providers))) {
    const entry = object(value);
    if (!Object.keys(entry).length) continue;
    if (entry.enabled === false) continue;
    add(name, text(entry.name) || name, modelRows(entry.models ?? entry.model ?? entry.default_model));
  }
  for (const value of Array.isArray(custom) ? custom : []) {
    const entry = object(value);
    if (!Object.keys(entry).length) continue;
    if (entry.enabled === false) continue;
    const name = text(entry.name);
    // Hermes's custom-provider slug normalizes whitespace to hyphens.
    const slug = name.toLowerCase().replaceAll(' ', '-');
    if (slug) add(slug.startsWith('custom:') ? slug : `custom:${slug}`, name, modelRows(entry.models ?? entry.model ?? entry.default_model));
  }
  const selected = object(model);
  const provider = text(selected.provider);
  const disabled = object(object(providers)[provider]).enabled === false;
  if (!disabled) add(provider, provider, modelRows(selected.default ?? selected.name));
  return [...found.values()];
}

/** Refresh-only adapter. Capture config privately and project names/models immediately.
 * Missing optional keys are normal; command output and errors must never be logged.
 */
export async function readHermesConnections(file: string): Promise<ModelConnection[]> {
  if (!file) return [];
  const values = await Promise.all(['model', 'providers', 'custom_providers'].map(async key => {
    try {
      const { stdout } = await execFile(file, ['config', 'get', key, '--json'], { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
      return JSON.parse(stdout) as unknown;
    } catch { return null; }
  }));
  if (values.every(value => value === null)) throw new Error('Hermes configuration could not be read.');
  return hermesConnections(values[0], values[1], values[2]);
}
