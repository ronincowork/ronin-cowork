import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  ControlTmuxClient,
  commandLine,
  decodeTmuxOutput,
  quoteTmuxArg,
  type Notification,
} from '../src/tmux-client.js';

class FakeControl extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }

  send(...lines: string[]): void {
    this.stdout.write(`${lines.join('\n')}\n`);
  }
}

function fixture(options: { fallback?: string } = {}) {
  const children: FakeControl[] = [];
  const execs: Array<{ file: string; args: readonly string[]; timeoutMs: number }> = [];
  const client = new ControlTmuxClient({
    exec: async (file, args, timeoutMs) => {
      execs.push({ file, args: [...args], timeoutMs });
      return options.fallback ?? '';
    },
    spawnControl: () => {
      const child = new FakeControl();
      children.push(child);
      queueMicrotask(() => child.send('%begin 1 0 0', '%end 1 0 0'));
      return child as never;
    },
    setTimer: (handler, delayMs) => setTimeout(handler, delayMs === 200 ? 1 : delayMs),
    log: () => undefined,
  });
  void client.connect();
  return { client, children, execs };
}

async function written(child: FakeControl): Promise<string> {
  const chunk = child.stdin.read() ?? (await once(child.stdin, 'data'))[0];
  return String(chunk);
}

async function childAt(children: FakeControl[], index = 0): Promise<FakeControl> {
  while (!children[index]) await new Promise((resolve) => setImmediate(resolve));
  return children[index]!;
}

test('tmux quoting is owned in one place and covers every contract case', () => {
  assert.equal(quoteTmuxArg('two words'), "'two words'");
  assert.equal(quoteTmuxArg("it's"), "'it'\\''s'");
  assert.equal(quoteTmuxArg(''), "''");
  assert.equal(quoteTmuxArg(';'), ';');
  assert.equal(
    commandLine(['display-message', '-p', '#{session_name}\\t#{window_name};literal', ';', 'list-sessions']),
    "'display-message' '-p' '#{session_name}\\t#{window_name};literal' ; 'list-sessions'",
  );
  assert.throws(() => commandLine(['display-message', 'line\nbreak']), /newlines/);
});

test('a framed reply has no trailing newline and command numbers must match', async () => {
  const { client, children } = fixture();
  const result = client.run(['list-sessions']);
  const child = await childAt(children);
  assert.equal(await written(child), "'list-sessions'\n");
  child.send('%begin 100 7 1', 'one', 'two', '%end 100 7 1');
  assert.equal(await result, 'one\ntwo');
  assert.equal(client.state(), 'up');
});

test('commands serialize and notifications are delivered between reply blocks', async () => {
  const { client, children } = fixture();
  const notifications: Notification[] = [];
  client.on('%sessions-changed', (notification) => notifications.push(notification));
  const first = client.run(['display-message', '-p', 'first']);
  const second = client.run(['display-message', '-p', 'second']);
  const child = await childAt(children);
  assert.match(await written(child), /'first'/);
  assert.equal(child.stdin.read(), null, 'the second command waits for the first frame');
  child.send('%begin 1 1 0', 'FIRST', '%end 1 1 0', '%sessions-changed');
  assert.equal(await first, 'FIRST');
  assert.match(await written(child), /'second'/);
  child.send('%begin 1 2 0', 'SECOND', '%end 1 2 0');
  assert.equal(await second, 'SECOND');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]!.kind, 'sessions-changed');
  assert.equal(notifications[0]!.rawKind, '%sessions-changed');
  assert.equal(notifications[0]!.line, '%sessions-changed');
});

test('%error rejects with the error block text', async () => {
  const { client, children } = fixture();
  const result = client.run(['no-such-command']);
  const child = await childAt(children);
  await written(child);
  child.send('%begin 4 9 0', 'unknown command: no-such-command', '%error 4 9 0');
  await assert.rejects(result, /unknown command: no-such-command/);
});

test('a mismatched frame number tears down the connection before retry fallback', async () => {
  const { client, children, execs } = fixture({ fallback: 'retried' });
  const result = client.run(['list-sessions']);
  const child = await childAt(children);
  await written(child);
  child.send('%begin 4 9 0', 'answer', '%end 4 10 0');
  assert.equal(await result, 'retried');
  assert.equal(child.killed, true);
  assert.deepEqual(execs.at(-1)?.args, ['list-sessions']);
});

test('the default client path uses execFile without attaching control mode', async () => {
  const execs: string[][] = [];
  let controlSpawns = 0;
  const logs: string[] = [];
  const client = new ControlTmuxClient({
    exec: async (_file, args) => {
      execs.push([...args]);
      return 'fallback result';
    },
    spawnControl: () => { controlSpawns += 1; return new FakeControl() as never; },
    log: (line) => logs.push(line),
  });
  assert.equal(await client.run(['list-sessions']), 'fallback result');
  assert.equal(client.state(), 'fallback');
  assert.equal(controlSpawns, 0);
  assert.deepEqual(logs, []);
  assert.deepEqual(execs.at(-1), ['list-sessions']);
});

