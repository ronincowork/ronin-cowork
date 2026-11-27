#!/usr/bin/env node
// Explicit browser diagnostic. Static fixture + mocked HTTP only; never touches tmux.
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { loadPlaywright } from './lib/ui-host.mjs';
const pw = await loadPlaywright();
if (!pw) throw new Error('Playwright unavailable; see docs/host-tools.md');
const app = express(); app.use(express.json());
app.get('/vendor/xterm.js', (_req,res)=>res.sendFile(new URL('../node_modules/@xterm/xterm/lib/xterm.js',import.meta.url).pathname));
app.get('/vendor/addon-fit.js', (_req,res)=>res.sendFile(new URL('../node_modules/@xterm/addon-fit/lib/addon-fit.js',import.meta.url).pathname));
app.get('/vendor/xterm.css', (_req,res)=>res.sendFile(new URL('../node_modules/@xterm/xterm/css/xterm.css',import.meta.url).pathname));
let bindings;
const defaults = { clear: 'Ctrl+Shift+Backspace', close: 'Ctrl+Shift+X', stop: 'Escape' };
let calls = [];
app.get('/api/terminal-controls', (_req, res) => res.json({ bindings, defaults }));
app.put('/api/terminal-controls', (req, res) => { bindings = req.body.bindings; res.json({ bindings, defaults }); });
app.post('/api/sessions/:name/control-action', (req, res) => { calls.push(req.body); res.json({ ok: true }); });
app.get('/', (_req, res) => res.type('html').send(`<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/vendor/xterm.css"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/workspace-kit.css">
<style>body{display:block;padding:12px}#target{height:380px;display:flex;flex-direction:column}.body{flex:1;min-height:0}.selector{height:350px;width:320px}.tile{height:380px}</style>
</head><body ${_req.query.mobile ? 'id="phone"' : ''}><div id="target" class="tile keys-on"><div class="body tile-body"></div></div><div class="selector wk-workbench-selector"><div class="wk-workbench-selector-cards"></div></div>
<script src="/vendor/xterm.js"></script><script src="/vendor/addon-fit.js"></script>
<script type="module">
import { TermView } from '/js/termview.js';
import { buildComposer } from '/js/composer.js';
import { buildKeysRow } from '/js/keysrow.js';
import { installTileControls, runTerminalAction, buildHints, loadTerminalControls, buildMobileControlButtons } from '/js/terminal-controls.js';
import { retireSession } from '/js/session-retire.js';
import { S, tiles } from '/js/state.js';
window.raw = [];
const el = document.querySelector('#target');
const tile = { el, body: el.querySelector('.body'), session: 'fixture', sessionKey: 'birth', retirementId: 'fixture', pending: '', renderPending(){}, kill(){retireSession(this.session,this.retirementId,()=>{})}, controlAction(a,t){return runTerminalAction(this,a,t)} };
tile.term = new TermView(tile.body,{onUserData:d=>raw.push(d),onProtocolData(){},onResize(){},onSelection:s=>tile.lastSelection=s});
new ResizeObserver(()=>tile.term.fit(false)).observe(tile.body);
installTileControls(tile);
tile.term.wireCopyHint({isLocked:()=>true,overHome:()=>false});
tile.composer = buildComposer(tile.body,{activate(){},clearOverlays(){},connected:()=>true,send:d=>raw.push(d),sendMessage:async()=>({ok:true}),scrollToBottom(){}});
Object.defineProperty(tile,'composerTa',{get:()=>tile.composer.ta});
tile.composer.show(true);
if(document.getElementById('phone')) tile.composer.el.prepend(buildKeysRow({controls:buildMobileControlButtons(tile),sendRaw:d=>raw.push(d),latest(){}}).el);
S.sessions=[{name:'fixture',key:'birth',agent:'codex'}];S.active=tile;tiles.push(tile);
const cards=document.querySelector('.wk-workbench-selector-cards');
for(let i=0;i<40;i++){const p=document.createElement('p');p.textContent='Agent '+i;cards.append(p)}
if(!document.getElementById('phone')) document.querySelector('.selector').append(buildHints());
await loadTerminalControls();tile.term.write('COPY SNAPSHOT CONTENT');
window.tile=tile;window.ready=true;
</script></body></html>`));
app.use(express.static(new URL('../public', import.meta.url).pathname));
const server = createServer(app); await new Promise(r => server.listen(0, '127.0.0.1', r));
try {
  for (const profile of ['desktop', 'mac', 'mobile touch']) {
    const mobile = profile === 'mobile touch';
    const mac = profile === 'mac';
    bindings = { ...defaults }; calls = [];
    const browser = await pw.chromium.launch({ headless: true });
    try {
      const context = await browser.newContext(mobile ? { ...pw.devices['Pixel 7'] } : { viewport: { width: 1200, height: 900 } });
      if (mac) await context.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
      const page = await context.newPage(); const errors=[]; page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
      await page.goto(`http://127.0.0.1:${server.address().port}/${mobile ? '?mobile=1' : ''}`);
      await page.waitForFunction(()=>window.ready);
      assert.equal(await page.locator('.terminal-hints').count(),mobile ? 0 : 1);
      if (mobile) {
        const assertOutputAboveControls = async () => {
          await page.waitForFunction(() => {
            const screen = tile.body.querySelector('.xterm-screen').getBoundingClientRect();
            const controls = tile.composer.el.getBoundingClientRect();
            return screen.height > 0 && screen.bottom <= controls.top + 1;
          }, null, { timeout: 5000 });
        };
        await assertOutputAboveControls();
        await page.locator('.composer textarea').fill('one\ntwo\nthree\nfour\nfive');
        await assertOutputAboveControls();
        // Emulate iOS visual-viewport keyboard coverage without changing layout height.
        await page.evaluate(() => {
          Object.defineProperty(visualViewport, 'height', { configurable:true, value:innerHeight - 100 });
          visualViewport.dispatchEvent(new Event('resize'));
        });
        await assertOutputAboveControls();
        await page.evaluate(() => {
          tile.el.classList.add('tape-on');
          const tape = document.createElement('div'); tape.className = 'tape';
          tape.innerHTML = '<div style="height:1200px"></div><div id="last-output">Last Agent message</div>';
          tile.body.append(tape);
        });
        await page.waitForFunction(() => {
          const tape=tile.body.querySelector('.tape'); tape.scrollTop=tape.scrollHeight;
          return tape.querySelector('#last-output').getBoundingClientRect().bottom <= tile.composer.el.getBoundingClientRect().top;
        });
        await page.evaluate(() => {
          tile.el.classList.remove('tape-on');
          tile.body.querySelector('.tape').remove();
          delete visualViewport.height;
          visualViewport.dispatchEvent(new Event('resize'));
        });
        await page.locator('.composer textarea').fill('');
        await assertOutputAboveControls();
      }

      if (!mobile) {
      assert.equal(await page.locator('.session-control-hints').getAttribute('open'), '');
      assert.equal(await page.locator('.agent-vocabulary-hints').getAttribute('open'), '');
      assert.equal(await page.locator('.agent-vocabulary-hints .terminal-hint-row').count(), 10);
      assert.match(await page.locator('.agent-vocabulary-hints').innerText(), /Fork it\s+Create a Ronin Agent for a topic/);
      await page.locator('.agent-vocabulary-hints summary').click();
      assert.equal(await page.locator('.session-control-hints').getAttribute('open'), '');
      const before = await page.locator('.terminal-hints').boundingBox();
      await page.locator('.wk-workbench-selector-cards').evaluate(el=>el.scrollTop=el.scrollHeight);
      assert.equal((await page.locator('.terminal-hints').boundingBox()).y,before.y);
      await page.locator('.session-control-hints summary').click();
      assert.equal(await page.locator('.session-control-hints').getAttribute('open'), null);
      await page.waitForFunction(()=>localStorage.getItem('ronin.hints.collapsed')==='yes');
      await page.locator('.wk-workbench-selector-cards').evaluate(el=>el.hidden=true);
      assert.equal(await page.locator('.session-control-hints').getAttribute('open'), null);
      await page.locator('.session-control-hints summary').click();
      assert.equal(await page.locator('.session-control-hints').getAttribute('open'), '');
      assert.equal(await page.locator('.wk-workbench-selector-cards').evaluate(el=>el.hidden), true);
      await page.locator('.wk-workbench-selector-cards').evaluate(el=>el.hidden=false);
      await page.locator('.session-control-hints summary').click();
      await page.waitForFunction(()=>localStorage.getItem('ronin.hints.collapsed')==='yes');
      await page.reload();
      await page.waitForFunction(()=>window.ready);
      assert.equal(await page.locator('.session-control-hints').getAttribute('open'), null);
      assert.equal(await page.locator('.agent-vocabulary-hints').getAttribute('open'), null);
      await page.locator('.agent-vocabulary-hints summary').click();
      await page.locator('.session-control-hints summary').click();
      assert.match(await page.locator('.terminal-hints').innerText(), mobile ? /Tap Copy to select text/ : mac ? /Option-drag to select/ : /Shift-drag to select/);
      }
      if (!mobile) {
        await page.evaluate(()=>{tile.term.term.select(0,0,4);tile.term.focus()});
        await page.keyboard.press(mac ? 'Meta+c' : 'Control+c');
        assert.equal(await page.locator('.ui-sheet.open').count(),0);
        assert.deepEqual(await page.evaluate(()=>raw),[]);
        await page.evaluate(()=>{tile.term.term.clearSelection();tile.lastSelection=''});
      }
      if (!mobile) {
        await page.locator('.agent-vocabulary-hints summary').click();
        await page.locator('.session-control-hints summary').click();
        await page.locator('.xterm-screen').evaluate(el=>el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,clientX:5,clientY:5})));
        await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{clientX:40,clientY:40})));
        assert.equal(await page.locator('.session-control-hints').getAttribute('open'),'');
        assert.equal(await page.locator('.session-control-hints').evaluate(el=>el.getAnimations().some(a=>a.id==='selection-hint')),true);
        assert.equal(await page.locator('.copyhint').count(),0);
        assert.equal(await page.locator('.agent-vocabulary-hints').getAttribute('open'),null);
      }
      await page.locator('.composer textarea').fill('unfinished\nsecond line');
      assert.equal(await page.locator('.terminal-actions').count(),0);
      assert.equal(await page.locator('.keysrow [data-terminal-action]').count(),mobile ? 4 : 0);
      if (!mobile) {
      assert.equal(await page.locator('.terminal-hint-row button, .terminal-hint-row small').count(),0);
      assert.equal(await page.locator('.session-control-hints .terminal-hint-row strong').count(),4);
      assert.equal(await page.locator('.session-control-hints summary').textContent(),'Session controls');
      const hintFonts = await page.locator('.terminal-hint-row span').evaluateAll(nodes=>nodes.map(el=>{const s=getComputedStyle(el);return s.fontFamily+' / '+s.fontSize}));
      assert.equal(new Set(hintFonts).size,1);
      await page.locator('.agent-vocabulary-hints summary').click();
      for (const width of ['160px','120px']) {
        await page.locator('.selector').evaluate((el,w)=>el.style.width=w,width);
        assert.equal(await page.locator('.terminal-hints').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
        assert.equal(await page.locator('.terminal-hint-row span').evaluateAll(nodes=>nodes.every(el=>el.scrollWidth<=el.clientWidth)),true);
        assert.equal(await page.locator('[data-control-key="clear"]').evaluate(el=>{
          const word=[...el.childNodes].find(n=>n.textContent==='Backspace');
          const range=document.createRange();range.selectNodeContents(word);
          return range.getClientRects().length;
        }),1);
      }
      await page.locator('.selector').evaluate(el=>el.style.width='320px');
      assert.equal(await page.locator('.session-control-hints summary').evaluate(el=>el.getBoundingClientRect().bottom <= el.closest('.terminal-hints').getBoundingClientRect().bottom),true);
      assert.equal(await page.locator('.terminal-hint-row strong').first().evaluate(el=>getComputedStyle(el).fontWeight),'700');
      assert.equal(await page.locator('.terminal-hints').evaluate(el=>getComputedStyle(el).fontSize),await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--text-body').trim()));
      }
      if (mobile) await page.locator('.keysrow [data-terminal-action]').filter({hasText:/^Clear$/}).click();
      else await page.locator('.composer textarea').press('Control+Shift+Backspace');
      assert.equal(await page.locator('.composer textarea').inputValue(),''); assert.equal(calls.length,0);
      assert.equal(await page.locator('#toast.show').count(),0);
      await page.locator('.composer textarea').fill('keep me');
      const stopResponse = page.waitForResponse(r=>r.url().endsWith('/control-action') && r.request().postDataJSON()?.intent==='stop');
      if (mobile) await page.locator('.keysrow [data-terminal-action]').filter({hasText:/^Stop$/}).click();
      else await page.locator('.composer textarea').press('Escape');
      await stopResponse;
      assert.equal(await page.locator('#toast.show').count(),0);
      assert.equal(calls.at(-1).intent,'stop'); assert.equal(await page.locator('.composer textarea').inputValue(),'keep me');
      if (!mobile) {
        await page.evaluate(()=>tile.term.focus()); await page.keyboard.press('Control+c');
        assert.equal(await page.locator('.ui-sheet.open').count(),0);
        assert.deepEqual(await page.evaluate(()=>raw),[]);
        await page.keyboard.press('Control+Shift+x');
        await page.locator('.ui-sheet.open').waitFor();
        await page.evaluate(()=>tile.term.focus()); await page.keyboard.press('Control+c');
        assert.deepEqual(await page.evaluate(()=>raw),[]);
        assert.equal(await page.locator('.ui-sheet.open').count(),1);
        const n=calls.length; await page.evaluate(()=>tile.term.focus()); await page.keyboard.press('Escape');
        assert.equal(await page.locator('.ui-sheet.open').count(),0);assert.equal(calls.length,n);
        await page.evaluate(()=>tile.term.focus());await page.keyboard.press('Escape');
        await page.waitForTimeout(150);assert.equal(calls.length,n+1);
        assert.deepEqual(await page.evaluate(()=>raw),[]);
      }
      if (mobile) {
      await page.locator('.keysrow [data-terminal-action]').filter({hasText:/^Copy$/}).click();
      assert.match(await page.locator('.terminal-copy-text').inputValue(),/COPY SNAPSHOT CONTENT/);
      await page.locator('.ui-sheet.open button').filter({hasText:'Done'}).click();
      }
      assert.equal(await page.locator('.terminal-hints button, .terminal-hints a').count(),0);
      await page.evaluate(async()=>{
        const {loadTerminalControls}=await import('/js/terminal-controls.js');
        const result=await (await fetch('/api/terminal-controls')).json();
        result.bindings.close='Ctrl+X';
        await fetch('/api/terminal-controls',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({bindings:result.bindings})});
        await loadTerminalControls();
      });
      if (!mobile) assert.equal(await page.locator('[data-control-key="close"]').textContent(),'Ctrl+X');
      if (!mobile) {
        await page.locator('.selector').evaluate(el=>el.style.height='750px');
        await page.locator('.agent-vocabulary-hints').evaluate(el=>el.scrollTop=0);
      }
      await page.locator(mobile ? '.composer' : '.terminal-hints').screenshot({path:`/tmp/hints-polish-${profile}.png`});
      assert.deepEqual(errors,[]);
      console.log(`${profile}: controls, draft, Copy snapshot, Hints, mobile output clearance and remapping passed`);
    } finally { await browser.close(); }
  }
} finally { await new Promise(r=>server.close(r)); }
