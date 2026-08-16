/* part of the tmux-ronin client — see js/README.md */
/**
 * REQUEST — the one answer to "what happened?" for every JSON call the client makes.
 *
 * Before this, seventeen modules each spelled their own fetch: some threw, some
 * returned `{}`, some swallowed the failure entirely, and `r.json().catch(() => ({}))`
 * was pasted in eleven slightly different shapes. The transport mechanics are now
 * normalized HERE and nowhere else; what a failure MEANS stays with the feature,
 * which is the half that actually differs between a wipeboard and a launch.
 *
 * The contract:
 *
 *   const r = await request('/api/thing', { method: 'POST', json: payload });
 *   // r.ok === true  → { ok, status, data }            data = decoded JSON ({} if none)
 *   // r.ok === false → { ok, status, kind, message, retryable, cause }
 *   //     kind: 'http'    a real answer with a non-2xx status (message = server's
 *   //                     `error` field when it sent one, else "HTTP <status>")
 *   //           'network' the server was never reached — message names Ronin, not
 *   //                     the browser's unhelpful "Failed to fetch"
 *   //           'abort'   the caller's own AbortSignal fired; never worth showing
 *
 * request() NEVER THROWS for a transport outcome — a thrown "Failed to fetch" is how
 * failures used to vanish into empty catch blocks. It does not toast, does not retry
 * a mutation, does not know a single Ronin word. Deliberate non-users: voice.js posts
 * an audio blob (not JSON), stats.js beacons a counter (fire-and-forget) — both are
 * documented streams, not stragglers.
 *
 * The response-shaping is a pure function (`shapeResult`) so tests/request-shape.test.js
 * can hold the contract without a browser or a socket (check-tests' floor).
 */

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
      return { ok: false, status: 0, kind: 'abort', message: 'cancelled', retryable: false, cause };
    }
    return {
      ok: false,
      status: 0,
      kind: 'network',
      message: 'could not reach Ronin — network or server down',
      retryable: true,
      cause,
    };
  }
  // An empty 204/200 body decodes to {}: "success said nothing" is a legal answer
  // and must not be reported as a failure of the call that succeeded.
  const body = await res.json().catch(() => null);
  return shapeResult(res.status, res.ok, body);
}
