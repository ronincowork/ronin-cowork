#!/usr/bin/env node
import WebSocket from 'ws';

const inspector = process.env.RONIN_INSPECTOR_URL || 'http://127.0.0.1:9229/json';
const seconds = Number(process.argv[2] || 15);
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
  const server = process._getActiveHandles().find((handle) => handle.constructor?.name === 'Server');
  if (!server) throw new Error('HTTP server handle not found');
  const requests = {}; let upgrades = 0;
  const onRequest = (request) => { const key = request.url.split('?')[0].replace(/\\/[0-9a-f]{7,}\\//, '/<v>/'); requests[key] = (requests[key] || 0) + 1; };
  const onUpgrade = () => upgrades++;
  server.on('request', onRequest); server.on('upgrade', onUpgrade);
  await new Promise((resolve) => setTimeout(resolve, ${seconds * 1000}));
  server.off('request', onRequest); server.off('upgrade', onUpgrade);
  return JSON.stringify({ seconds: ${seconds}, upgrades, requests: Object.fromEntries(Object.entries(requests).sort((a, b) => b[1] - a[1])) });
})()`;
const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
console.log(result?.result?.value ?? JSON.stringify(result));
ws.close();
