/* part of the ronin-cowork client — see js/README.md */
import { t } from './lexicon.js';
/** Pure: turn (status, ok, decoded-body-or-null) into the result contract above. */
export function shapeResult(status, httpOk, body) {
  const data = body && typeof body === 'object' ? body : {};
  if (httpOk) return { ok: true, status, data };
  return {
    ok: false,
    status,
    kind: 'http',
    message: typeof data.error === 'string' && data.error ? data.error : `HTTP ${status}`,
    // A 5xx or 429 may pass on a retry; a 4xx is the caller's request being wrong,
    // and re-sending the same wrong thing is not a recovery path.
    retryable: status >= 500 || status === 429,
    data,
  };
}

/**
 * @param {string} url
 * @param {{method?: string, json?: unknown, text?: string, headers?: Record<string,string>,
 *          signal?: AbortSignal, cache?: RequestCache}} [opts]
 */
export async function request(url, opts = {}) {
  const init = {
    method: opts.method || 'GET',
    headers: { ...(opts.headers || {}) },
    signal: opts.signal,
  };
  if (opts.cache) init.cache = opts.cache;
  if (opts.json !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opts.json);
  } else if (opts.text !== undefined) {
    // The Docs editor saves text/plain on purpose — see the route in src/index.ts.
    init.headers['content-type'] = init.headers['content-type'] || 'text/plain; charset=utf-8';
    init.body = opts.text;
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    if (opts.signal?.aborted) {
      return { ok: false, status: 0, kind: 'abort', message: t('request.cancelled', 'cancelled'), retryable: false, cause };
    }
    return {
      ok: false,
      status: 0,
      kind: 'network',
      message: t('request.unreachable', 'could not reach Ronin — network or server down'),
      retryable: true,
      cause,
    };
  }
  // An empty 204/200 body decodes to {}: "success said nothing" is a legal answer
  // and must not be reported as a failure of the call that succeeded.
  const body = await res.json().catch(() => null);
  return shapeResult(res.status, res.ok, body);
}
