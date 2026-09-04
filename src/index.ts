import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { config, authEnabled, assertBindIsSafe } from './machine-settings.js';
import {
  COOKIE,
  SESSION_TTL_MS,
  authRecord,
  checkToken,
  cookieToken,
  loginAllowed,
  loginFailed,
  loginSucceeded,
  makeToken,
  passwordAuthEnabled,
  verifyRecord,
} from './auth.js';
import { cleanupViewers, listSessions } from './tmux.js';
import { publishRoninUrl } from './operator-url.js';
import { publishMax, publishOwner } from './machine-state.js';
import { registerCatalogs } from './routes/catalogs.js';
import { registerLaunch } from './routes/launch.js';
import { registerPasskeyLogin, registerPasskeyManage } from './routes/passkey-api.js';
import { registerSessions } from './routes/sessions-api.js';
import { registerTeams } from './routes/teams-api.js';
import { registerDocs } from './routes/docs-api.js';
import { registerDesks } from './routes/desks-api.js';
import { registerTeamPage } from './routes/team-page-api.js';
import { startTomodachiSender } from './activation/tomodachi.js';
import { registerServicesActivation, resumeInstallWatch } from './routes/services-activation-api.js';
import { registerMachineSettings } from './routes/machine-settings-api.js';
import { registerCampaigns } from './routes/campaigns-api.js';
import { ensureInitialCampaign } from './campaigns.js';
import { migrateCampaignScope } from './campaign-scope.js';
import { stampFreshInstall } from './machine-state.js';
import { registerUpdate } from './routes/update-api.js';
import { registerLibrary } from './routes/library-api.js';
import { registerJikan, startHouseJikan } from './routes/jikan-api.js';
import { registerInstalled } from './routes/installed-api.js';
import { registerVersion } from './routes/version.js';
import { registerWipeboards } from './routes/wipeboards-api.js';
import { registerMessages } from './routes/messages-api.js';
import { registerCli } from './routes/cli-api.js';
import { startMessageQueue } from './message-queue.js';
import { seedHouseBoard } from './wipeboards.js';
import { handleEvents, startSessionsBroadcast } from './ws/events.js';
import { handlePty } from './ws/pty.js';
import { originAllowed, allowedOrigins } from './ws/origin.js';
import { checkTmuxServerCgroup } from './host-guard.js';
import { sockets, startBootHooks, stopBootHooks, mountServiceRoutes, noteService, noteServiceFailure, noteServiceParked } from './sockets.js';
import { discoverParts, partsToLoad } from './parts.js';
import { initialCampaign } from './campaigns.js';
import { listRoutines } from './resource-adapters.js';
import type { ServiceRegistration } from './sockets-contract.js';
import { resourceRequestCache } from './resources.js';
import { compressResponse } from './http-performance.js';
import { roninIdentity } from './routes/version.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const NM = path.join(ROOT, 'node_modules');
const isEntryPoint = !!process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
const isBoxInstance = isEntryPoint
  && process.env.NODE_ENV === 'production'
  && process.env.RONIN_TEST_RUNNER !== '1';

const app = express();
app.use(compressResponse);
app.use(express.json());
const cliToken = randomBytes(32).toString('base64url');

