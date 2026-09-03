import { randomBytes } from 'node:crypto';
import { makeRecord } from '../auth.js';
import { readPasskeys, setRecovery } from '../passkey.js';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function mintCode(): { raw: string; pretty: string } {
  const raw = [...randomBytes(20)].map((b) => ALPHABET[b % 32]).join('');
  return { raw, pretty: raw.replace(/(.{5})(?=.)/g, '$1-') }; // XXXXX-XXXXX-XXXXX-XXXXX
}

const TTL_MS = 30 * 60 * 1000;
const cmd = process.argv[2] ?? 'new';

if (cmd === 'status') {
  const store = await readPasskeys();
  const n = (store.credentials ?? []).length;
  const r = store.recovery;
  if (!r || Date.now() > r.expiresAt) console.log('no recovery code outstanding');
  else console.log(`a recovery code is outstanding, valid until ${new Date(r.expiresAt).toLocaleTimeString()}`);
  console.log(`${n} passkey${n === 1 ? '' : 's'} registered`);
} else if (cmd === 'clear') {
  await setRecovery(undefined);
  console.log('recovery code revoked.');
} else if (cmd === 'new') {
  const { raw, pretty } = mintCode();
  const rec = await makeRecord(raw); // the CANONICAL form is what gets hashed
  const { secret: _unused, ...hash } = rec;
  await setRecovery({ ...hash, expiresAt: Date.now() + TTL_MS });
  console.log('\n  recovery code:  ' + pretty + '\n');
  console.log('Valid for 30 minutes, and for ONE login. Enter it on the login page under');
  console.log('"use a recovery code". It is not stored anywhere and will not be shown again.');
} else {
  console.error(`unknown command "${cmd}" — use new | clear | status`);
  process.exit(1);
}
