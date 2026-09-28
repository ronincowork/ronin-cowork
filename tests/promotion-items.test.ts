/**
 * A completed promotion moves every work item named on the hand-ins it carries to DONE,
 * with the promotion receipt on the item's trail, and its notices name the item and the
 * write that keeps it current (owner, 2026-09-28: acknowledgements nag, tools do not).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-promotion-items-'));
process.env.RONIN_DESKS_DIR = path.join(tmp, 'desks');
process.env.RONIN_WORK_ITEMS_DIR = path.join(tmp, 'work-items');

const { appendReceipt } = await import('../src/desks/receipts.js');
const { announcePromotion } = await import('../src/promotion/promote.js');
const { createItem, readItem } = await import('../src/work-items.js');
type Receipt = Parameters<typeof appendReceipt>[0];
type Promotion = Parameters<typeof announcePromotion>[0];
type Fx = Parameters<typeof announcePromotion>[2];

test('promotion moves each carried item to DONE once and says how to keep it current', async () => {
  const { item } = await createItem({ title: 'Promoted', stage: 'LAND' }, 'fable');
  await appendReceipt({
    id: 'hi_1', repo: 'cowork', line: 'team/comp/dev', desk: 'team/comp/fable', session: 'fable', result: 'accepted',
    at: new Date().toISOString(), source_tip: 'a', expected_old: 'b', candidate: 'c', line_sha: 'c', conflict_files: [], reason: '', project_id: item.id,
  } as unknown as Receipt);
  const notices: string[] = [];
  const fx = {
    notify: async (_dir: string, _team: string, text: string) => { notices.push(text); return 'posted'; },
    tell: async (_session: string, text: string) => { notices.push(text); return 'told'; },
  } as unknown as Fx;
  const receipt = {
    id: 'promo_1', kind: 'team_promotion', team: 'comp', by: 'lead', restart: { ok: true },
    repos: [{ repo: 'cowork', line: 'team/comp/dev', target: 'dev', candidate: 'c0ffee0', hand_in_receipts: ['hi_1'], sessions: ['fable'] }],
  } as unknown as Promotion;
  await announcePromotion(receipt, tmp, fx, () => undefined);

  const back = (await readItem(item.id))!;
  assert.equal(back.stage, 'DONE');
  assert.equal(back.trail.length, 2, 'create, then one line for the promotion');
  assert.deepEqual([back.trail[1]!.op, back.trail[1]!.from, back.trail[1]!.to, back.trail[1]!.note, back.trail[1]!.by], ['stage', 'LAND', 'DONE', 'promotion promo_1', 'lead']);
  const keep = `${item.id} moved to done. Keep it current: work-record project write ${item.id}`;
  assert.equal(notices.length, 2);
  for (const text of notices) assert.ok(text.includes(keep), text);
});