function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function checkBasic(header?: string): boolean {
  if (!authEnabled) return false;
  if (!header?.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  const u = decoded.slice(0, i);
  const p = decoded.slice(i + 1);
  const okUser = sameSecret(u, config.user);
  const okPass = sameSecret(p, config.pass);
  return okUser && okPass;
}

function checkAuth(headers: { authorization?: string; cookie?: string }): boolean {
  if (headers.authorization?.startsWith('Bearer ') && sameSecret(headers.authorization.slice(7), cliToken)) return true;
  if (!authEnabled && !passwordAuthEnabled()) return true;
  if (checkBasic(headers.authorization)) return true;
  const rec = authRecord();
  return !!rec && checkToken(rec.secret, cookieToken(headers.cookie));
}

function issueSession(res: express.Response): boolean {
  const rec = authRecord();
  if (!rec) return false;
  res.cookie(COOKIE, makeToken(rec.secret, SESSION_TTL_MS), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
  return true;
}

app.get('/login', (_req, res) => res.sendFile(path.join(PUBLIC, 'login.html')));
registerPasskeyLogin(app, issueSession); // /api/passkey/{options,login,recover} — src/routes/passkey-api.ts
app.post('/api/login', async (req, res) => {
  const rec = authRecord();
  if (!rec) return res.status(404).json({ error: 'No password is set on this install — see bin/ronin-passwd.' });
  const addr = req.socket.remoteAddress ?? '?';
  if (!loginAllowed(addr)) return res.status(429).json({ error: 'Too many attempts — wait a minute.' });
  const pw = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!(await verifyRecord(rec, pw))) {
    loginFailed(addr);
    return res.status(401).json({ error: 'Wrong password.' });
  }
  loginSucceeded(addr);
  issueSession(res);
  res.json({ ok: true });
});
app.post('/api/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.use('/brand', express.static(path.join(PUBLIC, 'brand')));

app.use((req, res, next) => {
  if (checkAuth(req.headers)) return next();
  if (passwordAuthEnabled() && req.method === 'GET' && req.accepts(['json', 'html']) === 'html') {
    return res.redirect('/login');
  }
  if (authEnabled) res.set('WWW-Authenticate', 'Basic realm="tmux-ronin"');
  res.status(401).send('Authentication required.');
});

app.get('/vendor/xterm.css', (_req, res) => res.sendFile(path.join(NM, '@xterm/xterm/css/xterm.css')));
app.get('/vendor/xterm.js', (_req, res) => res.sendFile(path.join(NM, '@xterm/xterm/lib/xterm.js')));
app.get('/vendor/addon-fit.js', (_req, res) => res.sendFile(path.join(NM, '@xterm/addon-fit/lib/addon-fit.js')));

const assetVersion = roninIdentity().commit.replace(/[^A-Za-z0-9._-]/g, '_');
const indexHtml = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8').replaceAll('__RONIN_ASSET_VERSION__', assetVersion);
const sendIndex = (_req: express.Request, res: express.Response) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(indexHtml);
};
app.get('/', sendIndex);
app.get('/index.html', sendIndex);
app.get('/cowork-setup', sendIndex);
app.use(`/${assetVersion}`, express.static(PUBLIC, { immutable: true, maxAge: '1y', index: false }));

const noCacheClient = (res: express.Response, filePath: string) => {
  if (/\.(?:html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
};

const STAGING = process.env.RONIN_STAGING_DIR ?? path.join(ROOT, 'public-staging');
if (fs.existsSync(STAGING)) {
  app.use('/staging', express.static(STAGING, { setHeaders: noCacheClient }));
  console.log(`[tmux-ronin] staging client at /staging/  (from ${STAGING})`);
}

app.use(express.static(PUBLIC, { setHeaders: noCacheClient }));

app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api', resourceRequestCache);

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    auth: authEnabled,
    login: passwordAuthEnabled(),
    transcribe: Boolean(config.scribeUrl),
  }),
);

registerPasskeyManage(app); // /api/passkey/{list,register-options,register,remove} — BEHIND the gate on purpose
registerLaunch(app); // /api/launch (both variants), /api/sessions, /api/home, session-max, owner — src/routes/launch.ts
registerCatalogs(app); // /api/macros, /api/hotwords*, /api/project-roots*, /api/session-launch-specs, /api/role-families*, /api/session-roles, /api/team-roles, /api/launch-profile — src/routes/catalogs.ts
registerDocs(app); // /api/docs?shelf=plans|docs — the ▧ Docs tab's shelves — src/routes/docs-api.ts
registerTeams(app); // /api/team-rosters* — the durable half of every team — src/routes/teams-api.ts
registerDesks(app); // /api/sessions/:name/desks, /api/teams/:name/desks — derived desk state, the control surface's visible half — src/routes/desks-api.ts
registerTeamPage(app); // /api/teams/:team/page — the team page's view, and drafts an agent hands it — src/routes/team-page-api.ts
registerVersion(app); // /api/version — release string, or the commit this process started from — src/routes/version.ts
registerUpdate(app); // /api/update/* — the ⚙ gear's check + run, press-only — src/routes/update-api.ts
registerLibrary(app); // /api/library* — the template library: index and bundles off the site on a press, install into the owner's stores — src/routes/library-api.ts
registerMachineSettings(app); // /api/machine-settings — the install record, and writes BY NAME only — src/routes/machine-settings-api.ts
registerCampaigns(app); // /api/campaigns* — the durable record of each body of work — src/routes/campaigns-api.ts
startTomodachiSender(); // AGERU's weekly packet actually leaves here — src/activation/tomodachi.ts
registerInstalled(app); // /api/installed — what is on this machine: installed · activated · switched, one answer — src/routes/installed-api.ts
registerJikan(app); // /api/teams/:team/jikan* — JIKAN, the Cron jobs tab: a team's scheduled requests — src/routes/jikan-api.ts
startHouseJikan(); // JIKAN's clock: every minute, deliver what is due through the message door — src/jikan.ts
registerServicesActivation(app); // /api/services/activation* — the Ronin Services request, local-only; no secret crosses this surface — src/routes/services-activation-api.ts
void stampFreshInstall();

void ensureInitialCampaign()
  .then(() => migrateCampaignScope())
  .catch(() => {});

