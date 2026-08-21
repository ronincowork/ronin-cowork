import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { config, authEnabled, assertBindIsSafe } from './config.js';
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
import { cleanupViewers, listSessions, publishRoninUrl } from './tmux.js';
import { publishMax, publishOwner } from './user-config.js';
import { registerCatalogs } from './routes/catalogs.js';
import { registerLaunch } from './routes/launch.js';
import { registerPasskeyLogin, registerPasskeyManage } from './routes/passkey-api.js';
import { registerSessions } from './routes/sessions-api.js';
import { startTomodachiSender } from './activation/tomodachi.js';
import { registerServicesActivation, resumeInstallWatch } from './routes/services-activation-api.js';
import { registerSettei } from './routes/settei-api.js';
import { stampFreshInstall } from './user-config.js';
import { registerUpdate } from './routes/update-api.js';
import { registerVersion } from './routes/version.js';
import { registerWipeboards } from './routes/wipeboards-api.js';
import { seedHouseBoard } from './wipeboards.js';
import { handleEvents, startSessionsBroadcast } from './ws/events.js';
import { handlePty } from './ws/pty.js';
import { originAllowed, allowedOrigins } from './ws/origin.js';
import { checkTmuxServerCgroup } from './host-guard.js';
// THE ASSEMBLER BLOCK — the one place in core a service is named (check-kyokai's
// exception, and on split day this block becomes discovery over the installed-services
// store; docs/connector-contract.md is the contract, sockets-contract.ts its shape).
import { sockets, startBootHooks, stopBootHooks, mountServiceRoutes, noteService, noteServiceFailure } from './sockets.js';
import type { ServiceRegistration } from './sockets-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const NM = path.join(ROOT, 'node_modules');

const app = express();
app.use(express.json());

// --- optional HTTP Basic auth (gates everything, including the websocket) ---
/**
 * Constant-time string equality.
 *
 * `timingSafeEqual` throws on a length mismatch, so comparing the raw strings would
 * leak the secret's LENGTH through that early throw — the one thing a plain `===`
 * also gave away. Hashing both sides first makes every comparison the same 32 bytes,
 * so neither the length nor the position of the first wrong character is observable.
 */
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
  // Both compares always run: `&&` would short-circuit on a wrong username and answer
  // faster than it does for a right one, which is the leak this function exists to close.
  const okUser = sameSecret(u, config.user);
  const okPass = sameSecret(p, config.pass);
  return okUser && okPass;
}

/**
 * The one authorization question, for HTTP and the websocket upgrade alike.
 *
 * Either door satisfies it: Basic (GRID_USER/GRID_PASS — scripts, tools, the old way)
 * or the login cookie (`ronin-passwd` + /login — the owner's browser). With NEITHER
 * configured everything is open, exactly as before, and `assertBindIsSafe` is what
 * keeps that state loopback/tailnet-only.
 */
function checkAuth(headers: { authorization?: string; cookie?: string }): boolean {
  if (!authEnabled && !passwordAuthEnabled()) return true;
  if (checkBasic(headers.authorization)) return true;
  const rec = authRecord();
  return !!rec && checkToken(rec.secret, cookieToken(headers.cookie));
}

/**
 * Mint the session cookie. ONE definition, because there are now three doors that end
 * here — password, passkey and recovery code — and three copies of a cookie's flags is
 * three chances for one of them to forget `httpOnly`.
 *
 * No `secure: true`, deliberately: this same server is reached over plain HTTP on the
 * tailnet IP as well as HTTPS through `tailscale serve`, and a Secure cookie would make
 * the HTTP address impossible to log into. The tailnet is the wall (src/config.ts);
 * the flag would be theatre there and a lockout here.
 *
 * Returns FALSE when there is no password record to sign with, and callers must respect
 * that rather than assume it (2026-08-17): `ronin-passwd clear` can remove the record
 * while registered passkeys remain in ronin.json, and the first version of this returned
 * void — so a passkey login answered `{ok:true}`, set no cookie, and bounced the owner
 * straight back to /login with nothing to explain it. A door that reports success and
 * does not open is worse than one that refuses.
 */
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

