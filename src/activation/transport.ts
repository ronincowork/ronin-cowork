import { appendEgress } from './egress.js';

const ALLOWED_HOST = process.env.RONIN_HQ_HOST ?? 'hq.ronincowork.com';

export const LIBRARY_BASE = process.env.RONIN_LIBRARY_BASE ?? 'https://ronincowork.com/library/';
const LIBRARY_HOST = new URL(LIBRARY_BASE).hostname;

const TIMEOUT_MS = 15_000;

const LIBRARY_MAX_BYTES = 4 * 1024 * 1024;

export interface HqResponse<T> {
  status: number;
  body: T | null;
  requestId: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

export class EgressRefused extends Error {}

function assertAllowed(url: URL): void {
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new EgressRefused(`refusing plaintext egress to ${url.hostname}`);
  }
  const allowed = [ALLOWED_HOST, LIBRARY_HOST, '127.0.0.1', 'localhost'];
  if (!allowed.includes(url.hostname)) {
    throw new EgressRefused(`${url.hostname} is not an allowlisted Ronin host`);
  }
}

export async function fetchLibrary<T>(pathname: string): Promise<{ status: number; body: T | null; text: string }> {
  const base = new URL(LIBRARY_BASE);
  const url = new URL(pathname, base);
  assertAllowed(url);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw new EgressRefused(`${url.href} is outside the template library`);
  }
  const started = Date.now();
  let status = 0;
  let outcome = 'error';
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': 'ronin-cowork' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error',
    });
    status = res.status;
    outcome = res.ok ? 'ok' : 'refused';
    const text = await res.text();
    if (text.length > LIBRARY_MAX_BYTES) {
      outcome = 'oversize';
      throw new Error(`the library answered ${text.length} bytes; a bundle is under ${LIBRARY_MAX_BYTES}`);
    }
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* HTML, or empty */ }
    return { status, body: res.ok ? (parsed as T) : null, text };
  } catch (e) {
    if (outcome === 'ok' || outcome === 'refused') throw e;
    outcome = e instanceof EgressRefused ? 'refused-by-allowlist' : 'unreachable';
    throw e;
  } finally {
    await appendEgress({
      at: new Date().toISOString(),
      host: url.hostname,
      method: 'GET',
      path: url.pathname,
      status,
      outcome,
      ms: Date.now() - started,
    }).catch(() => { /* never let bookkeeping fail the call */ });
  }
}

export async function callHq<T>(
  method: string,
  pathname: string,
  opts: { body?: unknown; token?: string; base?: string } = {},
): Promise<HqResponse<T>> {
  const base = opts.base ?? process.env.RONIN_HQ_BASE ?? `https://${ALLOWED_HOST}`;
  const url = new URL(pathname, base);
  assertAllowed(url);

  const started = Date.now();
  let status = 0;
  let outcome = 'error';

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        'user-agent': 'ronin-cowork',
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error', // a redirect off the allowlisted host is not a thing we follow
    });

    status = res.status;
    outcome = res.ok ? 'ok' : 'refused';
    const requestId = res.headers.get('x-request-id');
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* HTML, or empty */ }

    return {
      status,
      requestId,
      body: res.ok ? (parsed as T) : null,
      error: !res.ok && parsed?.error ? parsed.error : null,
    };
  } catch (e) {
    outcome = e instanceof EgressRefused ? 'refused-by-allowlist' : 'unreachable';
    throw e;
  } finally {
    await appendEgress({
      at: new Date().toISOString(),
      host: url.hostname,
      method,
      path: url.pathname,
      status,
      outcome,
      ms: Date.now() - started,
    }).catch(() => { /* never let bookkeeping fail the call */ });
  }
}
