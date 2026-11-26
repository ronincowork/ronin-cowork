/* Registration and feedback to Ronin HQ. The Ronin Services install flow (a Services key emailed by
 * Ronin HQ, the download, its stages) is retired: Services ships with Cowork (owner, 2026-11-26,
 * KAN-914; docs/architecture/installations.md). */
import type express from 'express';
import { buildKansou, sendKansou } from '../activation/kansou.js';
import { registrationAnswer, submitRegistration } from '../activation/registration.js';
import { deleteRegistration } from '../activation/registration.js';

export function registerServicesActivation(app: express.Express): void {
  app.get('/api/setup/registration', async (_req, res) => {
    res.json(await registrationAnswer());
  });

  app.post('/api/setup/registration', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const anonymous = body.identity_mode === 'anonymous';
      const saved = await submitRegistration(body);
      if (anonymous) {
        const message = [
          `Anonymous Ronin registration${saved.purpose ? `: ${saved.purpose}` : ''}`,
          saved.kind && `Kind: ${saved.kind}`,
          saved.kind_other && `Kind detail: ${saved.kind_other}`,
          saved.user_type && `User type: ${saved.user_type}`,
          saved.goals.length && `Why Ronin: ${saved.goals.join(', ')}`,
          saved.preferred_feature && `Preferred capability: ${saved.preferred_feature}`,
          saved.reasons.length && `Reasons: ${saved.reasons.join(', ')}`,
          saved.reason_other && `Other reason: ${saved.reason_other}`,
          saved.run_location && `Runs on: ${saved.run_location}`,
          saved.intended_use.length && `Intended use: ${saved.intended_use.join(', ')}`,
          saved.theme_preference && `Theme: ${saved.theme_preference}`,
          saved.own_words && `In their words: ${saved.own_words}`,
        ].filter(Boolean).join('\n');
        await sendKansou(buildKansou(saved.anonymous_packet_id, {
          message, feedback_kind: ['other'], using_ronin_for: saved.intended_use,
        })).catch(() => {}); // the packet is durable before immediate delivery is attempted
      }
      res.json(await registrationAnswer());
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Registration was not saved.' });
    }
  });

  app.delete('/api/setup/registration', async (_req, res) => {
    try {
      await deleteRegistration();
      res.json(await registrationAnswer());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Registration was not deleted.' });
    }
  });

  app.post('/api/feedback', async (req, res) => {
    try {
      const packet = buildKansou((req.body as any)?.packet_id, (req.body as any)?.body);
      res.status(201).json(await sendKansou(packet));
    } catch (error) {
      const invalid = error instanceof Error && ['feedback is empty', 'invalid feedback packet id', 'reply email is invalid'].includes(error.message);
      const message = error instanceof Error && error.message === 'feedback is empty'
        ? 'Write something or choose one of the optional answers.'
        : error instanceof Error && error.message === 'reply email is invalid' ? 'Enter an email address or leave it blank.'
        : invalid ? 'The feedback packet is not valid.'
        : 'Your feedback was kept on this machine, but Ronin HQ could not be reached. Press Send to retry.';
      res.status(invalid ? 400 : 503).json({ error: message });
    }
  });
}
