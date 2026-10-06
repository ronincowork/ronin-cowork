/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TENANT'S READING — one seam between the new tenants and the server's collection
 * reading (src/collection-read.ts): Teams, boards and workspace folders, narrowed by
 * campaign, team, board or root. The server resolves the tenant; the browser filters and
 * joins nothing (owner, 2026-10-06).
 *
 * Today the body is one GET on open, as Who does. Under w12 "Readings by push"
 * (surface_items2) it becomes a store want — `collection:<query>` answered whole on the
 * want and on every change, as wipeboards are — and this file is the only place that
 * changes. Nothing else may call /api/collection.
 */
import { request } from './request.js';

const FIELDS = ['campaign', 'team', 'board'];

/** The query a filter makes, in one fixed order, so the same filter is always the same key. */
export function collectionQuery(filter = {}) {
  const parts = [];
  for (const field of FIELDS) if (filter[field]) parts.push(`${field}=${encodeURIComponent(filter[field])}`);
  for (const root of Array.isArray(filter.root) ? filter.root : filter.root ? [filter.root] : []) parts.push(`root=${encodeURIComponent(root)}`);
  return parts.join('&');
}

/** The reading for a filter: `{ ok, data: { teams, boards, roots }, message }`. */
export function readCollection(filter = {}, { signal } = {}) {
  const query = collectionQuery(filter);
  return request(`/api/collection${query ? `?${query}` : ''}`, { cache: 'no-store', ...(signal ? { signal } : {}) });
}
