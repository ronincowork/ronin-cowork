import { tmux } from './tmux-client.js';
const URL_OPT = '@ronin-url';
const CLI_TOKEN_OPT = '@ronin-cli-token';

export async function publishRoninUrl(url: string, cliToken?: string): Promise<void> {
  await tmux.run(['set-option', '-s', URL_OPT, url]);
  if (cliToken) await tmux.run(['set-option', '-s', CLI_TOKEN_OPT, cliToken]);
  const stdout = await tmux.run(['show-option', '-s', '-qv', URL_OPT]);
  const published = stdout.replace(/\n$/, '');
  if (published !== url) {
    throw new Error(`tmux ${URL_OPT} read-back mismatch: wrote ${url}, read ${published || '(empty)'}`);
  }
}
