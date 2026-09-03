import { finishPromotionRestart } from '../promotion/promote.js';
import { readReceipt } from '../promotion/receipts.js';

const id = process.argv[2] ?? '';
const receipt = id ? await readReceipt(id) : null;
if (!receipt) throw new Error(`no promotion receipt ${id}`);
const outcome = await finishPromotionRestart(receipt);
if (!outcome.ok) process.exitCode = 1;
