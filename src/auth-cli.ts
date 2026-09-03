import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { runCli } from './cli-http.js';

function ask(question: string): Promise<string> {
  const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
  process.stdout.write(question);
  const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
  return new Promise((resolve) => rl.question('', (answer) => {
    rl.close();
    process.stdout.write('\n');
    resolve(answer);
  }));
}

const args = process.argv.slice(2);
let input: string | undefined;
if ((args[0] ?? 'set') === 'set') {
  const first = await ask('new password: ');
  const second = await ask('again: ');
  input = `${first}\n${second}\n`;
}
await runCli('auth', args, input);
