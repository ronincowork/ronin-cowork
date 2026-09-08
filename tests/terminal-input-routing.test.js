import test from 'node:test';
import assert from 'node:assert/strict';
import { terminalInputRouter, terminalOwnsTarget, wireTerminalInput } from '../public/js/terminal-input.js';
import { TileWire } from '../public/js/tilewire.js';
import { tileInputAction } from '../src/viewer.ts';
import { isTerminalReply } from '../src/ws/pty.ts';

test('full Secondary DA response takes only the protocol channel, without byte filtering', () => {
  const user = [];
  const protocol = [];
  const listeners = {};
  const query = '\x1b[>c';
  const da = '\x1b[>0;276;0c';
  const term = {
    parser: { registerCsiHandler: (id, fn) => { listeners[`csi:${id.prefix ?? ''}${id.final}`] = fn; } },
    _core: { coreService: { onUserInput: (fn) => { listeners.user = fn; } } },
    onData: (fn) => { listeners.data = fn; },
    write: (data) => { assert.equal(data, query); listeners.data(da); },
  };
  wireTerminalInput(term, (data) => user.push(data), (data) => protocol.push(data));
  assert.equal(listeners['csi:c']([]), true);
  assert.equal(listeners['csi:>c']([]), true);
  term.write(query);
  assert.deepEqual(protocol, [da]);
  assert.deepEqual(user, []);

  listeners.user();
  listeners.data(da); // the same bytes deliberately typed/pasted are still user input
  assert.deepEqual(user, [da]);
});

test('missing private xterm provenance degrades safely after public DA suppression', () => {
  const handlers = [];
  let onData;
  wireTerminalInput({
    parser: { registerCsiHandler: (id, fn) => handlers.push([id, fn]) },
    onData: (fn) => { onData = fn; },
  }, (data) => handlers.push(['user', data]), () => assert.fail('fallback cannot claim protocol provenance'));
  assert.equal(handlers.length, 2);
  assert.doesNotThrow(() => onData('typed'));
  assert.deepEqual(handlers[2], ['user', 'typed']);
});

test('router resets provenance for every emission', () => {
  const sent = [];
  const router = terminalInputRouter((d) => sent.push(['input', d]), (d) => sent.push(['protocol', d]));
  router.markUserInput();
  router.route('typed');
  router.route('reply');
  assert.deepEqual(sent, [['input', 'typed'], ['protocol', 'reply']]);
});

test('composer pointer/focus and keys targets produce no terminal focus or scroll intent', () => {
  const terminal = { contains: (target) => target.owner === 'terminal' };
  const actions = [];
  const route = (target, kind) => {
    if (terminalOwnsTarget(terminal, target)) actions.push(kind);
  };
  route({ owner: 'composer' }, 'focus');
  route({ owner: 'composer' }, 'scroll');
  route({ owner: 'keys' }, 'focus');
  assert.deepEqual(actions, []);
  route({ owner: 'terminal' }, 'focus');
  route({ owner: 'terminal' }, 'scroll');
  assert.deepEqual(actions, ['focus', 'scroll']);
});

test('protocol and real user input retain distinct websocket message types', () => {
  const wire = new TileWire({ onDrop() {} });
  const sent = [];
  wire.ws = { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) };
  assert.equal(wire.sendTerminalReply('\x1b[>0;276;0c'), true);
  assert.equal(wire.sendInput('hello'), true);
  assert.deepEqual(sent, [{ t: 'p', d: '\x1b[>0;276;0c' }, { t: 'i', d: 'hello' }]);
  assert.equal(isTerminalReply(sent[0]), true);
  assert.equal(isTerminalReply(sent[1]), false);
});

test('intentional terminal wheel input keeps the existing scrollback actions byte-identical', () => {
  const wheelUp = '\x1b[<64;1;1M';
  assert.equal(tileInputAction({ inMode: false, appWantsMouse: false }, wheelUp), 'enter-scroll-up');
  assert.equal(tileInputAction({ inMode: true, appWantsMouse: false }, wheelUp), 'scroll-up');
  assert.equal(tileInputAction({ inMode: true, appWantsMouse: false }, '\x1b'), 'cancel');
});

test('mouse release passes through copy mode while typing remains quiet', () => {
  const scrolled = { inMode: true, appWantsMouse: false };
  assert.equal(tileInputAction(scrolled, '\x1b[<0;2;1m'), 'write');
  assert.equal(tileInputAction(scrolled, 'hello'), 'drop');
});
