/* THE MODEL CATALOG (KAN-828, KAN-895): two plain lists from HQ. `harness_models`: one row per
 * harness model with its tier, its "use it for" line and its facts. `openrouter_starters`: the
 * model options a new OpenRouter connection is seeded with, name and API model ID. Ronin Gateway's
 * models are described by the Gateway's own list, never here. HQ sends it through the park; the kohai writes the unit's
 * models.json; the Services part reads that file and hands it here whole (setModels). This file
 * keeps the last catalog in its own store and is the only reader of it, so a restart or a
 * stopped park still has one. No catalog yet reads as no rows.
 *
 * A fact that isn't there stays absent: a row is kept only with its cli and id, and each other
 * field only when it has the right type. Plan: ronin_hosted/model-catalog. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';
import type { CatalogModel, ModelCatalog, OpenRouterStarter } from './sockets-contract.js';

export type { CatalogModel, ModelCatalog, OpenRouterStarter };

const catalogFile = (): string => path.join(storeDir('model_catalog'), 'catalog.json');

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

function present<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function modelRow(value: unknown): CatalogModel | null {
  const e = (value ?? {}) as Record<string, unknown>;
  const harness = text(e.harness);
  const id = text(e.id);
  if (!harness || !id) return null;
  const p = (e.price ?? {}) as Record<string, unknown>;
  const price = present({ input: num(p.input), output: num(p.output) });
  return present({
    harness, id,
    name: text(e.name),
    tier: text(e.tier)?.toLowerCase(),
    use_for: text(e.use_for),
    context: num(e.context),
    output: num(e.output),
    price: Object.keys(price).length ? price : undefined,
    released: text(e.released),
    knowledge: text(e.knowledge),
    reasoning: bool(e.reasoning),
    tools: bool(e.tools),
  });
}

function starterRow(value: unknown): OpenRouterStarter | null {
  const e = (value ?? {}) as Record<string, unknown>;
  const id = text(e.id);
  return id ? { id, name: text(e.name) ?? id } : null;
}

/** Any value as a catalog: a missing or wrong field is no rows. */
export function parseModelCatalog(value: unknown): ModelCatalog {
  const raw = (value ?? {}) as Record<string, unknown>;
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  return present({
    at: text(raw.at),
    harness_models: list(raw.harness_models).map(modelRow).filter((m): m is CatalogModel => Boolean(m)),
    openrouter_starters: list(raw.openrouter_starters).map(starterRow).filter((m): m is OpenRouterStarter => Boolean(m)),
  });
}

/** The last catalog HQ sent; none yet is no rows. */
export async function readModelCatalog(): Promise<ModelCatalog> {
  try { return parseModelCatalog(JSON.parse(await fs.readFile(catalogFile(), 'utf8'))); } catch { return { harness_models: [], openrouter_starters: [] }; }
}

/** Keep this catalog as the office's; written only when it differs. */
export async function setModels(catalog: ModelCatalog): Promise<void> {
  const next = `${JSON.stringify(parseModelCatalog(catalog), null, 2)}\n`;
  const file = catalogFile();
  if (await fs.readFile(file, 'utf8').catch(() => '') === next) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, next);
  await fs.rename(tmp, file);
}
