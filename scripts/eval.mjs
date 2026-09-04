#!/usr/bin/env node
import WebSocket from 'ws';

const inspector = process.env.RONIN_INSPECTOR_URL || 'http://127.0.0.1:9229/json';
const list = await (await fetch(inspector)).json();
if (!list[0]?.webSocketDebuggerUrl) throw new Error(`No Node inspector at ${inspector}`);
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolve) => {
  const callId = ++id;
  pending.set(callId, resolve);
  ws.send(JSON.stringify({ id: callId, method, params }));
});
ws.on('message', (message) => {
  const data = JSON.parse(message);
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data.result);
    pending.delete(data.id);
  }
});
await new Promise((resolve) => ws.on('open', resolve));
const expression = `(async () => {
  const { pathToFileURL } = process.getBuiltinModule('node:url');
  const { tmux } = await import(pathToFileURL(process.cwd() + '/src/tmux-client.ts').href);
  await tmux.run(['display-message', '-p', '#{session_name}']);
  const times = [];
  for (let i = 0; i < 8; i++) {
    const t0 = performance.now();
    await tmux.run(['display-message', '-p', '#{session_name}']);
    times.push(Number((performance.now() - t0).toFixed(3)));
  }
  return JSON.stringify({ state: tmux.state(), tmuxRunMs: times, maxMs: Math.max(...times) });
})()`;
const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
console.log(result?.result?.value ?? JSON.stringify(result));
ws.close();
