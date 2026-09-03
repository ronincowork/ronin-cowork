import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { authStatus, clearPassword, setPassword } from '../auth.js';

function ask(question: string): Promise<string> {
  const muted = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  process.stdout.write(question);
  const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
  return new Promise((resolve) => {
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const cmd = process.argv[2] ?? 'set';

if (cmd === 'status') {
  const s = await authStatus();
  console.log(s.set ? 'a password is set — /login is on' : 'no password set — tailnet/Basic only');
} else if (cmd === 'clear') {
  await clearPassword();
  console.log('login removed. The install is back to tailnet (and Basic auth, if configured in .env).');
} else if (cmd === 'set') {
  const supplied = process.env.RONIN_CLI_INPUT?.split('\n');
  const a = supplied?.[0] ?? await ask('new password: ');
  if (a.length < 8) {
    console.error('refused: fewer than 8 characters.');
    process.exit(1);
  }
  const b = supplied?.[1] ?? await ask('again: ');
  if (a !== b) {
    console.error('refused: the two entries differ.');
    process.exit(1);
  }
  await setPassword(a);
  console.log('password set. Every existing session is logged out; the page at /login takes the new one.');
  console.log('First time turning this on? Restart ronin so the boot log states the new posture.');
} else {
  console.error(`unknown command "${cmd}" — use set | clear | status`);
  process.exit(1);
}
