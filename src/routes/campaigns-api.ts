/**
 * CAMPAIGN ROUTES — the durable record of each body of work.
 *
 * A Campaign is the outer object: many Coworks, many Project roots and many Agents point
 * back at one with `campaign_id`, and this surface serves the record they point at. It
 * serves NO membership and no lists of any kind — asking "what is in this Campaign" is a
 * question for the roster, root and session surfaces, filtered by id, and answering it
 * here would be the embedded-list the plan forbids.
 *
 * **CREATE SAVES THE CAMPAIGN AND STOPS** (owner, 2026-08-29). New Campaign sets the stage:
 * it writes one `machine settings campaign record` and selects it. It creates no Cowork, no team_roster, no
 * project_root and launches no Agent — and that is true here by construction rather than by
 * care, because this module imports none of those stores. The response is the whole record
 * so the client has the id it needs to select without a second round trip.
 *
 * ARCHIVE HIDES AND KILLS NOTHING. It is `state: 'archived'` on one record; every Agent in
 * that Campaign keeps running, every desk survives, and un-archiving is the same route with
 * the other value. Deletion is deliberately absent: nothing on a button deletes a record
 * that other objects still point at.
 */
import type express from 'express';
import {
  archiveCampaign,
  createCampaign,
  isValidCampaignId,
  listCampaigns,
  readCampaign,
  writeCampaign,
  type CampaignEdit,
  type CampaignState,
} from '../campaigns.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);

/** A string the caller typed, or undefined when they sent none — the difference between
 *  "clear this field" and "do not touch it", and an edit must keep them apart. */
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const state = (v: unknown): CampaignState | undefined =>
  v === 'active' || v === 'archived' ? v : undefined;

/** The shape a write may state. `id` and `created_at` are refused BY NAME rather than
 *  ignored: both are immutable, and a caller sending one has a wrong model of the object,
 *  which is worth saying out loud once instead of silently dropping forever. */
function editOf(body: unknown): CampaignEdit {
  const b = (body ?? {}) as Record<string, unknown>;
  for (const k of ['id', 'created_at']) {
    if (b[k] !== undefined) {
      throw new Error(
        `"${k}" cannot be changed — it is the Campaign's identity, and every campaign_id pointing at it would have to move too.`,
      );
    }
  }
  const config = b.config && typeof b.config === 'object' && !Array.isArray(b.config)
    ? (b.config as CampaignEdit['config'])
    : undefined;
  const desk = b.desk && typeof b.desk === 'object' && !Array.isArray(b.desk)
    ? (b.desk as CampaignEdit['desk'])
    : undefined;
  return {
    ...(str(b.title) !== undefined ? { title: str(b.title) } : {}),
    ...(str(b.description) !== undefined ? { description: str(b.description) } : {}),
    ...(str(b.desk_profile) !== undefined ? { desk_profile: str(b.desk_profile) } : {}),
    ...(desk !== undefined ? { desk } : {}),
    ...(state(b.state) !== undefined ? { state: state(b.state) } : {}),
    ...(config !== undefined ? { config } : {}),
  };
}

export function registerCampaigns(app: express.Express): void {
  /**
   * EVERY CAMPAIGN, in the store's one deterministic order (created_at, then id).
   *
   * Archived records are included so a management surface can show and un-archive them;
   * `?state=active` is the ordinary filter a selector uses. An EMPTY LIST IS AN ANSWER and
   * not an absence — a client must paint its empty state on `[]` and fall back to its
   * compatibility synthesis only when this route is unreachable.
   */
  app.get('/api/campaigns', async (req, res) => {
    try {
      const all = await listCampaigns();
      const want = String(req.query.state ?? '');
      res.json({ campaigns: want === 'active' || want === 'archived' ? all.filter((c) => c.state === want) : all });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /** ONE CAMPAIGN. 404 when there is no such record — an id that does not resolve is a
   *  missing record, never an empty one invented to keep a client happy. */
  app.get('/api/campaigns/:id', async (req, res) => {
    try {
      const c = await readCampaign(String(req.params.id));
      if (!c) return res.status(404).json({ error: `no Campaign named '${req.params.id}'` });
      res.json(c);
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /**
   * CREATE — and STOP. One record written, the whole record returned, nothing else touched.
   * The id is derived from the title unless the caller names one, and it is frozen at that
   * moment; 409 when it is already taken, because creating over a Campaign is a different
   * intent from editing one.
   */
  app.post('/api/campaigns', async (req, res) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const id = str(b.id);
      if (id !== undefined && !isValidCampaignId(id)) {
        return res.status(400).json({ error: `"${id}" is not a usable Campaign id — lowercase letters, digits, - and _ only.` });
      }
      const edit = editOf({ ...b, id: undefined });
      const created = await createCampaign({ ...edit, ...(id !== undefined ? { id } : {}) });
      res.status(201).json(created);
    } catch (e) {
      const msg = errMsg(e);
      res.status(/already exists/.test(msg) ? 409 : 400).json({ error: msg });
    }
  });

  /** EDIT — only the keys stated. The id and created_at are refused, not ignored. */
  app.put('/api/campaigns/:id', async (req, res) => {
    try {
      res.json(await writeCampaign(String(req.params.id), editOf(req.body)));
    } catch (e) {
      const msg = errMsg(e);
      res.status(/does not exist/.test(msg) ? 404 : 400).json({ error: msg });
    }
  });

  /** ARCHIVE — hides by default, kills nothing. Un-archive is PUT with state: 'active'. */
  app.post('/api/campaigns/:id/archive', async (req, res) => {
    try {
      res.json(await archiveCampaign(String(req.params.id)));
    } catch (e) {
      const msg = errMsg(e);
      res.status(/does not exist/.test(msg) ? 404 : 400).json({ error: msg });
    }
  });
}
