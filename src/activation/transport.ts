/**
 * THE AGERU TRANSPORT — one allowlisted HTTPS client, and the house stays at two doors.
 *
 * `src/settei.ts` states the law: "the house has exactly two [egress doors] (AGERU, and the
 * model provider)". Services activation and Tomodachi are two different CONTRACTS and two
 * different CONSENT EVENTS, but they are not two different doors — they share this client,
 * its allowlist, its TLS and timeouts, its redaction, its request ids, and the egress record
 * the owner can read.
 *
 * That is the whole reason this file exists rather than each caller reaching for fetch().
 * A second call site is a second door nobody voted for.
 */
import { appendEgress } from './egress.js';

/** The ONLY host this client will talk to. Not a default — a refusal for anything else. */
const ALLOWED_HOST = process.env.RONIN_HQ_HOST ?? 'hq.ronincowork.com';

const TIMEOUT_MS = 15_000;

export interface HqResponse<T> {
  status: number;
  body: T | null;
  /** SHIWAKE's request id, so a problem here can be matched to a line in HQ's journal. */
  requestId: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

export class EgressRefused extends Error {}

function assertAllowed(url: URL): void {
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new EgressRefused(`refusing plaintext egress to ${url.hostname}`);
  }
  if (url.hostname !== ALLOWED_HOST && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new EgressRefused(`${url.hostname} is not the allowlisted Ronin host`);
  }
}

/**
 * Call Ronin HQ.
 *
 * The token never appears in a log line, a URL, or the egress record. The record says that
 * a call happened, to what, and how it ended — which is what an owner needs to see — and
 * nothing that would be worth stealing from it.
 */
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
    // A timeout or a DNS failure is not an error the owner needs a stack trace for; it is
    // "HQ was not reachable", which the caller turns into a retry and a visible state.
    outcome = e instanceof EgressRefused ? 'refused-by-allowlist' : 'unreachable';
    throw e;
  } finally {
    // ONE RECORD PER CALL, always — including the failures. An egress record that only logs
    // successes is a record that hides exactly the calls someone would want to ask about.
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