const services: ServiceRegistration[] = [];
// The parts on disk are the install; the Campaign's Routine switches say which of them run.
// A part claimed by a Routine that is off is parked: not imported, no timers, no routes,
// no recorder — as if not installed, files in place (src/parts.ts). Read once, at start.
const plan = partsToLoad(
  discoverParts(),
  await listRoutines().catch(() => []),
  (await initialCampaign().catch(() => null))?.config?.agent_defaults?.routines ?? {},
);
for (const parked of plan.parked) {
  console.log(`[services] ${parked.name} is parked: ${parked.routine} is off for this Campaign (restart after switching it on)`);
  noteServiceParked(parked.name, parked.routine);
}
for (const { name: dir, entry } of plan.load) {
  try {
    const mod = await import(pathToFileURL(entry).href);
    if (typeof mod.register !== 'function') throw new Error('no register() export');
    services.push({ name: typeof mod.name === 'string' ? mod.name : dir, register: mod.register });
  } catch (e) {
    console.error(`[services] ${dir} failed to load and is OFF: ${(e as Error).message}`);
    noteServiceFailure(dir, (e as Error).message);
  }
}
for (const s of services) {
  noteService(s.name); // the roster /api/version reports, so the client's SWITCH knows
  s.register(sockets);
}
mountServiceRoutes(app);

void resumeInstallWatch();

registerSessions(app); // per-session: kill/harakiri, meta, dials, ctx, tegami, send — src/routes/sessions-api.ts
registerWipeboards(app); // /api/wipeboards* — src/routes/wipeboards-api.ts
registerMessages(app); // /api/messages* — durable inbound session delivery
registerCli(app); // /api/cli/:tool — command-line faces of operator verbs
startMessageQueue();

app.get('/api/file', async (req, res) => {
  const file = String(req.query.path ?? '');
  if (!file.startsWith('/')) return res.status(400).json({ error: 'An absolute path is required.' });
  try {
    const text = await fs.promises.readFile(file, 'utf8');
    res.json({ path: file, text });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT' || code === 'EISDIR') return res.status(404).json({ error: 'No such file.' });
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});

app.put('/api/file', express.text({ type: '*/*', limit: '8mb' }), async (req, res) => {
  const file = String(req.query.path ?? '');
  if (!file.startsWith('/')) return res.status(400).json({ error: 'An absolute path is required.' });
  const text = typeof req.body === 'string' ? req.body : '';
  try {
    await fs.promises.access(file);
    await fs.promises.writeFile(file, text, 'utf8');
    res.json({ ok: true, bytes: Buffer.byteLength(text) });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return res.status(404).json({ error: 'No such file — it moved or was deleted.' });
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});

app.get('/raw/*', (req, res) => {
  const file = '/' + String((req.params as Record<string, string>)[0] ?? '');
  res.sendFile(file, { dotfiles: 'allow', headers: { 'Cache-Control': 'no-store' } }, (e) => {
    if (!e || res.headersSent) return;
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT' || code === 'EISDIR') return res.status(404).json({ error: 'No such file.' });
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  });
});

const server = createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: {
    threshold: 4096, // don't pay the CPU on the small live repaints
    zlibDeflateOptions: { level: 6 },
  },
});

server.on('upgrade', (req, socket, head) => {
  if (!checkAuth(req.headers)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="tmux-ronin"\r\n\r\n');
    socket.destroy();
    return;
  }
  if (!originAllowed(req.headers.origin, req.headers.host)) {
    console.warn(`[tmux-ronin] refused a socket from origin ${req.headers.origin}`);
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/events') {
    wss.handleUpgrade(req, socket, head, (ws) => handleEvents(ws));
    return;
  }
  if (url.pathname !== '/pty') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    handlePty(ws, url).catch((e) => {
      try {
        ws.send(JSON.stringify({ t: 'error', m: String((e as Error)?.message ?? e) }));
        ws.close();
      } catch {
      }
    });
  });
});

async function startBox(): Promise<void> {
try {
  assertBindIsSafe(passwordAuthEnabled());
} catch (e) {
  console.error(`[tmux-ronin] ${(e as Error).message}`);
  process.exit(1);
}

await checkTmuxServerCgroup(); // loud if our own restart would kill every session
const removed = await cleanupViewers();
if (removed) console.log(`[tmux-ronin] cleaned up ${removed} stale viewer session(s)`);
await startBootHooks();
startSessionsBroadcast(); // the /events membership poll, on the same boot clock as before
void seedHouseBoard().catch((e) => console.error('[tmux-ronin] house board seed failed:', e));

void publishMax();
void publishOwner();

server.listen(config.port, config.bind, async () => {
  if (isBoxInstance) {
    try {
      await publishRoninUrl(`http://${config.bind}:${config.port}`, cliToken);
    } catch (e) {
      console.error(`[tmux-ronin] could not publish @ronin-url: ${String((e as Error).message ?? e)}. Agent tools require RONIN_URL until this is fixed.`);
    }
  }
  console.log(
    `[tmux-ronin] listening on http://${config.bind}:${config.port}  (basic auth: ${authEnabled ? 'ON' : 'off'}, login: ${passwordAuthEnabled() ? 'ON' : 'off'}, window-size: ${config.windowSize})`,
  );
  console.log(`[tmux-ronin] browser sockets accepted from: ${allowedOrigins().join(', ')}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopBootHooks();
    setTimeout(() => process.exit(0), 2000).unref();
    void Promise.allSettled([cleanupViewers()]).finally(() => process.exit(0));
  });
}
}

if (isEntryPoint) await startBox();
