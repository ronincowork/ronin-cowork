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
 * Everything on this side is the real thing: `transport.ts` carries every call, `secrets.ts`
 * stores the entitlement, the Services sender posts the weekly packet, and
 * `libexec/ronin-hq.sh` — the code `ronin-update --services` actually runs — fetches the
 * authorized release. The entitlement is provisioned as a hosted office's is: SHIWAKE's own
 * operator CLI mints it (`entitlement create`) and maps it to an account, and the office
 * record says this install is an office_unit. There is no email activation (KAN-314).
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
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);

// A SIBLING CHECKOUT, RESOLVED — never one machine's absolute path. This defaulted to
// `/home/glen3/dohyo/ronin-shiwake`, and `tests/` ships in the tarball (docs/development/release.md:
// an install can run its own byoin_checks), so every install carried one person's home
// directory and skipped here forever without anyone being able to act on the reason.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHIWAKE = process.env.SHIWAKE_REPO ?? path.resolve(HERE, '../../../ronin-shiwake');
const OFFICE = 'walk-office';

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

  // SPAWN THE REAL PROCESS, NOT AN INTERMEDIARY. Through `npx` the handle is npx, and
  // `kill()` reached only that — tsx and the server under it were orphaned onto
  // `systemd --user`, one pair per run, holding a port in this same range. `detached`
  // makes the child a group leader so the teardown can signal the whole group.
  server = spawn(path.join(SHIWAKE, 'node_modules/.bin/tsx'), ['app/src/main.ts'], {
    cwd: SHIWAKE,
    detached: true,
    env: {
      ...process.env,
      SHIWAKE_DATA: dataRoot, SHIWAKE_HOST: '127.0.0.1', SHIWAKE_PORT: String(port),
      SHIWAKE_MAIL: 'fake', SHIWAKE_GRANT_KEY: 'walk-grant-key',
    },
    stdio: 'ignore',
  });

  // THE INSTALL'S OWN STORES, redirected at temporary directories through the canonical
  // overrides. Nothing here touches the real machine.
  process.env.RONIN_SERVICES_SECRETS_DIR = path.join(userRoot, 'services_secrets');
  process.env.RONIN_CONFIG_DIR = path.join(userRoot, 'config');
  process.env.RONIN_TELEMETRY_DIR = path.join(userRoot, 'telemetry');
  process.env.RONIN_SESSION_DIR = path.join(userRoot, 'sessions');
  process.env.RONIN_OFFICE_DIR = path.join(userRoot, 'office');
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

/**
 * STOP THE SERVER, AND MEAN IT. Signal the process GROUP (note the negative pid), wait
 * for the exit, and escalate to SIGKILL for a child that ignores SIGTERM. The old
 * teardown deleted its data roots successfully and still left the server running — so a
 * clean-looking /tmp was never evidence that this worked. Only the process table is.
 */
async function stopServer(): Promise<void> {
  const child = server;
  server = undefined;
  if (!child?.pid) return;
  const exited = new Promise<void>((r) => child.once('exit', () => r()));
  try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
  const hard = setTimeout(() => {
    try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* already gone */ }
  }, 5_000);
  hard.unref();
  await exited;
  clearTimeout(hard);
}

// THE CRASH PATH. `after` does not run when the runner dies, and an orphan outlives the
// suite that made it — so the last word belongs to the process itself.
process.once('exit', () => {
  if (server?.pid) { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } }
});

test.after(async () => {
  await stopServer();
  if (dataRoot) await fs.rm(dataRoot, { recursive: true, force: true });
  if (userRoot) await fs.rm(userRoot, { recursive: true, force: true });
});

