/**
 * THE ONE ACTION, as executable assertions — the tool an agent actually types.
 *
 * `src/wipeboards.ts` is covered by tests/wipeboards.test.ts; this covers the thing on
 * top of it, because until now the CLI had only ever been driven by hand. What matters
 * here is not the storage rules again — it is the CONTRACT AN AGENT SEES: what is
 * printed, what the exit code is, and whether a run that printed something records the
 * read while a run that refused changes nothing.
 *
 * It spawns the real entry through tsx, so what is asserted is what ships. No tmux: the
 * tool resolves its session and membership through the RONIN_SESSION / RONIN_BOARDS /
 * RONIN_MEMBERS seams that exist for exactly this reason.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const pexec = promisify(execFile);
const exists = (p: string): Promise<boolean> => fs.stat(p).then(() => true, () => false);
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI = path.join(REPO, 'src', 'wipeboard-cli.ts');

const store = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-wb-cli-'));
const rosters = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-wb-cli-rosters-'));

/** Run the shipped entry as an agent would, and hand back what an agent would see. */
async function run(
  session: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number; out: string }> {
  try {
    const { stdout } = await pexec('npx', ['tsx', CLI, ...args], {
      cwd: REPO,
      env: {
        ...process.env,
        RONIN_WIPEBOARDS_DIR: store,
        RONIN_TEAM_ROSTERS_DIR: rosters,
        RONIN_SESSION: session,
        RONIN_BOARDS: 'crew',
        RONIN_TEAMS: 'crew',
        RONIN_MEMBERS: 'alpha,beta,gamma',
        RONIN_LEADS: '',
        // Tests never aim keystrokes at the live tmux server: the notify seam reports
        // instead of sending, and the target arithmetic is what gets asserted.
        RONIN_NO_NOTIFY: '1',
        ...env,
      },
    });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    return { code: err.code ?? 1, out: err.stdout ?? '' };
  }
}

test('posting, then a check that hands the other session what it has not read', async () => {
  const posted = await run('alpha', ['crew', 'post', 'rail contract is settled']);
  assert.equal(posted.code, 0);
  assert.match(posted.out, /POSTED to 'crew' as @alpha/);

  const first = await run('beta', []);
  assert.equal(first.code, 0);
  assert.match(first.out, /WIPEBOARD crew — 1 unread/);
  assert.match(first.out, /rail contract is settled/);
  assert.match(first.out, /read: 1 post on 1 wipeboard/);
});

test('checking again is cheap and says so — the read was recorded', async () => {
  const second = await run('beta', []);
  assert.equal(second.code, 0);
  assert.match(second.out, /nothing unread/);
  assert.doesNotMatch(second.out, /rail contract is settled/, 'not handed twice');
});

test('a session is never handed its own posts back', async () => {
  const mine = await run('alpha', []);
  assert.equal(mine.code, 0);
  assert.match(mine.out, /nothing unread/);
});

test('on no wipeboard is an ordinary answer, not an error', async () => {
  const lone = await run('delta', [], { RONIN_BOARDS: '' });
  assert.equal(lone.code, 0, 'a rōnin is not a failure');
  assert.match(lone.out, /nothing unread — you are on no wipeboard/);
});

test('an addressed post reaches a non-addressee too — addressing filters the interrupt', async () => {
  await run('alpha', ['post', '--to', 'gamma', 'you own the collapse state']);
  const beta = await run('beta', []);
  assert.match(beta.out, /you own the collapse state/, 'beta is on the wipeboard, so beta gets it');
  assert.match(beta.out, /→ @gamma/, 'and can see it was aimed elsewhere');
});

test('--to none lands and waits to be found', async () => {
  await run('alpha', ['crew', 'post', '--to', 'none', 'parked for whoever picks this up']);
  const beta = await run('beta', []);
  assert.match(beta.out, /parked for whoever picks this up/);
  assert.match(beta.out, /→ \(no notice\)/);
});

test('an empty --to is refused, and NOTHING is posted', async () => {
  const before = (await run('beta', [])).out;
  assert.match(before, /nothing unread/, 'beta starts caught up');

  const refused = await run('alpha', ['crew', 'post', '--to', '', 'should not land']);
  assert.equal(refused.code, 2);
  assert.match(refused.out, /BAD-ADDRESSEE/);

  const after = await run('beta', []);
  assert.match(after.out, /nothing unread/, 'the refusal posted nothing');
  assert.doesNotMatch(after.out, /should not land/);
});

