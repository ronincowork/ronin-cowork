import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildKansou, sendKansou } from '../src/activation/kansou.js';
import { readEgress } from '../src/activation/egress.js';

const ID = 'pkt_abcdefghjkmnpqrstvwxyz2345';

test('kansou builder emits only the settled closed body and no install identity', () => {
  const packet = buildKansou(ID, {
    message: '  hello  ', about: ['developer', 'bogus'], using_ronin_for: ['coding'],
    feedback_kind: ['idea'], reply_email: ' person@example.com ', install_id: 'must not pass',
  });
  assert.deepEqual(packet, {
    envelope_version: 1, kind: 'kansou', body_schema_version: 1, packet_id: ID,
    body: { message: 'hello', about: ['developer'], using_ronin_for: ['coding'], feedback_kind: ['idea'], reply_email: 'person@example.com' },
  });
  assert.equal(JSON.stringify(packet).includes('install'), false);
});

test('kansou builder refuses a phone number in the reply email field', () => {
  assert.throws(() => buildKansou(ID, { message: 'hello', reply_email: '+1 555 0100' }), /email/);
});

test('the explicit sender keeps exact bytes, stores the receipt, and records egress', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-kansou-'));
  process.env.RONIN_USER_ROOT = path.join(root, 'user');
  process.env.RONIN_DATA_ROOT = path.join(root, 'data');
  let received = '';
  const server = http.createServer((req, res) => {
    req.setEncoding('utf8'); req.on('data', (chunk) => { received += chunk; });
    req.on('end', () => { res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ receipt_id: 'rcp_test', packet_id: ID, received_at: new Date().toISOString() })); });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  process.env.RONIN_HQ_BASE = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  try {
    const packet = buildKansou(ID, { message: 'A thought.' });
    const result = await sendKansou(packet);
    assert.equal(result.receipt.packet_id, ID);
    assert.deepEqual(JSON.parse(received), packet);
    const kept = JSON.parse(await fs.readFile(path.join(process.env.RONIN_USER_ROOT, 'ageru', 'kansou', `${ID}.json`), 'utf8'));
    assert.deepEqual(kept, packet);
    const egress = await readEgress(1);
    assert.equal(egress[0]?.path, '/v1/ageru/kansou');
    assert.equal(egress[0]?.outcome, 'ok');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.RONIN_HQ_BASE; delete process.env.RONIN_USER_ROOT; delete process.env.RONIN_DATA_ROOT;
    await fs.rm(root, { recursive: true, force: true });
  }
});