/** SHIWAKE's operator CLI against the walk's data root, exactly as the provisioner runs it. */
async function shiwake(args: string[]): Promise<any> {
  const { stdout } = await exec(path.join(SHIWAKE, 'node_modules/.bin/tsx'), ['app/src/cli.ts', ...args], {
    cwd: SHIWAKE,
    env: { ...process.env, SHIWAKE_DATA: dataRoot, SHIWAKE_GRANT_KEY: 'walk-grant-key' },
  });
  return JSON.parse(stdout);
}

test('THE WALK: a provisioned entitlement is held by the real secrets store, read by SETTEI, and opens the account', async (t) => {
  if (!available) return t.skip(unavailable);

  const { callHq } = await import('../../src/activation/transport.js');
  const { getEntitlementToken, putEntitlementToken } = await import('../../src/activation/secrets.js');
  const { writeState } = await import('../../src/activation/state.js');
  const { readMachineSettings } = await import('../../src/machine-settings.js');
  const { officeRecordFile } = await import('../../src/office-record.js');

  // The provisioner's step: mint the office's entitlement, map it, write the office record.
  const tokenFile = path.join(userRoot, 'entitlement-token');
  const minted = await shiwake(['entitlement', 'create', '--office-id', OFFICE, '--by', 'walk', '--token-out', tokenFile]);
  assert.match(String(minted.entitlement_id), /^ent_/);
  const account = await shiwake(['account', 'create', '--user-id', 'walker', '--name', 'Walker', '--by', 'walk']);
  await shiwake(['account', 'map', account.account_id, '--entitlement', minted.entitlement_id, '--office-id', OFFICE, '--by', 'walk']);
  await fs.mkdir(path.dirname(officeRecordFile()), { recursive: true });
  await fs.writeFile(officeRecordFile(), JSON.stringify({
    office_id: OFFICE, office_park: 'walk-park', gateway_office: 'http://127.0.0.1:4912',
    provisioned_at: '2026-10-01T00:00:00Z',
  }));

  await putEntitlementToken((await fs.readFile(tokenFile, 'utf8')).trim());
  assert.ok(await getEntitlementToken(), 'a durable token is now held');
  await writeState({ entitlement_id: minted.entitlement_id, verified_at: new Date().toISOString() });

  // SETTEI reads that same durable aggregate; there is no second entitlement record.
  const settei = await readMachineSettings();
  const services = settei.set.services as {
    activation: { entitlement_id: string | null };
    entitlement?: unknown;
  };
  assert.equal(services.activation.entitlement_id, minted.entitlement_id);
  assert.ok(!Object.hasOwn(services, 'entitlement'),
    'there is no second SETTEI entitlement record to reconcile');
  assert.match(String(settei.status.subscription), new RegExp(String(minted.entitlement_id)));

  // The account view, over the real transport (it records egress).
  const view = await callHq<{ office: { office_id: string }; account: { account_id: string } }>(
    'GET', `/v1/account?office_id=${OFFICE}`, { token: (await getEntitlementToken())! });
  assert.equal(view.status, 200, JSON.stringify(view.body ?? view.error));
  assert.equal(view.body?.office.office_id, OFFICE);
  assert.equal(view.body?.account.account_id, account.account_id);
});

