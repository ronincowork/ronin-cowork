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
  if (typeof document !== 'undefined' && String(url).startsWith('/api/')) {
    const source = document.documentElement?.dataset?.roninSource;
    if (source) init.headers['x-ronin-source'] = source;
  }
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
  /*
   * NOTHING AND UNREADABLE ARE NOT THE SAME ANSWER.
   *
   * This used to be `res.json().catch(() => null)`, which folded both into "success said
   * nothing": a 200 whose body never arrived whole came back as ok with {}, and every
   * caller that reads emptiness as a legitimate state believed it. The owner watched his
   * phone say "No transcript output yet." while the server was sending 637 records —
   * the view was not wrong, it was told there were none.
   *
   * So the body is read as text and the two cases are separated. An empty body is still a
   * legal answer and still decodes to {}. A body that is THERE and cannot be understood is
   * a failure of this call, and a retryable one, because the next read usually gets it.
   *
   * A failed status keeps its own shape: when the server said 500, the story is the 500,
   * not the shape of the page it sent with it.
   */
  let raw;
  try {
    raw = await res.text();
  } catch (cause) {
    // The body was announced and could not be read at all — a decode or a cut-off read.
    if (!res.ok) return shapeResult(res.status, false, null);
    return { ok: false, status: res.status, kind: 'malformed',
      message: t('request.malformed', 'Ronin answered, but the answer did not arrive whole'),
      retryable: true, cause };
  }
  if (!raw) return shapeResult(res.status, res.ok, null);
  let body;
  try {
    body = JSON.parse(raw);
  } catch (cause) {
    if (!res.ok) return shapeResult(res.status, false, null);
    return { ok: false, status: res.status, kind: 'malformed',
      message: t('request.malformed', 'Ronin answered, but the answer did not arrive whole'),
      retryable: true, cause };
  }
  return shapeResult(res.status, res.ok, body);
}
