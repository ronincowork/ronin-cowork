import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-password-settings-'));
process.env.RONIN_CONFIG_DIR = path.join(root, 'config');

const { authStatus } = await import('../src/auth.js');
const { registerPasswordSettings } = await import('../src/routes/password-api.js');

type Handler = (req: any, res: any) => unknown;
const handlers = new Map<string, Handler>();
const app = {
  get(route: string, handler: Handler) { handlers.set(`GET ${route}`, handler); },
  put(route: string, handler: Handler) { handlers.set(`PUT ${route}`, handler); },
  delete(route: string, handler: Handler) { handlers.set(`DELETE ${route}`, handler); },
};
let sessions = 0;
registerPasswordSettings(app as never, () => { sessions += 1; return true; });

const call = async (method: string, body: Record<string, unknown> = {}) => {
  const reply = { status: 200, body: null as any, cleared: '',
    json(value: unknown) { this.body = value; return this; },
    clearCookie(name: string) { this.cleared = name; return this; },
  };
  const res = { ...reply, status(code: number) { this.status = code; return this; } } as any;
  // Avoid the property/method collision in the tiny Express response double.
  let statusCode = 200;
  res.status = (code: number) => { statusCode = code; return res; };
  await handlers.get(`${method} /api/password`)?.({ body }, res);
  return { status: statusCode, body: res.body, cleared: res.cleared };
};

test('browser password settings use the durable auth authority and keep the saving browser signed in', async () => {
  assert.deepEqual((await call('GET')).body, { required: false, basic: false });
  assert.equal((await call('PUT', { password: 'short', confirm: 'short' })).status, 400);
  assert.equal((await call('PUT', { password: 'long enough', confirm: 'different' })).status, 400);

  const enabled = await call('PUT', { password: 'long enough', confirm: 'long enough' });
  assert.deepEqual(enabled.body, { required: true, basic: false });
  assert.equal((await authStatus()).set, true);
  assert.equal(sessions, 1, 'the rotated secret issues the saving browser a replacement session');

  const disabled = await call('DELETE');
  assert.deepEqual(disabled.body, { required: false, basic: false });
  assert.equal(disabled.cleared, 'ronin_session');
  assert.equal((await authStatus()).set, false);
});

test('Setup and Settings register the same ERABI Password surface without a second implementation', async () => {
  const [surface, setupView, setupJourney, campaign, index, login] = await Promise.all([
    fs.readFile(new URL('../public/js/password-surface.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/js/setup-view.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/js/setup-journey.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/login.html', import.meta.url), 'utf8'),
  ]);
  assert.match(surface, /export const PASSWORD_SURFACE_TYPE = 'machine\.password'/);
  assert.match(surface, /ask\(\[\{[\s\S]*key: 'required'[\s\S]*switch:/, 'Require a password is an ERABI switch');
  assert.match(surface, /selector\.set\('required', saved\)/, 'the reading follows saved state, not an optimistic press');
  assert.match(surface, /method: 'PUT'[\s\S]*password: first\.value, confirm: second\.value/);
  assert.match(surface, /method: 'DELETE'/);
  assert.match(setupView, /registerPasswordSurface\(\)/);
  assert.match(setupJourney, /type: 'machine\.password'/);
  assert.match(campaign, /registerPasswordSurface\(\)[\s\S]*PASSWORD_SURFACE_TYPE/);
  assert.equal((surface.match(/createPasswordSurface/g) || []).length, 2,
    'one builder plus its one definition call; neither workbench forks the page');
  assert.ok(index.indexOf("app.use((req, res, next)") < index.indexOf('registerPasswordSettings(app, issueSession)'),
    'password mutation routes sit behind the existing authentication gate');
  assert.match(login, /Forgot the password\?[\s\S]*bin\/ronin-recovery/);
});
