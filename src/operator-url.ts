import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);
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
  await pexec('tmux', ['set-option', '-s', OPERATOR_CONNECTION_OPT, encoded]);
  const { stdout } = await pexec('tmux', ['show-option', '-s', '-qv', OPERATOR_CONNECTION_OPT]);
  const published = stdout.replace(/\n$/, '');
  if (published !== encoded) {
    throw new Error(`tmux ${OPERATOR_CONNECTION_OPT} read-back mismatch`);
  }
}
