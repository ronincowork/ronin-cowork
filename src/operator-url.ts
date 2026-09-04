import { tmux } from './tmux-client.js';
export const OPERATOR_CONNECTION_OPT = '@ronin-operator';

export interface OperatorConnection {
  version: 1;
  url: string;
  token: string;
  instance: string;
}

export async function publishRoninUrl(url: string, cliToken?: string): Promise<void> {
  const connection: OperatorConnection = {
    version: 1,
    url,
    token: cliToken ?? '',
    instance: `${process.pid}:${Date.now()}`,
  };
  const encoded = JSON.stringify(connection);
  await tmux.run(['set-option', '-s', OPERATOR_CONNECTION_OPT, encoded]);
  const stdout = await tmux.run(['show-option', '-s', '-qv', OPERATOR_CONNECTION_OPT]);
  const published = stdout.replace(/\n$/, '');
  if (published !== encoded) {
    throw new Error(`tmux ${OPERATOR_CONNECTION_OPT} read-back mismatch`);
  }
}
