import type express from 'express';
import { homedir } from 'node:os';
import { fetchLibrary, LIBRARY_BASE } from '../activation/transport.js';
import { getEntitlementToken } from '../activation/secrets.js';
import { servicesStatusSentence } from './installed-api.js';
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

/** No entitlement, no shelf — said in the three facts' own words (src/routes/installed-api.ts), never "off". */
class ServicesOff extends Error { constructor(status: string) { super(`The template library is a Ronin Services feature. ${status} The handful of templates that ship inside Ronin stay yours either way.`); this.name = 'ServicesOff'; } }
async function token(): Promise<string> {
  const held = await getEntitlementToken();
  if (!held) throw new ServicesOff(await servicesStatusSentence());
  return held;
}
const status = (e: unknown, otherwise: number) => (e instanceof ServicesOff ? 402 : otherwise);

async function readIndex(): Promise<LibraryCard[]> {
  const r = await fetchLibrary<unknown>('index.json', await token());
  if (!r.body) throw new Error(`The library answered ${r.status || 'nothing'} for its index.`);
  return parseLibraryIndex(r.body).bundles;
}

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