// --- the login door (the only routes ahead of the gate) ---
app.get('/login', (_req, res) => res.sendFile(path.join(PUBLIC, 'login.html')));
registerPasskeyLogin(app, issueSession); // /api/passkey/{options,login,recover} — src/routes/passkey-api.ts
app.post('/api/login', async (req, res) => {
  const rec = authRecord();
  if (!rec) return res.status(404).json({ error: 'No password is set on this install — see bin/ronin-passwd.' });
  const addr = req.socket.remoteAddress ?? '?';
  // Five failures a minute, then a minute in the corner: scrypt is the wall, this
  // keeps the log legible and a guessing loop pointless.
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

app.use((req, res, next) => {
  if (checkAuth(req.headers)) return next();
  // A person in a browser gets the login page, not a bare 401 — but only when there
  // IS a login page to give (a Basic-only install keeps the challenge it always had).
  if (passwordAuthEnabled() && req.method === 'GET' && req.accepts(['json', 'html']) === 'html') {
    return res.redirect('/login');
  }
  if (authEnabled) res.set('WWW-Authenticate', 'Basic realm="tmux-ronin"');
  res.status(401).send('Authentication required.');
});

// --- vendored browser assets (served straight from node_modules, no build step) ---
app.get('/vendor/xterm.css', (_req, res) => res.sendFile(path.join(NM, '@xterm/xterm/css/xterm.css')));
app.get('/vendor/xterm.js', (_req, res) => res.sendFile(path.join(NM, '@xterm/xterm/lib/xterm.js')));
app.get('/vendor/addon-fit.js', (_req, res) => res.sendFile(path.join(NM, '@xterm/addon-fit/lib/addon-fit.js')));

/**
 * NEVER LET A BROWSER RUN A STALE CLIENT.
 *
 * `public/` is served straight off the working tree, so a deploy changes the client the
 * moment the file changes — but only for a browser that bothers to ask. Safari (iOS
 * especially) will happily reuse a cached `app.js` for a long time, and the instant
 * client and server disagree about the wire protocol that stale copy is not merely old,
 * it is BROKEN: it calls methods the new client removed, or ignores messages the new
 * server sends, and the tile goes blank with nothing in the UI to say why.
 *
 * That is exactly how one deploy took every pane down and how the rollback failed to
 * bring them back. `no-cache` does NOT mean "do not store" — the browser still keeps the
 * file and still gets a 304 when nothing has changed. It means "ask first", which is the
 * only correct answer for an app that must stay in lockstep with its server.
 */
const noCacheClient = (res: express.Response, filePath: string) => {
  if (/\.(?:html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
};

/**
 * STAGING — see a candidate client BEFORE it is the only one you have.
 *
 * On 2026-08-08 a change went straight to live twice, and the second time the UI it
 * replaced was the only way to look at anything. The lesson was not "test more", it was
 * that there was nowhere to LOOK. `/staging/` is that somewhere: a second copy of the
 * client, served by this same server against the same tmux sessions, so a candidate can
 * be opened in one tab while the working UI stays untouched in another.
 *
 * It is the client only — same API, same /pty and /events sockets (the client asks for
 * those by absolute path, so a staged client drives the live server exactly as the real
 * one does). Nothing here forks the backend.
 *
 *   npm run stage                      # copy public/ -> public-staging/
 *   open  https://<host>:8443/staging/ # look at it
 *   node scripts/smoke-ui.mjs https://<host>:8443/staging/   # gate it
 *
 * Absent directory = feature simply off, so a fresh clone serves nothing extra.
 */
const STAGING = process.env.RONIN_STAGING_DIR ?? path.join(ROOT, 'public-staging');
if (fs.existsSync(STAGING)) {
  app.use('/staging', express.static(STAGING, { setHeaders: noCacheClient }));
  console.log(`[tmux-ronin] staging client at /staging/  (from ${STAGING})`);
}

app.use(express.static(PUBLIC, { setHeaders: noCacheClient }));

// --- REST API ---
// iOS Safari caches ETag-only fetch responses and serves them stale; API data must never cache.
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    auth: authEnabled,
    // The client's ⚙ System pane shows Log out only when a login actually exists.
    login: passwordAuthEnabled(),
    transcribe: Boolean(config.scribeUrl),
  }),
);

registerPasskeyManage(app); // /api/passkey/{list,register-options,register,remove} — BEHIND the gate on purpose
registerLaunch(app); // /api/launch (both variants), /api/sessions, /api/home, session-max, owner — src/routes/launch.ts
registerCatalogs(app); // /api/macros, /api/hotwords*, /api/project-roots*, /api/session-launch-specs, /api/session-jobs — src/routes/catalogs.ts
registerVersion(app); // /api/version — release string, or the commit this process started from — src/routes/version.ts
registerUpdate(app); // /api/update/* — the ⚙ gear's check + run, press-only — src/routes/update-api.ts
registerSettei(app); // /api/settei — the install record, and writes BY NAME only — src/routes/settei-api.ts
startTomodachiSender(); // AGERU's weekly packet actually leaves here — src/activation/tomodachi.ts
registerServicesActivation(app); // /api/services/activation* — the Ronin Services request, local-only; no secret crosses this surface — src/routes/services-activation-api.ts
// A box being born says so, ONCE, and only when ronin.json does not exist yet. Absence of
// the key means an install older than the key, which must stay quiet — src/user-config.ts.
void stampFreshInstall();

// Services register, then their routes mount — AFTER core's, which is safe because
// every service path (/api/tomodachi/*, /api/transcribe, /api/koshi*) is disjoint
// from every core path; nothing shadows, nothing falls through differently.
/**
 * THE ASSEMBLER IS DISCOVERY (the connector's last leg, per docs/connector-contract.md
 * § Wiring): scan src/services/ at boot, import each service's register entry, call
 * it. An empty or absent directory IS the free build — absence is never an error.
 * Installing services is putting them there and restarting (docs/release.md); no
 * service is ever named in core, so check-kyokai's line holds with nothing to except.
 * A service that fails to LOAD is logged and skipped, per the contract's boot rule
 * (a throw is logged, never fatal) — a broken add-on must not take down the grid.
 */
const services: ServiceRegistration[] = [];
const SERVICES_DIR = path.join(__dirname, 'services');
if (fs.existsSync(SERVICES_DIR)) {
  for (const dir of fs.readdirSync(SERVICES_DIR).sort()) {
    // A shipped services archive carries compiled register.js (the owner's ruling:
    // the archive delivers services, never source); a dev tree carries register.ts.
    // tsx runs both, and .js wins when both exist — an install is its shipped form.
    const entry = ['register.js', 'register.ts']
      .map((f) => path.join(SERVICES_DIR, dir, f))
      .find((p) => fs.existsSync(p));
    if (!entry) continue; // not a service (a stray file, a README)
    try {
      const mod = await import(pathToFileURL(entry).href);
      if (typeof mod.register !== 'function') throw new Error('no register() export');
      services.push({ name: typeof mod.name === 'string' ? mod.name : dir, register: mod.register });
    } catch (e) {
      console.error(`[services] ${dir} failed to load and is OFF: ${(e as Error).message}`);
      // Logged AND recorded: the activation watcher asks whether the install actually
      // delivered, and a console line cannot be asked.
      noteServiceFailure(dir, (e as Error).message);
    }
  }
}
for (const s of services) {
  noteService(s.name); // the roster /api/version reports, so the client's SWITCH knows
  s.register(sockets);
}
mountServiceRoutes(app);

// AFTER the assembler, never before: an install that finished by restarting us is waiting
// on a verdict, and the roster just built above is the evidence for it.
void resumeInstallWatch();





registerSessions(app); // per-session: kill/harakiri, meta, dials, ctx, tegami, send — src/routes/sessions-api.ts
registerWipeboards(app); // /api/wipeboards* — src/routes/wipeboards-api.ts


/**
 * MDEDIT — read and write ONE file, by path. The ▧ Docs tab is the only caller.
 *
 * **There is no allowlist, no realpath containment and no extension check, and that is the
 * owner's ruling, not an oversight:** *"If someone can get to the point where they're
 * viewing that file, they can write it. There's only one user and agents, and the agents
 * have full access anyway."* Ronin binds to the tailnet and every agent on the box already
 * has a shell, so a path filter here would guard nothing while costing a rule to maintain.
 *
 * No mtime precondition either. Whole-file write, last write wins. Two people editing one
 * doc at the same moment lose a paragraph, and retyping a paragraph is a cheaper failure
 * than another moving part — the same KISS ruling.
 *
 * THE BODY IS text/plain, NOT JSON, and that is load-bearing: `app.use(express.json())`
 * runs on every request with a 100kb default, so a JSON save would 413 on a large document
 * before reaching this handler. A non-JSON content-type makes the global parser skip the
 * body entirely and leaves the limit to the parser below. It also spares us escaping an
 * entire document to post it.
 *
 * See docs/mdedit.md. The LIST of files is TEGAMI's (services); opening one is not a
 * services concern at all, which is why these two routes are plain cowork.
 */
app.get('/api/file', async (req, res) => {
  const file = String(req.query.path ?? '');
  if (!file.startsWith('/')) return res.status(400).json({ error: 'An absolute path is required.' });
  try {
    const text = await fs.promises.readFile(file, 'utf8');
    res.json({ path: file, text });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    // 404 rather than an empty editor: a doc that was renamed out from under the list must
    // say so, or the owner types into a buffer that will be saved to a path they did not mean.
    if (code === 'ENOENT' || code === 'EISDIR') return res.status(404).json({ error: 'No such file.' });
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});

app.put('/api/file', express.text({ type: '*/*', limit: '8mb' }), async (req, res) => {
  const file = String(req.query.path ?? '');
  if (!file.startsWith('/')) return res.status(400).json({ error: 'An absolute path is required.' });
  const text = typeof req.body === 'string' ? req.body : '';
  try {
    // Refuse to CREATE. Every path here came off a session's doc list, so a path that does
    // not exist means the file moved while the tab was open — and writing it back would
    // silently resurrect a stale copy at the old name instead of saving the edit.
    await fs.promises.access(file);
    await fs.promises.writeFile(file, text, 'utf8');
    res.json({ ok: true, bytes: Buffer.byteLength(text) });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return res.status(404).json({ error: 'No such file — it moved or was deleted.' });
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});

// --- HTTP + WebSocket server ---
const server = createServer(app);
// A tape-fed tile opens with its whole reconstructed history — a couple of megabytes of
// plain text, which is exactly the payload a phone on a weak connection least wants to
// wait for. Terminal text compresses roughly tenfold, so this is the cheapest large win
// available. Locked tiles carry small frames and are unaffected either way.
const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: {
    threshold: 4096, // don't pay the CPU on the small live repaints
    zlibDeflateOptions: { level: 6 },
  },
});

server.on('upgrade', (req, socket, head) => {
  // Same one question as HTTP — the browser's socket carries the login cookie.
  if (!checkAuth(req.headers)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="tmux-ronin"\r\n\r\n');
    socket.destroy();
    return;
  }
  // A page Ronin did not serve may not open a socket with the owner's ambient
  // credentials — auth cannot tell that apart, only the Origin can. See src/ws/origin.ts.
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
        /* ignore */
      }
    });
  });
});