test('history is explicit and moves no cursor', async () => {
  await run('alpha', ['crew', 'post', 'something for gamma to find']);
  const read = await run('gamma', ['crew', 'read']);
  assert.equal(read.code, 0);
  assert.match(read.out, /something for gamma to find/);

  // gamma read the thread by hand — that must not count as having been handed it.
  const check = await run('gamma', []);
  assert.match(check.out, /something for gamma to find/, 'read [n] never records a read');
});

test('find searches what is still there and moves no cursor either', async () => {
  const hit = await run('alpha', ['crew', 'find', 'collapse']);
  assert.equal(hit.code, 0);
  assert.match(hit.out, /you own the collapse state/);
  const miss = await run('alpha', ['crew', 'find', 'nothing-says-this']);
  assert.equal(miss.code, 0, 'no match is an answer, not a failure');
  assert.match(miss.out, /no match/);
});

test('the verdicts an agent can hit', async () => {
  const badName = await run('alpha', ['foo!bar', 'read']);
  assert.equal(badName.code, 2);
  assert.match(badName.out, /BAD-NAME/);

  const noBoard = await run('alpha', ['nosuchwipeboard', 'read']);
  assert.equal(noBoard.code, 3);
  assert.match(noBoard.out, /NO-WIPEBOARD/);

  const noSession = await run('', [], { RONIN_SESSION: '', TMUX_PANE: '' });
  assert.equal(noSession.code, 3);
  assert.match(noSession.out, /NO-SESSION/);
});

test('boards lists what exists and says whose each one is', async () => {
  const listed = await run('alpha', ['boards']);
  assert.equal(listed.code, 0);
  assert.match(listed.out, /crew/);
});

test("a roster's wipeboard id decides, and the roster brings its wipeboard up empty", async () => {
  await fs.writeFile(
    path.join(rosters, 'squad.md'),
    '# squad\n\n- **objective:** x\n- **wipeboard:** squad-talk\n- **state:** active\n',
  );
  assert.equal(await exists(path.join(store, 'squad-talk')), false, 'nothing there yet');

  // A post addressed to the roster's ID lands on the wipeboard the roster names.
  const posted = await run('alpha', ['squad-talk', 'post', 'first thing said here']);
  assert.equal(posted.code, 0);
  assert.equal(await exists(path.join(store, 'squad-talk')), true, 'the id is where it went');

  // And nobody created it — the roster implied it. A wipeboard named after the TEAM
  // must NOT appear: the name decides nothing, which is the whole ruling.
  assert.equal(await exists(path.join(store, 'squad')), false, 'the team name is not a wipeboard');

  // It carries the team's stub, so a first reader knows whose it is.
  const brief = await fs.readFile(path.join(store, 'squad-talk', 'brief.md'), 'utf8');
  assert.match(brief, /squad team's wipeboard/);
});


/* -------------------------------------------- the team board is the default (2026-08-24) */

test('bare post goes to the team board — no name, no telling', async () => {
  await fs.writeFile(
    path.join(rosters, 'crew.md'),
    '# crew\n\n- **objective:** x\n- **wipeboard:** crew-board\n- **state:** active\n',
  );
  const posted = await run('alpha', ['post', 'no board named, and it lands']);
  assert.equal(posted.code, 0);
  assert.match(posted.out, /POSTED to 'crew-board' as @alpha/, "the roster's id, not the team name");
  assert.equal(await exists(path.join(store, 'crew-board')), true);
});

test('bare post with no team refuses plainly, and with two teams asks which', async () => {
  const lone = await run('omega', ['post', 'shouting into the void'], { RONIN_TEAMS: '' });
  assert.equal(lone.code, 3);
  assert.match(lone.out, /NO-TEAM/);

  const torn = await run('omega', ['post', 'which one?'], { RONIN_TEAMS: 'crew,squad' });
  assert.equal(torn.code, 2);
  assert.match(torn.out, /WHICH-TEAM: you are on crew, squad/);
});

test('QUIET BY DEFAULT — a bare post interrupts the lead alone', async () => {
  const env = { RONIN_LEADS: 'gamma' };
  const bare = await run('alpha', ['post', 'plan is up, please riff'], env);
  assert.equal(bare.code, 0);
  assert.match(bare.out, /gamma\s+not notified \(test seam\)/, 'the lead is the default list');
  assert.doesNotMatch(bare.out, /beta\s+not notified/, 'the team is NOT interrupted by default');
  assert.match(bare.out, /not interrupted — they see it when they check/, 'and the poster is told so');
});

test('--to widens deliberately: names add to the lead, all reaches everyone, none reaches nobody', async () => {
  const env = { RONIN_LEADS: 'gamma' };
  const aimed = await run('alpha', ['post', '--to', 'beta', 'for beta, and the lead sees it'], env);
  assert.match(aimed.out, /beta\s+not notified \(test seam\)/);
  assert.match(aimed.out, /gamma\s+not notified \(test seam\)/, 'the lead rides every list');

  const loud = await run('alpha', ['post', '--to', 'all', 'everyone, on purpose'], env);
  assert.match(loud.out, /beta\s+not notified \(test seam\)/, '--to all is the explicit loud case');
  assert.match(loud.out, /gamma\s+not notified \(test seam\)/);

  const parked = await run('alpha', ['post', '--to', 'none', 'parked, waits to be found'], env);
  assert.doesNotMatch(parked.out, /not notified \(test seam\)/, '--to none interrupts nobody at all');
});

test('the lead posting is not interrupted by their own post', async () => {
  const r = await run('gamma', ['post', 'the lead speaks'], { RONIN_LEADS: 'gamma' });
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /gamma\s+not notified/, 'never the poster, lead or not');
});

