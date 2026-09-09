import path from 'node:path';
import { REPO_ROOT } from './resources.js';

export const MIKA_MCP_TOOLS = ['lookup', 'wheres_waldo', 'show'] as const;
export type MikaToolProvider = 'claude';

export class MikaToolBindingUnavailable extends Error {
  constructor(public readonly provider: string) {
    super(`Mika cannot launch with ${provider}: its CLI has no measured exact-tool binding with native shell, file, code, Git, and web tools disabled.`);
  }
}

export function mikaToolCapable(provider: string): provider is MikaToolProvider { return provider === 'claude'; }

/** Provider-specific syntax stays here; callers receive one typed, already-confined argv. */
export function bindMikaProviderTools(provider: string, argv: readonly string[], socket: string | undefined): string[] {
  if (!mikaToolCapable(provider)) throw new MikaToolBindingUnavailable(provider);
  if (!socket?.startsWith('/')) throw new Error('Mika callable tools require Ronin’s bound operator socket.');
  const config = JSON.stringify({ mcpServers: { mika: { command: process.execPath, args: [path.join(REPO_ROOT, 'bin', 'mika-mcp-server.mjs')], env: { RONIN_SOCKET: socket } } } });
  const tools = MIKA_MCP_TOOLS.map((name) => `mcp__mika__${name}`).join(',');
  return [argv[0], '--restricted', '--strict-mcp-config', '--mcp-config', config, '--tools', tools, '--allowedTools', tools, ...argv.slice(1)];
}
