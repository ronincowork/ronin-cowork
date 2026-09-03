#!/usr/bin/env node
import WebSocket from 'ws';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || '3006';
const BASE = `http://${HOST}:${PORT}`;
const NAME = `grtest_${Math.floor(Math.random() * 1e6)}`;
const MARKER = `GRID_OK_${Math.floor(Math.random() * 1e9)}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
function ok(label) {
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}
function bad(label, detail) {
  failed = true;
  console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  console.log(`\nsmoke test against ${BASE} (session ${NAME})\n`);

  try {
    const h = await (await fetch(`${BASE}/api/health`)).json();
    h.ok ? ok('health endpoint') : bad('health endpoint', JSON.stringify(h));
  } catch (e) {
    bad('health endpoint (is the server up?)', e.message);
    return finish();
  }

  const c = await fetch(`${BASE}/api/launch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: NAME }),
  });
  c.ok ? ok('create session') : bad('create session', `HTTP ${c.status}`);

  const list = await (await fetch(`${BASE}/api/sessions`)).json();
  Array.isArray(list) && list.some((s) => s.name === NAME)
    ? ok('session appears in list')
    : bad('session appears in list', JSON.stringify(list));

  await new Promise((resolve) => {
    const ws = new WebSocket(`ws://${HOST}:${PORT}/pty?session=${NAME}&cols=80&rows=24`);
    ws.binaryType = 'arraybuffer';
    let buf = '';
    let sawReady = false;
    let pipeOk = false;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      try {
        ws.close();
      } catch (_) {}
      resolve();
    };
    const fail = (detail) => {
      bad(pipeOk ? 'float history fetch' : 'websocket pipe', detail);
      done();
    };
    const timer = setTimeout(() => fail(`timed out in 8s; got ${buf.length}b`), 8000);

    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        try {
          const m = JSON.parse(data.toString());
          if (m.t === 'ready') {
            sawReady = true;
            setTimeout(() => ws.send(JSON.stringify({ t: 'i', d: `echo ${MARKER}\r` })), 300);
          } else if (m.t === 'hist') {
            clearTimeout(timer);
            typeof m.d === 'string' && m.d.includes(MARKER)
              ? ok('float history fetch returns pane text')
              : bad('float history fetch', `marker missing in ${String(m.d).length}b capture`);
            done();
          }
        } catch (_) {}
        return;
      }
      buf += Buffer.from(data).toString('utf8');
      const count = buf.split(MARKER).length - 1;
      if (count >= 2 && !pipeOk) {
        pipeOk = true;
        ok('websocket pipe echoes typed command');
        setTimeout(() => ws.send(JSON.stringify({ t: 'hist', n: 500 })), 300);
      }
    });
    ws.on('error', (e) => {
      clearTimeout(timer);
      fail(e.message);
    });
    ws.on('close', () => {
      if (!finished) {
        clearTimeout(timer);
        fail(sawReady ? 'closed early' : 'closed before ready');
      }
    });
  });

  const M2 = `V2_${Math.floor(Math.random() * 1e9)}`;
  await (async function tapeStep() {
    for (let attempt = 1; ; attempt++) {
      const verdict = await new Promise((resolve) => {
        const ws = new WebSocket(`ws://${HOST}:${PORT}/pty?session=${NAME}&cols=80&rows=24&mode=stream`);
        let text = '';
        let finished = false;
        const done = (v) => {
          if (finished) return;
          finished = true;
          try {
            ws.close();
          } catch (_) {}
          resolve(v);
        };
        const timer = setTimeout(() => done({ bad: `marker not seen in 10s; got ${text.length} chars` }), 10000);
        ws.on('message', (data, isBinary) => {
          if (isBinary) return; // tape mode is JSON-only
          let m;
          try {
            m = JSON.parse(data.toString());
          } catch (_) {
            return;
          }
          if (m.t === 'error' && /no tape/.test(m.m || '')) {
            clearTimeout(timer);
            return done({ retry: m.m });
          }
          if (m.t === 'ready') {
            if (m.mode !== 'tape') {
              clearTimeout(timer);
              return done({ bad: `ready frame wrong: ${data}` });
            }
            setTimeout(() => ws.send(JSON.stringify({ t: 'i', d: `echo ${M2}\r` })), 500);
            return;
          }
          if (m.t === 'frame') text += '\n' + m.text;
          if (m.t === 'lines') text += '\n' + (m.recs || []).map((r) => r[1]).join('\n');
          if (text.includes(M2)) {
            clearTimeout(timer);
            done({});
          }
        });
        ws.on('error', (e) => {
          clearTimeout(timer);
          done({ bad: e.message });
        });
      });
      if (verdict.retry && attempt < 3) {
        await sleep(1500);
        continue;
      }
      const detail = verdict.bad || verdict.retry;
      detail ? bad('tape mode', detail) : ok('tape mode is ready, echoes typed input in the live frame');
      return;
    }
  })();

  try {
    const s = await fetch(`${BASE}/api/sessions/${NAME}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `echo SEND_${MARKER}` }),
    });
    const sd = await s.json().catch(() => ({}));
    s.ok && sd.ok && sd.started
      ? ok(`send-to-session submits and pane reacts${sd.resent ? ' (Enter re-sent)' : ''}`)
      : bad('send-to-session', `HTTP ${s.status} ${JSON.stringify(sd)}`);
  } catch (e) {
    bad('send-to-session', e.message);
  }

  const d = await fetch(`${BASE}/api/sessions/${NAME}`, { method: 'DELETE' });
  d.ok ? ok('delete session') : bad('delete session', `HTTP ${d.status}`);

  await sleep(200);
  finish();
}

function finish() {
  console.log('');
  if (failed) {
    console.log('\x1b[31mSMOKE TEST FAILED\x1b[0m\n');
    process.exit(1);
  }
  console.log('\x1b[32mSMOKE TEST PASSED\x1b[0m\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
