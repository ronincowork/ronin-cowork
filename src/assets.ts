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

/**
 * Eight hex characters over every file the browser can ask for, path and content.
 *
 * Each file contributes a LENGTH-FRAMED record, never a bare concatenation. Feeding the
 * path and then the bytes straight into the digest makes the stream ambiguous: a file `a`
 * holding `bc` and a file `ab` holding `c` produce the identical run of bytes, so two
 * genuinely different trees would share a version and one of them would be served from
 * the other's cache. The two big-endian lengths in front of every record remove that.
 *
 * Ordering is by UTF-16 code unit, not `localeCompare`, which reads the host's locale and
 * would otherwise make "the same bytes give the same version across machines" false.
 * Separators are normalised to `/` for the same reason.
 */
export function publicFingerprint(root: string): string {
  const sum = createHash('sha256');
  const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => byCodeUnit(a.name, b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.isFile()) continue;
      const rel = Buffer.from(path.relative(root, full).split(path.sep).join('/'), 'utf8');
      const body = fs.readFileSync(full);
      const frame = Buffer.alloc(8);
      frame.writeUInt32BE(rel.length, 0);
      frame.writeUInt32BE(body.length, 4);
      sum.update(frame);
      sum.update(rel);
      sum.update(body);
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
  // The prefix is dropped ONLY when what is left names a real file in the served tree.
  // Stripping every eight-hex prefix was an alias over the whole application: it sits in
  // front of the API, so `/deadbeef/api/health` became `/api/health` and a made-up version
  // string reached routes that have nothing to do with assets. Asking the tree first keeps
  // the fallback to what it is for — a file this server really does serve, under a version
  // it no longer answers to.
  app.use((req, _res, next) => {
    const match = /^\/[0-9a-f]{8}(\/[^?]*)/.exec(req.url);
    if (match && servesFile(root, match[1])) req.url = req.url.slice(9);
    next();
  });
}

/** Does `rel` name a real file inside `root`, and nothing outside it? */
function servesFile(root: string, rel: string): boolean {
  let decoded: string;
  try { decoded = decodeURIComponent(rel); } catch { return false; }
  if (decoded.includes('\0')) return false;
  const full = path.resolve(root, `.${decoded}`);
  const inside = path.resolve(root) + path.sep;
  if (!full.startsWith(inside)) return false;
  return fs.statSync(full, { throwIfNoEntry: false })?.isFile() === true;
}
