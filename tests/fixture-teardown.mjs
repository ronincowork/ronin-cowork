/**
 * Unit-fixture teardown. check-tests gives the test process an empty, private TMPDIR;
 * this hook removes everything the process created there when the floor finishes.
 * The parent runner then inspects the directory independently and fails if teardown
 * missed anything. A killed promotion is covered by ronin-promote's outer trap.
 */
import fs from 'node:fs';

const owned = process.env.TMPDIR;
if (owned) {
  process.on('exit', () => {
    try {
      for (const name of fs.readdirSync(owned)) {
        fs.rmSync(`${owned}/${name}`, { recursive: true, force: true });
      }
    } catch {
      // The parent is the verdict: anything left behind is named as a leak there.
    }
  });
}
