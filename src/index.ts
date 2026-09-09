import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { config, authEnabled, assertBindIsSafe, bindSource } from './machine-settings.js';
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
import { bindOperatorSocket, isOperatorPeer, operatorSocketPath, SiblingAlive, type BoundOperatorSocket } from './operator-socket.js';
import { addressRefusal, EXIT_ADDRESS_UNUSABLE } from './bind-refusal.js';
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
import { measureAndRecordProviders } from './provider-summary.js';
import { migrateCampaignScope } from './campaign-scope.js';
import { registerUpdate } from './routes/update-api.js';
import { registerMachineRestart } from './routes/machine-restart-api.js';
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
import { tmux as tmuxClient } from './tmux-client.js';
import { handlePty } from './ws/pty.js';
import { originAllowed, allowedOrigins } from './ws/origin.js';
import { DocumentPathError, legacyDocumentPath, readDocumentFile, saveDocumentFile } from './document-file.js';
import { checkTmuxServerCgroup } from './host-guard.js';
import { sockets, startBootHooks, stopBootHooks, mountServiceRoutes, noteService, noteServiceFailure, noteServiceParked } from './sockets.js';
import { discoverParts, partsToLoad } from './parts.js';
import { initialCampaign } from './campaigns.js';
import { listRoutines } from './resource-adapters.js';
import type { ServiceRegistration } from './sockets-contract.js';
import { resourceRequestCache } from './resources.js';
import { compressResponse } from './http-performance.js';
import { roninIdentity } from './routes/version.js';
import { startSpawnBroker, stopSpawnBroker } from './spawn-broker.js';
import { ensureInstalledRoots } from './setup-runtime.js';
import { registerSetupRuntime } from './routes/setup-runtime-api.js';
import { registerMikaContext } from './mika-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const NM = path.join(ROOT, 'node_modules');
const isEntryPoint = !!process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
const isBoxInstance = isEntryPoint
  && process.env.NODE_ENV === 'production'
  && process.env.RONIN_TEST_RUNNER !== '1';