test('connect explicitly opts a server process into one control attachment', async () => {
  const children: FakeControl[] = [];
  const client = new ControlTmuxClient({
    exec: async () => '',
    spawnControl: () => {
      const child = new FakeControl();
      children.push(child);
      queueMicrotask(() => child.send('%begin 1 0 0', '%end 1 0 0'));
      return child as never;
    },
    log: () => undefined,
  });
  await client.connect();
  await client.connect();
  assert.equal(children.length, 1);
  assert.equal(client.state(), 'up');
});

test('%exit retries an in-flight command once through execFile fallback', async () => {
  const { client, children, execs } = fixture({ fallback: 'fallback result' });
  const result = client.run(['display-message', '-p', '#{session_name}']);
  const child = await childAt(children);
  await written(child);
  child.send('%exit holder disappeared');
  assert.equal(await result, 'fallback result');
  assert.equal(client.state(), 'fallback');
  assert.deepEqual(execs.at(-1)?.args, ['display-message', '-p', '#{session_name}']);
});

test('the client recreates grid_ctl and returns to up after backoff', async () => {
  const { client, children, execs } = fixture();
  const first = client.run(['display-message', '-p', 'ready']);
  const child = await childAt(children);
  await written(child);
  child.send('%begin 1 1 0', 'ready', '%end 1 1 0');
  await first;
  child.emit('exit', 1, null);
  assert.equal(client.state(), 'fallback');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(children.length, 2);
  assert.equal(client.state(), 'up');
  assert.deepEqual(execs[0]?.args, ['new-session', '-d', '-s', 'grid_ctl', 'exec sleep 2147483647']);
});

test('a changed tmux socket environment retires the old connection', async () => {
  const before = process.env.TMUX_TMPDIR;
  const { client, children } = fixture();
  try {
    process.env.TMUX_TMPDIR = '/tmp/tmux-client-first';
    const first = client.run(['display-message', '-p', 'first']);
    const firstChild = await childAt(children);
    await written(firstChild);
    firstChild.send('%begin 1 1 0', 'first', '%end 1 1 0');
    assert.equal(await first, 'first');

    process.env.TMUX_TMPDIR = '/tmp/tmux-client-second';
    const second = client.run(['display-message', '-p', 'second']);
    const secondChild = await childAt(children, 1);
    assert.equal(firstChild.killed, true);
    await written(secondChild);
    secondChild.send('%begin 2 2 0', 'second', '%end 2 2 0');
    assert.equal(await second, 'second');
  } finally {
    if (before === undefined) delete process.env.TMUX_TMPDIR;
    else process.env.TMUX_TMPDIR = before;
  }
});

test('a timeout kills the wedged pipe and is not replayed', async () => {
  const { client, children, execs } = fixture();
  const result = client.run(['wait-for', 'never'], { timeoutMs: 5 });
  const child = await childAt(children);
  await written(child);
  await assert.rejects(result, /timed out after 5 ms/);
  assert.equal(child.killed, true);
  assert.equal(execs.filter((call) => call.args[0] === 'wait-for').length, 0);
});

test('an EPIPE-style stdin error becomes connection loss and retry fallback', async () => {
  const { client, children, execs } = fixture({ fallback: 'after epipe' });
  const result = client.run(['display-message', '-p', 'value']);
  const child = await childAt(children);
  await written(child);
  child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
  assert.equal(await result, 'after epipe');
  assert.equal(client.state(), 'fallback');
  assert.equal(child.killed, true);
  assert.deepEqual(execs.at(-1)?.args, ['display-message', '-p', 'value']);
});

test('%output octal escapes decode without eating ordinary backslashes', async () => {
  assert.equal(decodeTmuxOutput('a\\040b\\134c\\011d\\n'), 'a b\\c\td\\n');
  const { client, children } = fixture();
  let seen: Notification | undefined;
  client.on('%output', (notification) => { seen = notification; });
  const result = client.run(['display-message', '-p', 'ok']);
  const child = await childAt(children);
  await written(child);
  child.send('%begin 2 3 0', 'ok', '%end 2 3 0', '%output %8 hello\\040world\\015\\012');
  await result;
  assert.equal(seen?.paneId, '%8');
  assert.equal(seen?.output, 'hello world\r\n');
});

test("on('subscription') installs the activity session loop and parses its values", async () => {
  const { client, children } = fixture();
  let seen: Notification | undefined;
  client.on('subscription', (notification) => { seen = notification; });
  const child = await childAt(children);
  assert.equal(
    await written(child),
    "'refresh-client' '-B' 'activity::#{S:#{session_name}:#{window_activity},}'\n",
  );
  child.send('%begin 3 1 0', '%end 3 1 0');
  await new Promise((resolve) => setImmediate(resolve));
  child.send('%subscription-changed activity $1 @1 0 %1 : alpha:123,beta:456');
  assert.equal(seen?.kind, 'subscription');
  assert.equal(seen?.subscription, 'activity');
  assert.equal(seen?.value, 'alpha:123,beta:456');
});

test('an importing process exits after its command leaves the control connection idle', async () => {
  const source = [
    "import { tmux } from './src/tmux-client.ts';",
    "const output = await tmux.run(['display-message', '-p', 'x']);",
    "if (output !== 'x') throw new Error(`unexpected output: ${output}`);",
  ].join(' ');
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [
    '--import', 'tsx', '--input-type=module', '-e', source,
  ], { cwd: process.cwd(), timeout: 2_000, encoding: 'utf8' });
  assert.equal(stdout, '');
  assert.equal(stderr, '');
});
