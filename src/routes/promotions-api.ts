// GET /api/promotions/:id/live — whether a promotion went live (KAN-311): the item reader's
// "Handed in" line ends "· live" only when that promotion's receipt in the promotion ledger
// (src/promotion/receipts.ts) is complete, its restart ran ok and its health checks passed. A
// --no-restart promotion has no restart and is not live. A read only; nothing here writes.
import type express from 'express';
import { readReceipt, type PromotionReceipt } from '../promotion/receipts.js';

/** A ledger id is a timestamp, "promote", a team and a tag: nothing that walks a path. */
export const isPromotionId = (id: string): boolean => /^[0-9TZ]+-promote-[a-z0-9_-]+$/i.test(id);

/** Live: complete, restarted ok, health passed. */
export const isLive = (r: Pick<PromotionReceipt, 'state' | 'restart' | 'health'> | null): boolean =>
  Boolean(r && r.state === 'complete' && r.restart?.ok && r.health?.passed);

export function registerPromotions(app: express.Express, read: typeof readReceipt = readReceipt): void {
  app.get('/api/promotions/:id/live', async (req, res) => {
    const id = String(req.params.id || '');
    if (!isPromotionId(id)) return res.status(400).json({ ok: false, error: 'Not a promotion id.' });
    try {
      const r = await read(id);
      if (!r) return res.status(404).json({ ok: false, error: `No promotion ${id}.` });
      res.json({ ok: true, id, state: r.state, restarted: Boolean(r.restart?.ok), healthy: Boolean(r.health?.passed), live: isLive(r) });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });
}
