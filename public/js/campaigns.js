/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';

export const MULTIPLE_CAMPAIGNS_ENABLED = false;

/** `{ campaigns, ok, synthesized }` — the last read. `null` until one has happened. */
let read = null;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

const bucket = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** One record as the client uses it; anything the server did not say is '' or {}. The
 *  Campaign's own desk settings and its typed config ride along — the Desk profile and
 *  Agent defaults surfaces read them; a synthesized record has neither. */
const shape = (row) => ({
  id: text(row?.id),
  title: text(row?.title) || text(row?.id),
  description: text(row?.description),
  desk_profile: text(row?.desk_profile),
  desk: bucket(row?.desk),
  config: bucket(row?.config),
  state: row?.state === 'archived' ? 'archived' : 'active',
});

/**
 * Read the Campaign list. A 404 or an unreachable server is the compatibility window and
 * synthesizes; every other answer — including a successful empty list — is taken as said.
 */
export async function loadCampaigns() {
  const r = await request('/api/campaigns', { cache: 'no-store' });
  if (!r.ok) {
    read = { campaigns: [], ok: false, message: r.message };
    return read;
  }
  const rows = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.campaigns) ? r.data.campaigns : [];
  read = { campaigns: rows.map(shape).filter((row) => row.id), ok: true };
  return read;
}

/** Every Campaign the last read returned, archived ones included. */
export const campaigns = () => read?.campaigns ?? [];
/** The ones a selector may offer: archived hides by default and kills nothing. */
export const visibleCampaigns = () => campaigns().filter((row) => row.state !== 'archived');
export const campaignById = (id) => campaigns().find((row) => row.id === id) || null;

export const initialCampaignId = () => campaigns()[0]?.id || '';
/**
 * Save fields onto one `campaign_config`.
 *
 * WHILE THE STORE IS ABSENT THE SAME FIELDS STILL HAVE A HOME, and it is not this record:
 * the title and description are `settei.campaign`, and the desk profile is the install's
 * one `set.desk.profile`. So a write during the compatibility window goes THERE rather
 * than failing against a route that does not exist yet — the surface behaves identically
 * either side of the store landing, and nothing here invents a second writer. The whole
 * branch is deleted with the fallback.
 */
export async function saveCampaign(id, fields) {
  const r = await request(`/api/campaigns/${encodeURIComponent(id)}`, { method: 'PUT', json: fields });
  if (r.ok) await loadCampaigns();
  return r;
}

/**
 * HEAL A STORED SELECTION AGAINST WHAT ACTUALLY EXISTS (CAMPAIGN_SCOPING § UI model).
 *
 * Deleted and archived ids are discarded on read; empty selected ids heal to the default
 * Campaign; the primary falls forward to the first visible one when its own id is gone.
 * Order is the owner's and is preserved — it is what makes the primary the TOP one — so
 * this filters and never sorts. With no Campaign at all, every field is empty and the
 * surfaces say so rather than inventing one.
 */
export function normalizeSelection(stored) {
  const visible = visibleCampaigns().map((row) => row.id);
  const known = new Set(visible);
  const raw = stored && typeof stored === 'object' ? stored : {};
  const mode = raw.mode === 'all' ? 'all' : 'selected';
  const kept = Array.isArray(raw.campaign_ids)
    ? [...new Set(raw.campaign_ids.filter((id) => known.has(id)))]
    : [];
  // "All" means all non-archived AT READ TIME, never a copied list of ids.
  const ids = mode === 'all' ? visible : kept.length ? kept : visible.slice(0, 1);
  const wanted = text(raw.primary_campaign_id);
  const primary = ids.includes(wanted) ? wanted : ids[0] || '';
  return { mode, campaign_ids: mode === 'all' ? [] : ids, primary_campaign_id: primary };
}

/**
 * Which Campaign a record belongs to. An unstamped record — `campaign_id: ''` — reads as
 * the initial Campaign rather than as hidden: an unscoped legacy row must not vanish from
 * the board while the migration window is open. This is the ONE place that mapping is made.
 */
export const campaignOf = (record) => text(record?.campaign_id) || initialCampaignId();

/** Create one, then take the store's own record as the truth. Never touches anything else. */
export async function createCampaign({ title, description, desk_profile }) {
  const r = await request('/api/campaigns', {
    method: 'POST',
    json: { title: text(title), description: text(description), desk_profile: text(desk_profile) },
  });
  if (!r.ok) return r;
  const saved = shape(r.data);
  if (!saved.id) return { ok: false, status: r.status, kind: 'http', message: 'the Campaign was saved without an id', retryable: false };
  await loadCampaigns();
  return { ok: true, status: r.status, data: saved };
}
