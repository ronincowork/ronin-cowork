import type express from 'express';
import { homedir } from 'node:os';
import { fetchLibrary, LIBRARY_BASE } from '../activation/transport.js';
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

async function readIndex(): Promise<LibraryCard[]> {
  const r = await fetchLibrary<unknown>('index.json');
  if (!r.body) throw new Error(`The library answered ${r.status || 'nothing'} for its index.`);
  return parseLibraryIndex(r.body).bundles;
}

async function readBundle(name: string): Promise<{ card: LibraryCard; bundle: Bundle }> {
  const card = (await readIndex()).find((c) => c.name === name);
  if (!card) throw new Error(`The library lists no bundle called "${name}".`);
  const r = await fetchLibrary<unknown>(card.url);
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
      res.status(502).json({ error: errMsg(e) });
    }
  });

  app.get('/api/library/bundles/:name', async (req, res) => {
    const name = String(req.params.name ?? '');
    if (!TOKEN.test(name)) return res.status(400).json({ error: 'A bundle name is lowercase letters, digits, _ and -.' });
    try {
      const { card, bundle } = await readBundle(name);
      res.json({ card, holds: bundleHolds(bundle), plan: await planInstall(bundle) });
    } catch (e) {
      res.status(502).json({ error: errMsg(e) });
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
      res.status(body.bundle !== undefined ? 400 : 502).json({ error: errMsg(e) });
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
