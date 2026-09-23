import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import express from 'express';

/*
 * HOW THE BROWSER'S FILES ARE VERSIONED AND SERVED.
 *
 * The client is ~145 ES modules plus a stylesheet, about 1.3 MB, fetched one file at a
 * time. Caching them is not an optimisation, it is the difference between a refresh that
 * costs nothing and one that costs the whole graph.
 *
 * Two rules, and they are a pair:
 *
 *  1. THE VERSION IS THE CLIENT'S OWN CONTENT. It used to be the repository's commit, so
 *     every restart that moved HEAD gave all 145 modules new URLs and the next refresh was
 *     a cold download — even when the commit only touched src, tests, docs or catalogs and
 *     not one byte the browser loads had changed. A fingerprint of the served tree changes
 *     only when the browser's files change. The same bytes give the same version across
 *     restarts and across machines, and a reverted change returns to its old version
 *     rather than minting a third one.
 *
 *  2. A STALE VERSION IS SERVED, NEVER REFUSED. A tab that loaded before a restart still
 *     names the previous version in every module URL. Refusing those is not a cache miss,
 *     it is 145 404s and a module graph that dies part-way through boot — a page that
 *     hangs instead of one that reloads. So an unknown eight-hex prefix falls through to
 *     today's file, served no-cache; the next document load carries the current version
 *     and is cacheable again.
 */

/** Eight hex characters over every file the browser can ask for, path and content. */
export function publicFingerprint(root: string): string {
  const sum = createHash('sha256');
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) { sum.update(path.relative(root, full)); sum.update(fs.readFileSync(full)); }
    }
  };
  walk(root);
  return sum.digest('hex').slice(0, 8);
}

/** Only a document may be cached by the client without revalidating. */
export const noCacheClient = (res: express.Response, filePath: string): void => {
  if (/\.(?:html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
};

/**
 * Mount the versioned asset tree. Order is the whole design: the current version is
 * immutable, anything else with an eight-hex prefix loses the prefix and is served as the
 * current file, no-cache, by the plain static mount the caller adds after this.
 */
export function mountAssets(app: express.Application, root: string, version: string): void {
  app.use(`/${version}`, express.static(root, { immutable: true, maxAge: '1y', index: false }));
  app.use((req, _res, next) => {
    req.url = req.url.replace(/^\/[0-9a-f]{8}(?=\/)/, '');
    next();
  });
}
