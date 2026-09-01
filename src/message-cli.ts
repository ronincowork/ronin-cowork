import { attemptMessage, enqueueMessage, type MessageSource } from './message-queue.js';
import { isValidName } from './tmux.js';

const args = process.argv.slice(2);
const sources = new Set<MessageSource>(['tell', 'wipeboard_notice', 'owner', 'house']);
const source: MessageSource = sources.has(args[0] as MessageSource) ? args.shift() as MessageSource : 'tell';
const target = args.shift() ?? '';
const text = args.join(' ').trim();
if (!isValidName(target) || !text) {
  console.error('usage: message-cli [tell|wipeboard_notice|house] <session> <message...>');
  process.exit(2);
}
const item = await enqueueMessage(target, text, source);
const retained = await attemptMessage(item.id, 'safe');
console.log(retained
  ? `QUEUED for '${target}': ${retained.reason} (message ${retained.id})`
  : `DELIVERED to '${target}'.`);
