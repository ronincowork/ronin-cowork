/**
 * THE TEMPLATE LIBRARY — bundles on the public site, and the one way in.
 *
 * Every verb here is a PRESS. `GET /api/library` asks the site for its index only when
 * the Templates surface's button is pressed — never on a timer, never at boot (the
 * update-check rule, src/routes/update-api.ts). The fetch goes through the AGERU
 * transport (src/activation/transport.ts): allowlisted host, egress record, no token.
 *
 * A download is two reads and one write: the index (for the card and its sha256), the
 * bundle (held to the hash the index promised), then `installBundle` into the owner's
 * stores. The plan is answered BEFORE anything is written so the surface can show what
 * will land where, and `replace` is the only way an owner's own file is written over.
 *
 * `POST /api/library/install` also takes a whole bundle document in the body — one the
 * owner built with `bin/ronin-bundle` — and that path makes no outbound call and needs no
 * Services: making your own is the floor. Reading the shelf is the Services feature
 * (owner, 2026-09-03): without an entitlement the read is refused in words, with the
 * switch named, and the handful that ship inside Ronin stay.
 */
import type express from 'express';
import { homedir } from 'node:os';
import { fetchLibrary, LIBRARY_BASE } from '../activation/transport.js';
import { getEntitlementToken } from '../activation/secrets.js';
import {
  bundleHolds,
  installBundle,
  libraryCard,
  packBundle,
  parseBundle,
  parseLibraryIndex,
  planInstall,
  sha256,
  type Bundle,
  type LibraryCard,
} from '../bundles.js';

const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');
const TOKEN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** No Services, no shelf — said in words the surface can show, with where the switch is. */
export const SERVICES_OFF = 'The template library is a Ronin Services feature, and Ronin Services is off on this box. Switch it on under Ronin Desk → Account → Ronin Services; the handful of templates that ship inside Ronin stay yours either way.';
class ServicesOff extends Error { constructor() { super(SERVICES_OFF); this.name = 'ServicesOff'; } }
async function token(): Promise<string> {
  const held = await getEntitlementToken();
  if (!held) throw new ServicesOff();
  return held;
}
const status = (e: unknown, otherwise: number) => (e instanceof ServicesOff ? 402 : otherwise);

async function readIndex(): Promise<LibraryCard[]> {
  const r = await fetchLibrary<unknown>('index.json', await token());
  if (!r.body) throw new Error(`The library answered ${r.status || 'nothing'} for its index.`);
  return parseLibraryIndex(r.body).bundles;
}

/** One bundle off the site, checked against the card the index carries for it. */
async function readBundle(name: string): Promise<{ card: LibraryCard; bundle: Bundle }> {
  const card = (await readIndex()).find((c) => c.name === name);
  if (!card) throw new Error(`The library lists no bundle called "${name}".`);
  const r = await fetchLibrary<unknown>(card.url, await token());
  if (!r.body) throw new Error(`The library answered ${r.status || 'nothing'} for "${name}".`);
  if (card.sha256 && sha256(r.text) !== card.sha256) {
    throw new Error(`"${name}" does not match the hash its index promised; nothing was installed.`);
  }
  const bundle = parseBundle(r.body);
  if (bundle.name !== name) throw new Error(`The document at ${card.url} calls itself "${bundle.name}", not "${name}".`);
  return { card, bundle };
}

export function registerLibrary(app: express.Express): void {
  app.get('/api/library', async (_req, res) => {
    try {
      res.json({ source: LIBRARY_BASE, bundles: await readIndex(), read_at: new Date().toISOString() });
    } catch (e) {
      res.status(status(e, 502)).json({ error: errMsg(e), services_off: e instanceof ServicesOff });
    }
  });

  // The bundle's face and the plan — what an install WOULD write — nothing written.
  app.get('/api/library/bundles/:name', async (req, res) => {
    const name = String(req.params.name ?? '');
    if (!TOKEN.test(name)) return res.status(400).json({ error: 'A bundle name is lowercase letters, digits, _ and -.' });
    try {
      const { card, bundle } = await readBundle(name);
      // The whole document rides along: the owner sees everything before Install (owner, 2026-09-03).
      res.json({ card, holds: bundleHolds(bundle), plan: await planInstall(bundle), bundle });
    } catch (e) {
      res.status(status(e, 502)).json({ error: errMsg(e), services_off: e instanceof ServicesOff });
    }
  });

  // `{ name, replace? }` fetches and installs; `{ bundle, replace? }` installs a document
  // the owner already holds. Both answer the receipt: written, skipped, refused.
  app.post('/api/library/install', async (req, res) => {
    const body = (req.body ?? {}) as { name?: unknown; bundle?: unknown; replace?: unknown };
    const replace = body.replace === true;
    try {
      let bundle: Bundle;
      if (body.bundle !== undefined) {
        bundle = parseBundle(body.bundle);
      } else {
        const name = String(body.name ?? '');
        if (!TOKEN.test(name)) return res.status(400).json({ error: 'Send { name } or { bundle }.' });
        bundle = (await readBundle(name)).bundle;
      }
      res.json({ ok: true, receipt: await installBundle(bundle, { replace }) });
    } catch (e) {
      res.status(status(e, body.bundle !== undefined ? 400 : 502)).json({ error: errMsg(e), services_off: e instanceof ServicesOff });
    }
  });

  // A bundle OUT of this install, built around one team template — what the owner would
  // put on a library of their own. Answered as a download; nothing is stored.
  app.get('/api/library/pack/:team', async (req, res) => {
    const team = String(req.params.team ?? '');
    if (!TOKEN.test(team)) return res.status(400).json({ error: 'A template name is lowercase letters, digits, _ and -.' });
    const list = (v: unknown): string[] => String(v ?? '').split(',').map((s) => s.trim()).filter((s) => TOKEN.test(s) || /^[\w-]{1,64}$/.test(s));
    try {
      const bundle = await packBundle({
        team,
        agents: list(req.query?.agents),
        sops: list(req.query?.sops),
        ways: list(req.query?.ways),
        library: list(req.query?.library),
        macros: list(req.query?.macros),
        actions: list(req.query?.actions),
        tools: list(req.query?.tools),
      });
      const text = `${JSON.stringify(bundle, null, 2)}\n`;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('content-disposition', `attachment; filename="${bundle.name}.json"`);
      res.setHeader('x-ronin-bundle-card', JSON.stringify(libraryCard(bundle, text, `bundles/${bundle.name}.json`)));
      res.send(text);
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });
}