/**
 * WHO IS TYPING, AND WHAT IS BEING SAID — the two things a post must not confuse.
 *
 * Found in use, 2026-08-29: `post --session x --to y <text>` posted as `shell` and put
 * the literal words `--session x` at the FRONT of the message. Two defects in one line.
 * The tool took no `--session`, so identity fell back to the pane — which was unset,
 * because `$TMUX` and `TMUX_PANE` can both be absent (a detached shell, a hook, a
 * harness) — and every unrecognized flag was pushed into the message body with nothing
 * reported. A board is a transport people read; a flag must never become what it says.
 */
const seamless = { RONIN_SESSION: '' };

test('--session says who is typing when the pane cannot, and it signs the post', async () => {
  // No RONIN_SESSION and no pane: exactly the state that produced `shell`.
  const posted = await run('', ['crew', 'post', '--session', 'alpha', 'signed by the flag'], seamless);
  assert.equal(posted.code, 0);
  assert.match(posted.out, /POSTED to 'crew' as @alpha/, 'the flag signs it, not `shell`');
  const beta = await run('beta', []);
  assert.match(beta.out, /@alpha/);
  assert.match(beta.out, /signed by the flag/);
  assert.doesNotMatch(beta.out, /--session/, 'and the flag is nowhere in what was said');
});

test('--session leads the whole command, so the formless reads can use it too', async () => {
  // The bare unread check carries no text of its own, and without a pane it could not
  // say whose boards to look at. Position 0 is unambiguous — nothing there is text.
  const check = await run('', ['--session', 'gamma'], seamless);
  assert.equal(check.code, 0);
  assert.match(check.out, /signed by the flag/, "gamma is on the board and had not read it");
});

test('an unknown flag is refused, never folded into what the board says', async () => {
  const typo = await run('alpha', ['crew', 'post', '--too', 'beta', 'the rail is yours']);
  assert.equal(typo.code, 2, 'refused, not posted');
  assert.match(typo.out, /BAD-FLAG: '--too'/);
  assert.match(typo.out, /--to, --session/, 'and it names the flags there are');
  const beta = await run('beta', []);
  assert.doesNotMatch(beta.out, /the rail is yours/, 'nothing reached the board');
});

test('a blank --session is refused rather than signing as nobody', async () => {
  const blank = await run('alpha', ['crew', 'post', '--session']);
  assert.equal(blank.code, 2);
  assert.match(blank.out, /BAD-SESSION/);
});

test('after the first ordinary word everything is text, so a post can carry a diff', async () => {
  // `--- a/file` is what a unified diff starts with. It is text and must survive: the
  // flag rule stops at the first word that is not a flag.
  const diff = await run('alpha', ['crew', 'post', '--to', 'beta', 'here is the hunk:', '---', 'a/src/x.ts']);
  assert.equal(diff.code, 0, 'a diff is not a flag error');
  const beta = await run('beta', []);
  assert.match(beta.out, /here is the hunk: --- a\/src\/x\.ts/);
});
