import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnBrokerPid, stopSpawnBroker } from '../src/spawn-broker.js';

after(() => stopSpawnBroker());

test('round trips stdout and stderr through the child broker', async () => {
  const result = await execFile(process.execPath, ['-e', 'process.stdout.write("out"); process.stderr.write("err")']);
  assert.deepEqual(result, { stdout: 'out', stderr: 'err' });
  assert.ok(spawnBrokerPid());
});

test('propagates exit code, stdout, and stderr', async () => {
  await assert.rejects(
    execFile(process.execPath, ['-e', 'process.stdout.write("partial"); process.stderr.write("bad"); process.exit(7)']),
    (error: Error & { code?: number; stdout?: string; stderr?: string }) => {
      assert.equal(error.code, 7);
      assert.equal(error.stdout, 'partial');
      assert.equal(error.stderr, 'bad');
      return true;
    },
  );
});

test('enforces the caller timeout', async () => {
  await assert.rejects(
    execFile(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], { timeout: 30 }),
    (error: Error & { killed?: boolean; signal?: NodeJS.Signals }) => {
      assert.equal(error.killed, true);
      assert.equal(error.signal, 'SIGTERM');
      return true;
    },
  );
});

test('rejects an in-flight request when the broker dies and restarts for the next request', async () => {
  const inFlight = execFile(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)']);
  const firstPid = spawnBrokerPid();
  assert.ok(firstPid);
  process.kill(firstPid!, 'SIGKILL');
  await assert.rejects(inFlight, /spawn broker exited/);

  const result = await execFile('/bin/true');
  assert.equal(result.stdout, '');
  assert.notEqual(spawnBrokerPid(), firstPid);
});
