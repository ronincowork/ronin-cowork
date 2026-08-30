/* part of the ronin-cowork client — see js/README.md */
/**
 * CAMPAIGNS — the one client-side Campaign list, and the one selection schema.
 *
 * A `campaign_config` is the durable record for one body of work (CAMPAIGN_SCOPING.md):
 * `{ id, title, description, desk_profile, state }`. It owns no Agents, Coworks or roots
 * as embedded lists — those records point back with their own `campaign_id`. This module
 * is the ONE place the browser reads that list, so nothing downstream grows a second
 * registry: the three-card home, `#/cowork` and the Agents door all read it here.
 *
 * TWO ANSWERS THAT LOOK ALIKE AND ARE NOT (@league_lead, 2026-08-29). A successful
 * `GET /api/campaigns` that returns `[]` is an EMPTY LIST — the store is present and
 * holds nothing, and the surface says so. An ABSENT store — 404, a network failure, an
 * operator older than the API — is the compatibility window, and only there do we
 * synthesize the one implicit Campaign out of `settei.campaign` plus the active desk
 * profile. That synthesis is CAMPAIGN_SCOPING's own migration step 8 read-only fallback
 * and is deleted with the fallback; it is never a write, and it never invents a SECOND
 * record beside a store that answered.
 *
 * THE SELECTION IS A VIEW'S, NEVER AN OBJECT'S. A durable record has one `campaign_id`;
 * a view has an ordered selection of them. The first is PRIMARY and its `desk_profile`
 * paints the whole combined face — other Campaigns contribute records, never lexicons.
 * The selection lives in browser workspace state (workspace.js), never in SETTEI, so two
 * tabs may inspect different Campaigns without fighting.
 */
import { request } from './request.js';
import { activeProfile } from './desk-profile.js';

/** The last-resort id, used only when no Campaign API answered AND SETTEI names nothing. */
const UNNAMED_CAMPAIGN_ID = 'ronin';

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
 * The id the migration would derive from a name (CAMPAIGN_SCOPING migration step 1:
 * derive from `settei.campaign.name`, fall back to `ronin`).
 *
 * THIS IS COSMETIC AND NOTHING MAY DEPEND ON THE LITERAL (@campaign_scope, 2026-08-29).
 * The synthesized record exists only while NO store answered, so a store-derived id and
 * this one can never coexist to disagree; when the store lands, its seeded record is read
 * and this id is gone. A selection persisted against it heals on the next read, because
 * `normalizeSelection` discards ids the list does not carry. Every filter below therefore
 * asks `initialCampaignId()` — the list's own first record — and never this spelling.
 */
const deriveId = (name) => text(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || UNNAMED_CAMPAIGN_ID;

/**
 * The one implicit Campaign of an install that predates the store, built from what that
 * install already answers: SETTEI's campaign leaf and the desk profile it already wears.
 * Read-only, never written back, and never produced when the store itself answered.
 */
async function synthesize() {
  const r = await request('/api/settei');
  const campaign = r.ok ? r.data?.set?.campaign : null;
  const name = text(campaign?.name);
  return [shape({
    id: deriveId(name),
    title: name || 'Ronin',
    description: text(campaign?.description),
    desk_profile: activeProfile()?.name || '',
    state: 'active',
  })];
}

/**
 * Read the Campaign list. A 404 or an unreachable server is the compatibility window and
 * synthesizes; every other answer — including a successful empty list — is taken as said.
 */
export async function loadCampaigns() {
  const r = await request('/api/campaigns', { cache: 'no-store' });
  const absent = !r.ok && (r.status === 404 || r.kind === 'network');
  if (absent) {
    read = { campaigns: await synthesize(), ok: true, synthesized: true };
    return read;
  }
  if (!r.ok) {
    read = { campaigns: [], ok: false, synthesized: false, message: r.message };
    return read;
  }
  const rows = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.campaigns) ? r.data.campaigns : [];
  read = { campaigns: rows.map(shape).filter((row) => row.id), ok: true, synthesized: false };
  return read;
}

/** Every Campaign the last read returned, archived ones included. */
export const campaigns = () => read?.campaigns ?? [];
/** The ones a selector may offer: archived hides by default and kills nothing. */
export const visibleCampaigns = () => campaigns().filter((row) => row.state !== 'archived');
export const campaignById = (id) => campaigns().find((row) => row.id === id) || null;

/**
 * THE INITIAL CAMPAIGN — what an UNMARKED record belongs to while the migration window
 * is open (@campaign_scope + @league_lead, 2026-08-29).
 *
 * The server emits `campaign_id: ''` for a record nobody has stamped: empty is the honest
 * answer, and a server that fabricated an id it never wrote would be a second writer. The
 * `'' -> initial` mapping is the compatibility READ, and it lives here, in one place, to
 * be deleted with the fallback.
 *
 * The initial Campaign is the EARLIEST — the store's list order is deterministic
 * (`created_at`, then `id`), so it is simply the first row. Archived counts: the owner may
 * have archived the Campaign their install started as, and its legacy records still belong
 * to it. This reads `campaigns()` rather than `visibleCampaigns()` for exactly that reason.
 */
export const initialCampaignId = () => campaigns()[0]?.id || '';
export const campaignsFailed = () => !!read && !read.ok;
export const campaignsMessage = () => read?.message || '';
/** Did the last read invent its list because no Campaign API answered? */
export const isSynthesized = () => !!read?.synthesized;

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
  if (!isSynthesized()) {
    // PUT is the store's one edit door and it takes ONLY THE KEYS STATED
    // (src/routes/campaigns-api.ts) — so a partial edit stays partial and the keys this
    // call does not name are left alone. There is no PATCH route; sending one 404s, which
    // is how the Identity and Desk Profile saves failed silently before.
    const r = await request(`/api/campaigns/${encodeURIComponent(id)}`, { method: 'PUT', json: fields });
    if (r.ok) await loadCampaigns();
    return r;
  }
  if ('desk_profile' in fields) {
    const r = await request('/api/settei/desk', { method: 'PUT', json: { profile: text(fields.desk_profile) } });
    if (!r.ok) return r;
  }
  if ('title' in fields || 'description' in fields) {
    const now = campaignById(id) || {};
    const r = await request('/api/settei/campaign', {
      method: 'PUT',
      json: {
        name: 'title' in fields ? text(fields.title) : now.title,
        description: 'description' in fields ? text(fields.description) : now.description,
      },
    });
    if (!r.ok) return r;
  }
  await loadCampaigns();
  return { ok: true, status: 200, data: campaignById(id) || {} };
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

/** The ordered ids a normalized selection actually resolves to. */
export function selectedIds(selection) {
  const healed = normalizeSelection(selection);
  return healed.mode === 'all' ? visibleCampaigns().map((row) => row.id) : healed.campaign_ids;
}

/** The Campaign whose desk_profile paints the combined face, or null. */
export const primaryCampaign = (selection) => campaignById(normalizeSelection(selection).primary_campaign_id);

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