// FIRST, before any side effect: an unguarded door is not a thing to discover late.
// This runs ahead of cleanupViewers() deliberately — a refused boot must not have
// killed anyone's viewer sessions on its way out.
try {
  assertBindIsSafe(passwordAuthEnabled());
} catch (e) {
  console.error(`[tmux-ronin] ${(e as Error).message}`);
  process.exit(1);
}

await checkTmuxServerCgroup(); // loud if our own restart would kill every session
const removed = await cleanupViewers();
if (removed) console.log(`[tmux-ronin] cleaned up ${removed} stale viewer session(s)`);
// THE BOOT SOCKET: every service's timers, janitors and sinks start inside its own
// register.ts boot hook — rireki's janitor+warmer+settler, counting's sink+catalog
// feed, michi's letter sweep. What used to be wired line-by-line here is now each
// service's own business; a hook that throws is logged and costs only its service.
await startBootHooks();
startSessionsBroadcast(); // the /events membership poll, on the same boot clock as before
// The house board — the one board every install has, seeded once and then the user's.
void seedHouseBoard().catch((e) => console.error('[tmux-ronin] house board seed failed:', e));

// Tools inside a pane (tejun-harakiri) find the API here instead of re-deriving the bind.
void publishRoninUrl(`http://${config.bind}:${config.port}`);
// The session max onto the same bus. The tmux server outlives Ronin, but a tmux server
// restarted without us would lose the option — so it is republished on every boot, and
// `libexec/ronin-may-spawn` reads a missing option as "no limit" rather than as zero.
void publishMax();
void publishOwner();

