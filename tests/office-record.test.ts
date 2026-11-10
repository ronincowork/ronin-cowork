import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// The office record: present means an office on an office_park, absent means self-hosted,
// and a present file that will not read is a fault, never self-hosted.
test('office record: absent is self-hosted, present is office_park, wrong is unreadable', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-office-'));
  process.env.RONIN_OFFICE_UNIT_DIR = dir;
  try {
    const { readOfficeRecord, isOfficeHost, parseOfficeRecord } = await import('../src/office-record.js');
    let v = await readOfficeRecord();
    assert.equal(v.hosting, 'self_hosted');
    assert.equal(v.hosting === 'self_hosted' && v.host, os.hostname());
    assert.equal(await isOfficeHost(), false);

    const record = { office_id: 'glen', office_park: 'oh-1', gateway_office: 'http://10.0.0.2:4912/', provisioned_at: '2026-11-06T09:00:00Z' };
    await fs.writeFile(path.join(dir, 'office_record.json'), JSON.stringify(record));
    v = await readOfficeRecord();
    assert.equal(v.hosting, 'office_unit');
    assert.deepEqual(v.hosting === 'office_unit' && v.record, { ...record, gateway_office: 'http://10.0.0.2:4912' });
    assert.equal(await isOfficeHost(), true);

    await fs.writeFile(path.join(dir, 'office_record.json'), '{not json');
    v = await readOfficeRecord();
    assert.equal(v.hosting, 'unreadable');
    assert.equal(await isOfficeHost(), false);

    for (const bad of [
      { ...record, office_id: 'has space' },
      { ...record, office_park: '' },
      { ...record, gateway_office: 'ftp://x' },
      { ...record, gateway_office: 'http://user:pw@x/' },
      { ...record, gateway_office: 'http://x/?q=1' },
      { ...record, provisioned_at: 'yesterday' },
      [record],
      null,
    ]) assert.throws(() => parseOfficeRecord(bad), `${JSON.stringify(bad)} must not parse`);
  } finally {
    delete process.env.RONIN_OFFICE_UNIT_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
