import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
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

test('an initial attach failure falls through to execFile', async () => {
  const execs: string[][] = [];
  let calls = 0;
  const client = new ControlTmuxClient({
    exec: async (_file, args) => {
      execs.push([...args]);
      if (++calls <= 2) throw new Error('server unavailable');
      return 'fallback result';
    },
    log: () => undefined,
  });
  assert.equal(await client.run(['list-sessions']), 'fallback result');
  assert.equal(client.state(), 'fallback');
  assert.deepEqual(execs.at(-1), ['list-sessions']);
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

test('a timeout kills the wedged pipe and is not replayed', async () => {
  const { client, children, execs } = fixture();
  const result = client.run(['wait-for', 'never'], { timeoutMs: 5 });
  const child = await childAt(children);
  await written(child);
  await assert.rejects(result, /timed out after 5 ms/);
  assert.equal(child.killed, true);
  assert.equal(execs.filter((call) => call.args[0] === 'wait-for').length, 0);
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
