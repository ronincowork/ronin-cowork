#!/usr/bin/env node
import WebSocket from 'ws';

const inspector = process.env.RONIN_INSPECTOR_URL || 'http://127.0.0.1:9229/json';
const seconds = Number(process.argv[2] || 6);
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
await call('Profiler.enable');
await call('Profiler.setSamplingInterval', { interval: 1000 });
await call('Profiler.start');
await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
const { profile } = await call('Profiler.stop');
ws.close();
const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
const self = new Map();
const total = profile.samples.length;
for (const sample of profile.samples) {
  const frame = nodes.get(sample).callFrame;
  const key = `${frame.functionName || '(anon)'} ${frame.url.replace(`file://${process.cwd()}/`, '')}:${frame.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + 1);
}
console.log(`samples ${total} over ${seconds}s`);
for (const [key, value] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(String(Math.round(100 * value / total)).padStart(3), '%', key);
}
const parent = new Map();
for (const node of profile.nodes) for (const child of node.children || []) parent.set(child, node.id);
const byFile = new Map();
for (const sample of profile.samples) {
  const seen = new Set();
  let current = sample;
  while (current) {
    const file = nodes.get(current).callFrame.url.replace(`file://${process.cwd()}/`, '');
    if (file && !seen.has(file)) {
      seen.add(file);
      byFile.set(file, (byFile.get(file) || 0) + 1);
    }
    current = parent.get(current);
  }
}
console.log('--- inclusive by file');
for (const [file, value] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(String(Math.round(100 * value / total)).padStart(3), '%', file);
}