server.listen(config.port, config.bind, () => {
  console.log(
    `[tmux-ronin] listening on http://${config.bind}:${config.port}  (basic auth: ${authEnabled ? 'ON' : 'off'}, login: ${passwordAuthEnabled() ? 'ON' : 'off'}, window-size: ${config.windowSize})`,
  );
  // Printed because a refused socket is otherwise a mystery from the browser end:
  // the page simply does not connect, and this line is what the log can be read against.
  console.log(`[tmux-ronin] browser sockets accepted from: ${allowedOrigins().join(', ')}`);
});

// The letter sweep and the sanitiser's catalog feed moved into michi's and counting's
// own boot hooks (src/services/*/register.ts) — started above with everything else.

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    // Service stop hooks FIRST — counting's flushSync (the last beads reach disk;
    // losing them silently is the only sin) and rireki's stopJanitor live there now.
    stopBootHooks();
    // Failsafe: a wedged tmux call must never hold the stop hostage — systemd
    // was hitting its 90s final-sigterm timeout (ronin dead the whole time). Best-
    // effort cleanup gets 2s; startup cleanup catches whatever this pass missed.
    setTimeout(() => process.exit(0), 2000).unref();
    // Viewers only. Recorders (Faucet B) are tmux's, not ours — they keep running
    // while Ronin is stopped, which is the entire point of the applet.
    void Promise.allSettled([cleanupViewers()]).finally(() => process.exit(0));
  });
}