test('THE EGRESS RECORD names every call, and carries no secret', async (t) => {
  if (!available) return t.skip(unavailable);
  const { readEgress } = await import('../../src/activation/egress.js');
  const lines = await readEgress(50);

  assert.ok(lines.length >= 1, 'the account read was recorded');
  assert.ok(lines.some((l) => String(l.path).startsWith('/v1/account')));

  const raw = JSON.stringify(lines);
  const { getEntitlementToken } = await import('../../src/activation/secrets.js');
  const tok = await getEntitlementToken();
  assert.ok(!raw.includes(tok!), 'the entitlement token is not in the egress record');
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

test('THE TOOL-COUNT LOOP: the real sender delivers the weekly packet to the account upload and keeps the receipt',
  async (t) => {
    if (!available) return t.skip(unavailable);

    const { noteService } = await import('../../src/sockets.js');
    noteService('counting');
    // The sender lives in the Services account part now (KAN-300); the dev-sync copy sits under src/services.
    const { sendDuePackets, listReceipts } = await import('../../src/services/account/tomodachi-send.js');

    // Nothing dropped yet: an empty outbox is the normal state between weeks.
    assert.equal((await sendDuePackets()).skipped, 'nothing-due');

    // Counting drops the weekly packet — exactly the shape ronin-services builds — for a
    // period after the office was provisioned (THE WALK wrote the record and mapped it).
    const outbox = path.join(process.env.RONIN_TELEMETRY_DIR!, 'outbox');
    await fs.mkdir(outbox, { recursive: true });
    const packetId = `pkt_${'b'.repeat(26)}`;
    const packet = {
      envelope_version: 1, kind: 'tool_counts', body_schema_version: 2, packet_id: packetId,
      body: { period_start: '2026-10-05', period_end: '2026-10-11', active_days: 3,
              counts: [{ tool: 'session_create', source: 'user_mobile', count: 3 }] },
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

test('THE SELF-HOSTED KEY: Register has HQ email a Services key; pasted in, it fetches Services and confirms the email',
  async (t) => {
    if (!available) return t.skip(unavailable);
    const { requestServicesKey } = await import('../../src/routes/services-activation-api.js');
    const { putEntitlementToken } = await import('../../src/activation/secrets.js');
    const { officeRecordFile } = await import('../../src/office-record.js');
    await fs.rm(officeRecordFile(), { force: true }); // a self-hosted machine: no office record

    const email = 'self-hosted@example.com';
    assert.deepEqual(await requestServicesKey(email), { sent: true }, 'the Register Submit path');

    // The person's inbox: SHIWAKE's fake mail adapter, under its own data root.
    const inbox = path.join(dataRoot, 'mail', 'outbox-fake');
    const mails = await Promise.all((await fs.readdir(inbox)).map(async (n) => JSON.parse(await fs.readFile(path.join(inbox, n), 'utf8'))));
    const mail = mails.find((m) => m.to === email && m.subject === 'Your Ronin Services key');
    const key = /^([A-Za-z0-9_-]{43})$/m.exec(mail?.text ?? '')?.[1];
    assert.ok(key, 'the key arrived by email');

    // The person pastes it: the route keeps it exactly so, then installs.
    await putEntitlementToken(key!);
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'walk-keyed-'));
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walk-keyed-home-'));
    await fs.mkdir(path.join(homeDir, 'current', 'src'), { recursive: true });
    await fs.writeFile(path.join(homeDir, 'current', 'src', 'sockets-contract.ts'), 'export const CONTRACT_V = 1;\n');
    const repo = path.resolve(import.meta.dirname, '../..');
    const { stdout } = await exec('sh', ['-c', `
      set -e
      say() { :; }
      fail() { echo "FAIL: $*" >&2; exit 1; }
      SELF='${repo}'
      HOME_DIR='${homeDir}'
      . '${repo}/libexec/ronin-hq.sh'
      hq_fetch_services '${work}'
    `], { env: { ...process.env, RONIN_HQ_BASE: base, RONIN_SERVICES_SECRETS_DIR: process.env.RONIN_SERVICES_SECRETS_DIR! } });
    assert.equal(stdout.trim(), 'v1.2.3', 'the Services key fetched the release through HQ');

    // HQ marked the account's email confirmed on that first grant.
    const accounts = path.join(dataRoot, 'accounts');
    const records = await Promise.all((await fs.readdir(accounts)).map(async (n) => JSON.parse(await fs.readFile(path.join(accounts, n), 'utf8'))));
    const account = records.find((a) => a.email === email);
    assert.ok(account?.email_confirmed_at, 'the key email was the confirmation round trip');

    await fs.rm(work, { recursive: true, force: true });
    await fs.rm(homeDir, { recursive: true, force: true });
  });