if (isEntryPoint) startSpawnBroker(); // before routes, services, caches, and server state make this process large

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
  // A peer on the operator's own socket is the user: the 0600 mode was the credential.
  if (isOperatorPeer(req) || checkAuth(req.headers)) return next();
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
const readDocument = (file: string) => fs.readFileSync(path.join(PUBLIC, file), 'utf8').replaceAll('__RONIN_ASSET_VERSION__', assetVersion);
const indexHtml = readDocument('index.html');
// THE MOBILE DOCUMENT. A phone downloads mobile.html — the bar, an empty list and
// js/phone.js — and never the desktop page, so the first frame it paints is the mobile bar:
// there is nothing else in that document to paint. The phone is read off the request, the
// way it has always been done: an iPhone says "iPhone", an Android phone says "Mobile". An
// iPad says it is a Mac and keeps the workbench, which is the rule for a coarse-but-wide
// screen. /m is always the mobile document and /index.html always the desktop one.
const mobileHtml = readDocument('mobile.html');
const PHONE_AGENT = /\b(?:iPhone|iPod)\b|\bAndroid\b.*\bMobile\b/;
const isPhone = (req: express.Request) => PHONE_AGENT.test(req.get('user-agent') ?? '');
const sendDocument = (html: string) => (_req: express.Request, res: express.Response) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(html);
};
const sendIndex = sendDocument(indexHtml);
const sendMobile = sendDocument(mobileHtml);
app.get('/', (req, res) => {
  res.setHeader('Vary', 'User-Agent'); // one address, two documents: a cache must never hand a phone the desktop
  (isPhone(req) ? sendMobile : sendIndex)(req, res);
});
app.get('/index.html', sendIndex);
app.get('/cowork-setup', (_req, res) => res.redirect(302, '/'));
app.get('/m', sendMobile);
app.get('/mobile.html', sendMobile);
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
const launchControl = registerLaunch(app); // /api/launch (both variants), /api/sessions, /api/home, session-max, owner — src/routes/launch.ts
registerMikaContext(app); // /api/mika/context/:tab — tiny tab-scoped wheres_waldo/show seam
registerCatalogs(app); // /api/macros, /api/hotwords*, /api/project-roots*, /api/provider-catalog, /api/role-families*, /api/session-roles, /api/team-roles, /api/launch-profile — src/routes/catalogs.ts
registerDocs(app); // /api/docs?shelf=plans|docs — the ▧ Docs tab's shelves — src/routes/docs-api.ts
registerTeams(app); // /api/team-rosters* — the durable half of every team — src/routes/teams-api.ts
registerDesks(app); // /api/sessions/:name/desks, /api/teams/:name/desks — derived desk state, the control surface's visible half — src/routes/desks-api.ts
registerTeamPage(app); // /api/teams/:team/page — the team page's view, and drafts an agent hands it — src/routes/team-page-api.ts
registerVersion(app); // /api/version — release string, or the commit this process started from — src/routes/version.ts
registerUpdate(app); // /api/update/* — the ⚙ gear's check + run, press-only — src/routes/update-api.ts
registerMachineRestart(app); // /api/machine/restart — the Setup Services Restart press; answers, then runs tejun-machine-restart — src/routes/machine-restart-api.ts
registerLibrary(app); // /api/library* — the template library: index and bundles off the site on a press, install into the owner's stores — src/routes/library-api.ts
registerMachineSettings(app); // /api/machine-settings — the install record, and writes BY NAME only — src/routes/machine-settings-api.ts
registerCampaigns(app); // /api/campaigns* — the durable record of each body of work — src/routes/campaigns-api.ts
startTomodachiSender(); // AGERU's weekly packet actually leaves here — src/activation/tomodachi.ts
registerInstalled(app); // /api/installed — what is on this machine: installed · activated · switched, one answer — src/routes/installed-api.ts
registerSetupRuntime(app); // /api/setup/runtime and provider login completion — explicit readiness facts for Ronin Setup
registerJikan(app); // /api/teams/:team/jikan* — JIKAN, the Cron jobs tab: a team's scheduled requests — src/routes/jikan-api.ts
startHouseJikan(); // JIKAN's clock: every minute, deliver what is due through the message door — src/jikan.ts
registerServicesActivation(app); // /api/services/activation* — the Ronin Services request, local-only; no secret crosses this surface — src/routes/services-activation-api.ts
if (isEntryPoint) void ensureInstalledRoots().catch((error) => console.error(`[setup] installed roots: ${(error as Error).message}`));

// The Campaign's dated provider facts are measured once at start, after the record exists
// and has migrated: the summary and the migration both read-modify-write the campaigns
// section, and side by side one of them would lose its write on a fresh install.
const campaignStart = ensureInitialCampaign()
  .then(() => migrateCampaignScope())
  .then(() => (isEntryPoint ? measureAndRecordProviders() : undefined))
  .catch((error) => console.error(`[setup] campaign start: ${(error as Error).message}`));

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
  console.log(`[services] ${parked.name} is parked: ${parked.reason ?? `${parked.routine} is off for this Campaign (restart after switching it on)`}`);
  noteServiceParked(parked.name, parked.routine, parked.reason);
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
  try {
    if (req.query.root) {
      const safe = await readDocumentFile(req.query.root, file);
      return res.json(safe);
    }
    const legacy = legacyDocumentPath(file);
    const text = await fs.promises.readFile(legacy, 'utf8');
    res.json({ path: legacy, text });
  } catch (e) {
    if (e instanceof DocumentPathError) return res.status(e.status).json({ error: e.message });
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT' || code === 'EISDIR') return res.status(404).json({ error: 'No such file.' });
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});

