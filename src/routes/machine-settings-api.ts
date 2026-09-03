/**
 * SETTEI — the one read and the one write door.
 *
 * `GET /api/machine-settings` hands back the whole record: what the owner set, what the box
 * observed, what follows from both, and the schema that declares it (src/machine-settings.ts).
 * One call, because the tab's entire job is showing an install in one place and three
 * round trips would be three chances to render half of one.
 *
 * **THE WRITES ARE BY NAME, AND THAT IS THE SAFETY PROPERTY.** There is no
 * `PUT /api/machine-settings` that takes a document. `ronin.json` carries `auth` — a scrypt record
 * and the secret that signs session tokens — and `passkeys`; a route that accepted the
 * config and wrote it would let a browser post a new signing secret. So the one door,
 * `PUT /api/machine-settings/:family`, accepts only the families named in FAMILY_WRITERS below —
 * each writer names the keys it may touch and ignores everything else in the body, and
 * each goes through `updateConfig`, which preserves every section the caller never
 * heard of. An unknown family is refused, never guessed at.
 *
 * NO CREDENTIAL CROSSES THIS BOUNDARY in either direction. The record reports a key's
 * variable NAME and whether it is set; there is no route here that accepts a key value,
 * by design and not by omission.
 *
 * NOT EVERY FAMILY LIVES HERE, and the registry's `families` table says where each one
 * goes: the session max keeps its shared route with ⌂ Roster in `routes/launch.ts` —
 * two views of one number, never two settings (owner, 2026-08-17) — and the first
 * project lands in the catalogs store via `POST /api/project-roots`, which settei
 * references and never owns. The owner's name DID fold in (its only callers were the
 * setup surfaces, measured 2026-08-18): `owner` is a family below, writing through
 * `writeOwner()` so the tmux bus copy republishes exactly as before.
 */
import type express from 'express';
import { readMachineSettings } from '../machine-settings.js';
import {
  completeSetup,
  writeWantedSection,
  readSetupSection,
  readAgentsSection,
  writeAgentsSection,
  writeMachineSection,
  writeOwner,
  writeDesksSection,
} from '../user-config.js';
// The Campaign and its desk_profile are one durable record now; these two writers land in
// the initial campaign_config, which is the only writable Campaign record on the box.
import { writeCampaignSection, writeDeskSection } from '../campaign-config.js';
import { populateHomeMachine } from '../campaign-config.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);

/** A string field the owner typed, or undefined when they did not send one. */
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * THE FAMILIES THE DOOR WRITES — one narrow writer per family, nothing dynamic.
 * Adding a family is one entry here and its row in the registry; the route itself
 * never changes. Each writer returns the body of its 200.
 */
