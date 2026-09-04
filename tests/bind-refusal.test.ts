import test from 'node:test';
import assert from 'node:assert/strict';
import { addressRefusal, EXIT_ADDRESS_UNUSABLE } from '../src/bind-refusal.js';

// BIND_DETERMINISM accepts one trade on purpose: a recorded address that this box no
// longer has (the tailnet IP changed since install) is refused BY NAME, with the two ways
// to re-resolve, rather than quietly replaced. That refusal is distinct from a collision,
// which names the port and not the file. Pure, so it can be read without booting the
// operator; deploy/ronin.service stops retrying on the exit status both share.
test('a recorded address that is gone is refused by name, with both ways to re-resolve', () => {
  const at = { bind: '100.72.224.3', port: 3006, envPath: '/srv/ronin/.env' };
  const gone = addressRefusal({ ...at, bindSource: 'env', code: 'EADDRNOTAVAIL' }).join('\n');
  assert.match(gone, /100\.72\.224\.3 is not an address on this machine/);
  assert.match(gone, /\/srv\/ronin\/\.env records BIND=100\.72\.224\.3/);
  assert.match(gone, /delete that BIND line/);
  assert.match(gone, /re-run \.\/setup\.sh/);

  const taken = addressRefusal({ ...at, bindSource: 'env', code: 'EADDRINUSE' }).join('\n');
  assert.match(taken, /100\.72\.224\.3:3006 is already in use/);
  assert.match(taken, /PORT/);
  assert.doesNotMatch(taken, /BIND=/, 'a collision is not a reason to re-resolve the address');
  assert.equal(EXIT_ADDRESS_UNUSABLE, 78);
});