app.put('/api/file', express.text({ type: '*/*', limit: '8mb' }), async (req, res) => {
  const file = String(req.query.path ?? '');
  const text = typeof req.body === 'string' ? req.body : '';
  try {
    if (req.query.root) await saveDocumentFile(req.query.root, file, text);
    else {
      const legacy = legacyDocumentPath(file);
      await fs.promises.access(legacy);
      await fs.promises.writeFile(legacy, text, 'utf8');
    }
    res.json({ ok: true, bytes: Buffer.byteLength(text) });
  } catch (e) {
    if (e instanceof DocumentPathError) return res.status(e.status).json({ error: e.message });
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
// A listen failure is one message and exit 78 (EX_CONFIG): deploy/ronin.service names that
// status in RestartPreventExitStatus, because an address that is occupied or gone from
// this box does not come back on its own, and Restart=always would otherwise reprint the
// same diagnostic every RestartSec seconds for as long as the box is up. Registered here,
// beside the server it belongs to, so there is exactly one of these.
server.on('error', (e: NodeJS.ErrnoException) => {
  const lines = addressRefusal({
    bind: config.bind, port: config.port, envPath: path.join(ROOT, '.env'),
    bindSource, code: e.code, message: e.message,
  });
  for (const line of lines) console.error(`[tmux-ronin] ${line}`);
  process.exit(EXIT_ADDRESS_UNUSABLE);
});
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
await tmuxClient.connect(); // only the long-lived server opts into control mode
const removed = await cleanupViewers();
if (removed) console.log(`[tmux-ronin] cleaned up ${removed} stale viewer session(s)`);
await startBootHooks();
startSessionsBroadcast(); // the /events membership poll, on the same boot clock as before
void seedHouseBoard().catch((e) => console.error('[tmux-ronin] house board seed failed:', e));

void publishMax();
void publishOwner();

// An address that was worked out rather than recorded can differ on the next start with
// nothing said. Say it now, while somebody is watching, and name the cure.
if (bindSource !== 'env') {
  console.warn(
    `[tmux-ronin] BIND is not recorded in ${path.join(ROOT, '.env')} — this address was worked out just now (${bindSource}). ` +
    'A later start may resolve a different one and answer somewhere else without warning. Run ./setup.sh to write it down.',
  );
}

let operatorSocket: BoundOperatorSocket | undefined;
server.listen(config.port, config.bind, async () => {
  if (isBoxInstance) {
    // The agent tools' door: a Unix socket in the data root, bound by the box instance
    // only. A second Ronin answering there is a collision, and like an occupied port it
    // exits 78 so the unit stops instead of retrying into the same wall every RestartSec.
    try {
      operatorSocket = await bindOperatorSocket(app, operatorSocketPath());
      console.log(`[tmux-ronin] agent tools answer at ${operatorSocket.path}`);
    } catch (e) {
      if (e instanceof SiblingAlive) {
        console.error(`[tmux-ronin] ${e.message}, so this Ronin did not start.`);
        console.error('[tmux-ronin] Stop the other one, or give this one its own RONIN_DATA_ROOT, then: systemctl --user restart ronin');
        process.exit(EXIT_ADDRESS_UNUSABLE);
      }
      console.error(`[tmux-ronin] could not bind ${operatorSocketPath()}: ${String((e as Error).message ?? e)}. Agent tools require RONIN_URL until this is fixed.`);
    }
  }
  console.log(
    `[tmux-ronin] listening on http://${config.bind}:${config.port}  (basic auth: ${authEnabled ? 'ON' : 'off'}, login: ${passwordAuthEnabled() ? 'ON' : 'off'}, window-size: ${config.windowSize})`,
  );
  console.log(`[tmux-ronin] browser sockets accepted from: ${allowedOrigins().join(', ')}`);
  // Mika is an ordinary detached singleton, born after provider readiness is recorded.
  // Operator restarts find the existing session; a failed private-home/model check is loud
  // and leaves no partially launched helper.
  await campaignStart;
  const mika = await launchControl.ensureMika().catch((error) => ({ ok: false, error: String((error as Error)?.message ?? error) }));
  if (!mika.ok) console.error(`[mika] startup refused: ${mika.error}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopBootHooks();
    stopSpawnBroker();
    setTimeout(() => process.exit(0), 2000).unref();
    // Only the socket this process bound comes down with it. Nothing shared is touched:
    // a dev run or a test stopping here must leave the live operator exactly as it found it.
    void Promise.allSettled([cleanupViewers(), operatorSocket?.close() ?? Promise.resolve()]).finally(() => process.exit(0));
  });
}
}

if (isEntryPoint) await startBox();
