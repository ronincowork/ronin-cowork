import { readFile } from 'node:fs/promises';

export interface AgentLaunches {
  native: string[];
  model: string[];
  nativeDangerously: string[];
  modelDangerously: string[];
  resume: string[];
  newSessionId: string[];
  initial: 'positional' | 'none';
}

const field = (text: string, name: string): string =>
  text.split('\n').find((line) => line.startsWith(`- **${name}:** `))?.split('** ')[1]?.trim() ?? '';

const argv = (text: string, name: string): string[] => {
  const raw = field(text, name);
  if (!raw || raw === '—') return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(`Invalid ${name} JSON in Agent document.`); }
  if (!Array.isArray(value) || value.some((part) => typeof part !== 'string' || !part)) {
    throw new Error(`Invalid ${name} argv in Agent document.`);
  }
  return value as string[];
};

/** Launch grammar is executable documentation: one auditable file per Agent CLI. */
export async function readAgentLaunches(cli: string): Promise<AgentLaunches> {
  if (!/^[a-z][a-z0-9_-]*$/.test(cli)) throw new Error(`Invalid Agent CLI id "${cli}".`);
  const text = await readFile(new URL(`../docs/agents/${cli}.md`, import.meta.url), 'utf8');
  const initial = field(text, 'launch_initial');
  const launches: AgentLaunches = {
    native: argv(text, 'launch_native'),
    model: argv(text, 'launch_model'),
    nativeDangerously: argv(text, 'launch_native_dangerously'),
    modelDangerously: argv(text, 'launch_model_dangerously'),
    resume: argv(text, 'launch_resume'),
    newSessionId: argv(text, 'launch_new_session_id'),
    initial: initial === 'none' ? 'none' : 'positional',
  };
  if (!launches.native.length || launches.native[0] !== cli) {
    throw new Error(`docs/agents/${cli}.md must declare launch_native beginning with ${cli}.`);
  }
  return launches;
}

export const renderLaunch = (template: readonly string[], values: Record<string, string> = {}): string[] =>
  template.map((part) => part.replace(/\{([a-z_]+)\}/g, (_match, key: string) => values[key] ?? `{${key}}`));

export const commandText = (argv: readonly string[]): string => argv.join(' ');
