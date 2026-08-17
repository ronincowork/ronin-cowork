/**
 * SETTEI — the ⚙ Setup tab's one read and its narrow writes.
 *
 * `GET /api/settei` hands back the whole record: what the owner set, what the box
 * observed, and what follows from both (src/settei.ts). One call, because the tab's
 * entire job is showing an install in one place and three round trips would be three
 * chances to render half of one.
 *
 * **THE WRITES ARE BY NAME, AND THAT IS THE SAFETY PROPERTY.** There is no
 * `PUT /api/settei` that takes a document. `ronin.json` carries `auth` — a scrypt record
 * and the secret that signs session tokens — and `passkeys`; a route that accepted the
 * config and wrote it would let a browser post a new signing secret. So each endpoint
 * below names the keys it may touch and ignores everything else in the body, and each
 * goes through `updateConfig`, which preserves every section the caller never heard of.
 *
 * NO CREDENTIAL CROSSES THIS BOUNDARY in either direction. The record reports a key's
 * variable NAME and whether it is set; there is no route here that accepts a key value,
 * by design and not by omission.
 *
 * The session max and the owner name keep their existing routes in `routes/launch.ts` —
 * the cap appears in both ⚙ Setup and ⌂ Roster **over one route** (owner, 2026-08-17):
 * two views of one number, never two settings.
 */
import type express from 'express';
import { readSettei } from '../settei.js';
import {
  completeSetup,
  readAgentsSection,
  writeAgentsSection,
  writeGbrainSection,
  writeMachineSection,
  writeServicesSection,
} from '../user-config.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);

/** A string field the owner typed, or undefined when they did not send one. */
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export function registerSettei(app: express.Express): void {
  /**
   * THE RECORD. Assembled per request and never cached: two of its three sections are
   * measurements, and a cached measurement is a stale one with no way to tell.
   */
  app.get('/api/settei', async (_req, res) => {
    try {
      res.json(await readSettei());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /** What you call this box, and where it is. Both free text; `where` by ruling. */
  app.put('/api/settei/machine', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      await writeMachineSection({ name: str(body.name), where: str(body.where) });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /**
   * HOW WORK GETS A MODEL. The default a new session launches as, and which provider
   * serves each model-fed house job.
   *
   * `key_env` is accepted because it is a variable NAME — the thing a person points at.
   * A body carrying a key VALUE has nowhere to land: no field here reads one.
   */
  app.put('/api/settei/agents', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sessions = (body.sessions ?? {}) as { default?: Record<string, unknown> };
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
    try {
      // MERGE, DO NOT REPLACE — and this is not tidiness. Two surfaces write here: the
      // first-load page and the ⚙ Setup room, and a job is keyed by name, so a caller
      // that sends only the job it changed would otherwise delete every other job and
      // the session default with them. Sending the whole section is a convention, and a
      // convention is not a guarantee. Only the keys actually present in the body move.
      const prior = await readAgentsSection();
      const priorJobs = (prior.jobs ?? {}) as Record<string, unknown>;
      const priorSessions = (prior.sessions ?? {}) as { default?: Record<string, unknown> };
      await writeAgentsSection({
        sessions: body.sessions === undefined
          ? priorSessions
          : { default: { provider: str(d.provider) ?? null, model: str(d.model) ?? null } },
        jobs: body.jobs === undefined ? priorJobs : { ...priorJobs, ...jobs },
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /**
   * FIRST RUN IS FINISHED — the only way the pending flag is ever cleared.
   *
   * Deliberately its own endpoint rather than a side-effect of the last field being
   * saved: a person can leave the surface half-answered and come back, and a flag that
   * cleared itself on the last write would decide that for them. The surface says when
   * it is done, because only the surface knows.
   *
   * There is no route to SET pending. A box is stamped at birth, once, by
   * `stampFreshInstall()` — the moment `ronin.json` does not exist — and nothing can
   * re-arm it over HTTP, so no request can put an established install back into first
   * run. That is the regression this whole key exists to prevent, closed at the door.
   */
  app.put('/api/settei/setup', async (_req, res) => {
    try {
      await completeSetup();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /** The gbrain toggle. A setting, not an installer — pressing it installs nothing. */
  app.put('/api/settei/gbrain', async (req, res) => {
    try {
      await writeGbrainSection((req.body as { enabled?: unknown })?.enabled === true);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  /**
   * THE SUBSCRIPTION. The id arrives as a code the owner pastes from the verification
   * email (owner, 2026-08-17) — chosen over the install polling us, which would have
   * added an outbound destination and made it an egress decision rather than a field.
   *
   * **This route records; it does not verify.** Verification happens where the email
   * was sent, and the collector holds the join. Writing a code here is the owner saying
   * *this is my entitlement*, and the id gates nothing on this box, so a wrong one costs
   * a wrong line in a record rather than access to anything.
   */
  app.put('/api/settei/services', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      await writeServicesSection({
        entitlement: str(body.entitlement) ?? null,
        email: str(body.email) ?? null,
        verified: str(body.verified) ?? null,
        terms: str(body.terms) ?? null,
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });
}
