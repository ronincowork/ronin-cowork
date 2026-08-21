/**
 * THE TWO-LEG WALK — the real Cowork modules against a real SHIWAKE process.
 *
 * Run it with
 *
 *   npx tsx --test tests/integration/two-leg.test.ts
 *
 * It spawns SHIWAKE as a SUBPROCESS and talks to it over HTTP. That is the honest shape —
 * SHIWAKE is a deployed service, not a library, and importing its source here would both
 * break the boundary the contract exists to hold and prove something other than what ships.
 *
 * Everything on this side is the real thing: `flow.ts` requests and polls, `secrets.ts`
 * stores the credentials, `tomodachi.ts` sends the packet, and `libexec/ronin-hq.sh` — the
 * code `ronin-update --services` actually runs — fetches the authorized release.
 *
 * Skips itself, loudly, if the SHIWAKE checkout is not beside this one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const SHIWAKE = process.env.SHIWAKE_REPO ?? '/home/glen3/dohyo/ronin-shiwake';
const EMAIL = 'walker@example.com';

let server: ChildProcess | undefined;
let dataRoot = '';
let userRoot = '';
let base = '';
let available = true;
/** WHY it is unavailable, so a skip cannot blame the wrong thing. */
let unavailable = '';

test.before(async () => {
  try { await fs.access(path.join(SHIWAKE, 'app/src/main.ts')); }
  catch { available = false; unavailable = `no ronin-shiwake checkout at ${SHIWAKE}`; return; }

  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'walk-hq-'));
  userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'walk-install-'));
  const port = 8000 + Math.floor(Math.random() * 1000);
  base = `http://127.0.0.1:${port}`;

  server = spawn('npx', ['tsx', 'app/src/main.ts'], {
    cwd: SHIWAKE,
    env: {
      ...process.env,
      SHIWAKE_DATA: dataRoot, SHIWAKE_HOST: '127.0.0.1', SHIWAKE_PORT: String(port),
      SHIWAKE_MAIL: 'fake', SHIWAKE_PUBLIC_URL: base,
      SHIWAKE_GRANT_KEY: 'walk-grant-key', SHIWAKE_TOKEN_KEY: 'walk-token-key',
      SHIWAKE_RESEND_COOLDOWN_MS: '50',
    },
    stdio: 'ignore',
  });

  // THE INSTALL'S OWN STORES, redirected at temporary directories through the canonical
  // overrides. Nothing here touches the real machine.
  process.env.RONIN_SERVICES_SECRETS_DIR = path.join(userRoot, 'services_secrets');
  process.env.RONIN_CONFIG_DIR = path.join(userRoot, 'config');
  process.env.RONIN_TELEMETRY_DIR = path.join(userRoot, 'telemetry');
  process.env.RONIN_SESSION_DIR = path.join(userRoot, 'sessions');
  process.env.RONIN_HQ_BASE = base;
  process.env.RONIN_HQ_HOST = '127.0.0.1';

  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/health/ready`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  // The checkout WAS there; the server did not answer in time. Saying "no checkout" here
  // would send the next person looking in entirely the wrong place.
  available = false;
  unavailable = 'the SHIWAKE checkout is present but its server did not become ready in 20s';
});

test.after(async () => {
  server?.kill('SIGTERM');
  if (dataRoot) await fs.rm(dataRoot, { recursive: true, force: true });
  if (userRoot) await fs.rm(userRoot, { recursive: true, force: true });
});

/** Run one tick of SHIWAKE's mail worker, in its own process, exactly as the timer does. */
async function drainMail(): Promise<void> {
  await exec('npx', ['tsx', 'app/src/mail-tick.ts'], {
    cwd: SHIWAKE,
    env: {
      ...process.env,
      SHIWAKE_DATA: dataRoot, SHIWAKE_MAIL: 'fake', SHIWAKE_PUBLIC_URL: base,
      SHIWAKE_GRANT_KEY: 'walk-grant-key', SHIWAKE_TOKEN_KEY: 'walk-token-key',
    },
  }).catch(() => { /* 'idle' exits 0; a failed send is asserted on by the caller */ });
}

/** Read the link out of the fake outbox — this stands in for the person's inbox. */
async function tokenFromInbox(): Promise<string> {
  const dir = path.join(dataRoot, 'mail', 'outbox-fake');
  const names = (await fs.readdir(dir)).sort();
  const last = JSON.parse(await fs.readFile(path.join(dir, names[names.length - 1]!), 'utf8'));
  return /token=([A-Za-z0-9_-]+)/.exec(last.text)![1]!;
}

test('THE WALK: real Cowork modules take a real install from nothing to entitled', async (t) => {
  if (!available) return t.skip(unavailable);

  // THE REAL FLOW MODULE — not a reimplementation of it.
  const { request, poll } = await import('../../src/activation/flow.js');
  const { getClaimSecret, getEntitlementToken } = await import('../../src/activation/secrets.js');
  const { readState } = await import('../../src/activation/state.js');
  const { readSettei } = await import('../../src/settei.js');

  const requested = await request(EMAIL);
  assert.equal(requested.stage, 'awaiting_email');
  assert.ok(await getClaimSecret(), 'the claim secret is on disk before success was reported');
  assert.equal(requested.email_masked, 'w*****@example.com');

  await drainMail();

  // Polling before the click hands over nothing.
  assert.equal((await poll()).stage, 'awaiting_email');
  assert.equal(await getEntitlementToken(), null);

  // The person clicks on a phone. Nothing about this touches the install.
  const token = await tokenFromInbox();
  const clicked = await fetch(`${base}/v1/services/verify?token=${token}`);
  assert.equal(clicked.status, 200);

  // The install discovers it by asking — the loop closing.
  const verified = await poll();
  assert.equal(verified.stage, 'verified');
  assert.match(String(verified.entitlement_id), /^ent_/);

  const entToken = await getEntitlementToken();
  assert.ok(entToken, 'a durable token is now held');
  assert.equal(await getClaimSecret(), null, 'the spent claim secret is gone');

  // The durable stage survives a fresh read, which is what an operator restart does.
  assert.equal((await readState()).stage, 'verified');

  // SETTEI reads that same durable aggregate. It must not wait for a second browser PUT
  // or consult the retired manually written services fields in ronin.json.
  const settei = await readSettei();
  const services = settei.set.services as {
    activation: { entitlement_id: string | null };
    entitlement?: unknown;
  };
  assert.equal(services.activation.entitlement_id, verified.entitlement_id);
  assert.ok(!Object.hasOwn(services, 'entitlement'),
    'there is no second SETTEI entitlement record to reconcile');
  assert.match(String(settei.status.subscription), new RegExp(String(verified.entitlement_id)));
});

test('THE EGRESS RECORD names every call, and carries no secret', async (t) => {
  if (!available) return t.skip(unavailable);
  const { readEgress } = await import('../../src/activation/egress.js');
  const lines = await readEgress(50);

  assert.ok(lines.length >= 2, 'the request and the polls were recorded');
  assert.ok(lines.some((l) => l.path === '/v1/services/activations'));

  const raw = JSON.stringify(lines);
  const { getEntitlementToken } = await import('../../src/activation/secrets.js');
  const tok = await getEntitlementToken();
  assert.ok(!raw.includes(tok!), 'the entitlement token is not in the egress record');
  assert.ok(!raw.includes(EMAIL), 'the address is not in the egress record');
});

test('THE UPDATER SEAM: libexec/ronin-hq.sh fetches an authorized release and verifies it',
  async (t) => {
    if (!available) return t.skip(unavailable);

    // Publish a release into SHIWAKE, the way the operator CLI will.
    //
    // A REAL TARBALL, with the real internal shape: ronin-services-vX.Y.Z/VERSION carrying
    // contract=N. A fixture of arbitrary bytes would pass a checksum assertion and prove
    // nothing about the step after it — which is exactly how the naming defect survived.
    const crypto = await import('node:crypto');
    const artifactDir = path.join(dataRoot, 'artifacts');
    const stage = path.join(artifactDir, 'stage', 'ronin-services-v1.2.3');
    await fs.mkdir(stage, { recursive: true });
    await fs.writeFile(path.join(stage, 'VERSION'), 'release=v1.2.3\ncontract=1\n');
    const artifact = path.join(artifactDir, 'ronin-services-v1.2.3.tar.gz');
    await exec('tar', ['-czf', artifact, '-C', path.join(artifactDir, 'stage'),
                       'ronin-services-v1.2.3']);
    const bytes = await fs.readFile(artifact);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');

    const releaseId = `rel_${'a'.repeat(26)}`;
    await fs.mkdir(path.join(dataRoot, 'releases', releaseId), { recursive: true });
    await fs.writeFile(path.join(dataRoot, 'releases', releaseId, 'manifest.json'), JSON.stringify({
      release_id: releaseId, package: 'services', version: '1.2.3', sha256: sha,
      artifact_path: artifact, contract_version: 1,
      published_at: new Date().toISOString(),
    }));

    // A fake install home whose contract number is the one the release was built for.
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walk-home-'));
    await fs.mkdir(path.join(homeDir, 'current', 'src'), { recursive: true });
    await fs.writeFile(path.join(homeDir, 'current', 'src', 'sockets-contract.ts'),
      'export const CONTRACT_V = 1;\n');

    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'walk-work-'));
    const repo = path.resolve(import.meta.dirname, '../..');

    // RUN THE ACTUAL SHELL THE UPDATER RUNS. Not a reimplementation of its logic.
    // SELF is the tree ronin-update lives in, and ronin-hq.sh resolves this install's own
    // ronin-store through it — by absolute path, never through PATH. That is deliberate: a
    // bare `ronin-store` finds whatever a shell happens to hit first, and on a machine with
    // a checkout around that is the wrong copy, which silently costs the authorized path.
    // The stub therefore sets SELF, exactly as the updater does.
    const { stdout } = await exec('sh', ['-c', `
      set -e
      say() { :; }
      fail() { echo "FAIL: $*" >&2; exit 1; }
      SELF='${repo}'
      HOME_DIR='${homeDir}'
      . '${repo}/libexec/ronin-hq.sh'
      hq_fetch_services '${work}'
    `], {
      env: { ...process.env, RONIN_HQ_BASE: base,
             RONIN_SERVICES_SECRETS_DIR: process.env.RONIN_SERVICES_SECRETS_DIR! },
    });

    assert.equal(stdout.trim(), 'v1.2.3',
      'the seam returns a TAG-shaped version, so $PKG-$VER resolves like the public path');

    // THE NAME MATTERS AS MUCH AS THE BYTES. Everything downstream is shared with the
    // public path, which reads the contract out of "$PKG-$VER/VERSION". A download named
    // services-1.2.3.tar.gz passed its checksum and then failed the contract check against
    // a path that does not exist — the install refused, having downloaded a perfect
    // artifact. Found on the E2E walk, one step past where a checksum-only test stops.
    const tarball = path.join(work, 'ronin-services-v1.2.3.tar.gz');
    const got = await fs.readFile(tarball);
    assert.equal(crypto.createHash('sha256').update(got).digest('hex'), sha);
    const sums = await fs.readFile(path.join(work, 'SHA256SUMS'), 'utf8');
    assert.match(sums, new RegExp(`^${sha}  ronin-services-v1\\.2\\.3\\.tar\\.gz$`, 'm'));

    // The verification the updater actually performs.
    await exec('sh', ['-c',
      `cd '${work}' && grep ronin-services-v1.2.3.tar.gz SHA256SUMS | sha256sum -c -`]);

    // AND THE STEP AFTER IT, which is the one that was broken: the contract number must be
    // readable by the exact expression ronin-update uses, or the install refuses.
    const { stdout: contract } = await exec('sh', ['-c',
      `tar -xzf '${tarball}' -O 'ronin-services-v1.2.3/VERSION' | sed -n 's/^contract=//p'`]);
    assert.equal(contract.trim(), '1',
      'the contract is readable at $PKG-$VER/VERSION — the check the updater performs next');

    await fs.rm(homeDir, { recursive: true, force: true });
    await fs.rm(work, { recursive: true, force: true });
  });

test('THE TOMODACHI LOOP: the real sender delivers a dropped packet and keeps the receipt',
  async (t) => {
    if (!available) return t.skip(unavailable);

    const { sendDuePackets, listReceipts } = await import('../../src/activation/tomodachi.js');

    // Nothing dropped yet: an empty outbox is the normal state between weeks.
    assert.equal((await sendDuePackets()).skipped, 'nothing-due');

    // The producer drops a v1 packet — exactly the shape ronin-services builds.
    const outbox = path.join(process.env.RONIN_TELEMETRY_DIR!, 'outbox');
    await fs.mkdir(outbox, { recursive: true });
    const packetId = `pkt_${'b'.repeat(26)}`;
    const packet = {
      envelope_version: 1, kind: 'tomodachi', body_schema_version: 1,
      packet_id: packetId, body: { sessions_started: 4, days_active: 3 },
    };
    await fs.writeFile(path.join(outbox, `${packetId}.json`), JSON.stringify(packet));

    const first = await sendDuePackets();
    assert.equal(first.sent, 1, JSON.stringify(first));
    assert.equal(first.failed, 0);

    // The receipt is kept locally — the sender's only proof of delivery.
    const receipts = await listReceipts();
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]!.packet_id, packetId);

    // The packet left the outbox only because a receipt came back.
    assert.equal((await fs.readdir(outbox)).filter((n) => n.endsWith('.json')).length, 0);

    // IDENTICAL-BYTE RETRY: re-drop the same packet, as a crash-and-rebuild would.
    await fs.writeFile(path.join(outbox, `${packetId}.json`), JSON.stringify(packet));
    const again = await sendDuePackets();
    assert.equal(again.alreadyStored, 1, 'HQ returned the receipt it already issued');
    assert.equal(again.sent, 0, 'no duplicate was created');
    assert.equal((await listReceipts()).length, 1, 'still one receipt');
  });
