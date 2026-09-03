import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);
const URL_OPT = '@ronin-url';
const CLI_TOKEN_OPT = '@ronin-cli-token';

/**
 * Publish where the bound Ronin operator is listening on the tmux server's shared bus.
 * Strict by design: a write that cannot be read back would strand every agent-facing
 * API tool, so the caller reports the failure and teaches the RONIN_URL override.
 */
export async function publishRoninUrl(url: string, cliToken?: string): Promise<void> {
  await pexec('tmux', ['set-option', '-s', URL_OPT, url]);
  if (cliToken) await pexec('tmux', ['set-option', '-s', CLI_TOKEN_OPT, cliToken]);
  const { stdout } = await pexec('tmux', ['show-option', '-s', '-qv', URL_OPT]);
  const published = stdout.replace(/\n$/, '');
  if (published !== url) {
    throw new Error(`tmux ${URL_OPT} read-back mismatch: wrote ${url}, read ${published || '(empty)'}`);
  }
}
