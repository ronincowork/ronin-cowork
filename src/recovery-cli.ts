/**
 * The working half of `bin/ronin-recovery` — see that script for the front door.
 *
 *   tsx src/recovery-cli.ts new       # mint a code, print it ONCE, store only its hash
 *   tsx src/recovery-cli.ts clear     # revoke an outstanding code
 *   tsx src/recovery-cli.ts status    # is one outstanding, and until when?
 *
 * WHAT THIS IS FOR, precisely — because "recovery code" invites the wrong idea. It is
 * NOT a password reset: `bin/ronin-passwd` already resets the password from the host,
 * and the owner running this command has, by definition, host access. It is the way in
 * WITHOUT changing the password, which matters because a password change rotates the
 * signing secret and logs every other device out (src/auth.ts). The real case is the
 * plain one: a new phone, or a passkey that will not offer itself, and the owner does
 * not want to end their laptop's session to get the new device enrolled.
 *
 * WHY IT EXPIRES (30 minutes) AND IS SINGLE-USE. The owner is standing at the host when
 * they mint it and the device is in their other hand, so a short life costs nothing and
 * removes the failure this feature would otherwise introduce — a permanent password
 * equivalent, typed once and then living in the scrollback forever. Spending it deletes
 * it (src/routes/passkey-api.ts).
 *
 * The code is printed and never stored: what goes in machine_settings.json is the same scrypt
 * record the password uses, minus the signing secret, because sessions are still signed
 * by auth's one secret and inventing a second would mean two revocation stories.
 */
import { randomBytes } from 'node:crypto';
import { makeRecord } from './auth.js';
import { readPasskeys, setRecovery } from './passkey.js';

/**
 * Crockford-ish base32: no I, L, O, U, so nothing in a printed code can be misread as
 * something else when the owner is retyping it onto a phone at arm's length. 20 symbols
 * is 100 bits, which is far past anything scrypt plus a 30-minute window has to survive.
 * 256 divides by 32 exactly, so the byte-to-symbol mapping is unbiased.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Returns both faces of the code: the canonical one that gets hashed, and the grouped
 *  one the owner reads. `canonicalCode(pretty)` must equal `raw` — that is the contract
 *  the login route relies on, and the dashes are why it needs stating. */
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
  // Drop the signing secret makeRecord generated: sessions are signed by the password's
  // secret and only that one. Storing an unused second secret would imply otherwise.
  const { secret: _unused, ...hash } = rec;
  await setRecovery({ ...hash, expiresAt: Date.now() + TTL_MS });
  console.log('\n  recovery code:  ' + pretty + '\n');
  console.log('Valid for 30 minutes, and for ONE login. Enter it on the login page under');
  console.log('"use a recovery code". It is not stored anywhere and will not be shown again.');
} else {
  console.error(`unknown command "${cmd}" — use new | clear | status`);
  process.exit(1);
}