const FAMILY_WRITERS: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
  bootstrap: async (body) => {
    const campaign = await populateHomeMachine(body);
    await writeDesksSection({ new_project: body.routine_bundle === 'control' || body.routine_bundle === 'services' ? 'managed' : 'none' });
    return { ok: true, campaign_id: campaign.id };
  },
  campaign: async (body) => {
    await writeCampaignSection({ name: str(body.name), description: str(body.description) });
    return { ok: true };
  },
  /** What you call yourself. A blank name is how you ask for the default back, not an
   * error; `writeOwner` republishes to the tmux option so bash tools agree at once. */
  owner: async (body) => ({ name: await writeOwner(String(body.name ?? '').trim()) }),

  /** What you call this box, where it is, and whether Ronin watches it. Name and where
   * are free text (`where` by ruling); `monitor` defaults ON and only an explicit false
   * turns the reading off. */
  machine: async (body) => {
    await writeMachineSection({
      name: str(body.name),
      where: str(body.where),
      monitor: typeof body.monitor === 'boolean' ? body.monitor : undefined,
    });
    return { ok: true };
  },

  /**
   * HOW WORK GETS A MODEL. The default a new session launches as, and which provider
   * serves each model-fed house job.
   *
   * `key_env` is accepted because it is a variable NAME — the thing a person points at.
   * A body carrying a key VALUE has nowhere to land: no field here reads one.
   *
   * MERGE, DO NOT REPLACE — and this is not tidiness. Two surfaces write here, and a
   * job is keyed by name, so a caller that sends only the job it changed would
   * otherwise delete every other job and the session default with them. Only the keys
   * actually present in the body move.
   */
  agents: async (body) => {
    const sessions = (body.sessions ?? {}) as {
      default?: Record<string, unknown>;
      by_provider?: Record<string, unknown>;
    };
    const d = (sessions.default ?? {}) as Record<string, unknown>;
    const jobsIn = (body.jobs ?? {}) as Record<string, Record<string, unknown>>;

    const jobs: Record<string, unknown> = {};
    for (const [name, j] of Object.entries(jobsIn)) {
      jobs[name] = {
        outlet: str(j?.outlet) ?? null,
        provider: str(j?.provider) ?? null,
        model: str(j?.model) ?? null,
        key_env: str(j?.key_env) ?? null,
      };
    }
    const prior = await readAgentsSection();
    const priorJobs = (prior.jobs ?? {}) as Record<string, unknown>;
    const priorSessions = (prior.sessions ?? {}) as {
      default?: Record<string, unknown>;
      by_provider?: Record<string, unknown>;
    };
    // THE TWO SESSION SETTINGS MERGE INDEPENDENTLY, and this is the same hazard the
    // jobs map above already documents, one level deeper. ⚙ saves ONE row at a time, so
    // a body carrying only `sessions.default` used to replace the whole `sessions`
    // object and take `by_provider` with it — and a body carrying only a per-provider
    // preference would have taken the general default. Each key moves only when the
    // body actually carries it.
    const byProviderIn = (sessions.by_provider ?? {}) as Record<string, unknown>;
    const priorByProvider = (priorSessions.by_provider ?? {}) as Record<string, unknown>;
    const byProvider: Record<string, unknown> = { ...priorByProvider };
    // A blank arrives as null, not as an empty string. Null says the owner has no
    // preference for a provider this box knows, which is a different fact from never
    // having seen it — and `src/spawn.ts` reads both the same way, falling back to that
    // provider's first column. (⚙ itself omits blanks by the registry's `omit: 'blank'`
    // rule, as it does for every text row, so a clear arrives through the API.)
    for (const [provider, model] of Object.entries(byProviderIn)) byProvider[provider] = str(model)?.trim() || null;
    await writeAgentsSection({
      sessions: body.sessions === undefined
        ? priorSessions
        : {
            default: sessions.default === undefined
              ? (priorSessions.default ?? { provider: null, model: null })
              : { provider: str(d.provider) ?? null, model: str(d.model) ?? null },
            by_provider: byProvider,
          },
      jobs: body.jobs === undefined ? priorJobs : { ...priorJobs, ...jobs },
    });
    return { ok: true };
  },

  /** THE DESK (R38) — which desk_profile the surfaces read their defaults from. A blank
   * is how you go back to stock, not an error; an unknown token is stored as typed and
   * reads back as null (a profile can be removed after it was chosen). */
  desk: async (body) => {
    await writeDeskSection({ profile: str(body.profile) ?? '' });
    return { ok: true };
  },
  /** NEW PROJECTS AND DESKS — the default a new project's RONIN_REPO is written from. */
  desks: async (body) => {
    await writeDesksSection({ new_project: str(body.new_project) ?? 'managed' });
    return { ok: true };
  },

  /** THE WANT LIST — whole-list replace of the owner's typed intents. Five verbs only;
   * anything else in the body has nowhere to land. The list is intent: needed[] is
   * judged from it per read and never stored. */
  wanted: async (body) => {
    const kinds = new Set(['agent', 'service', 'tool', 'key', 'set']);
    const list = (Array.isArray(body.wanted) ? body.wanted : [])
      .filter((w): w is { kind: string; name: string } =>
        kinds.has(String((w as Record<string, unknown>)?.kind)) && typeof (w as Record<string, unknown>)?.name === 'string')
      .map((w) => ({ kind: w.kind, name: w.name }));
    await writeWantedSection(list);
    return { ok: true, wanted: list };
  },

};

export function registerMachineSettings(app: express.Express): void {
  /**
   * THE RECORD. Assembled per request and never cached: two of its three sections are
   * measurements, and a cached measurement is a stale one with no way to tell.
   */
  app.get('/api/machine-settings', async (_req, res) => {
    try {
      res.json(await readMachineSettings());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /**
   * FIRST RUN IS FINISHED — the only way the pending flag is ever cleared.
   *
   * Deliberately its own endpoint, registered BEFORE the family door so `setup` can
   * never fall through to it: a person can leave the surface half-answered and come
   * back, and a flag that cleared itself on the last write would decide that for them.
   * There is no route to SET pending — a box is stamped at birth, once, by
   * `stampFreshInstall()`, and nothing can re-arm it over HTTP.
   */
  app.put('/api/machine-settings/setup', async (_req, res) => {
    try {
      await completeSetup();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /**
   * IS THIS BOX WAITING FOR ITS FIRST RUN? The client asks this on every load, so it
   * reads one section of the config file and measures nothing — and it stays outside
   * the heavy door on purpose: `main.js` routes on this answer and a failed read stays
   * quiet by design.
   */
  app.get('/api/machine-settings/setup', async (_req, res) => {
    try {
      const s = await readSetupSection();
      res.json({ pending: s.pending === true, completed_at: s.completed_at ?? null });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /** THE ONE WRITE DOOR. Every family the record owns saves through here. */
  app.put('/api/machine-settings/:family', async (req, res) => {
    const family = String(req.params.family);
    const writer = FAMILY_WRITERS[family];
    if (!writer) {
      return res.status(404).json({ error: `no settei family named '${family}'` });
    }
    try {
      res.json(await writer((req.body ?? {}) as Record<string, unknown>));
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });
}
