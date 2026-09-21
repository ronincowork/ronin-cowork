import { enqueueMessage, type MessageSource } from '../message-queue.js';
import { messageSender } from '../message-sender.js';
import { isValidName } from '../tmux.js';

const args = process.argv.slice(2);
const sources = new Set<MessageSource>(['tell', 'wipeboard_notice', 'owner', 'house', 'jikan']);
const source: MessageSource = sources.has(args[0] as MessageSource) ? args.shift() as MessageSource : 'tell';
const explicitHouseFrom = source === 'house' && args[0] === '--from';
if (explicitHouseFrom) args.shift();
const houseFrom = explicitHouseFrom ? args.shift() ?? '' : '';
const target = args.shift() ?? '';
const text = args.join(' ').trim();
if (!isValidName(target) || !text || (explicitHouseFrom && !isValidName(houseFrom))) {
  console.error('usage: message-cli [tell|wipeboard_notice|house [--from <session>]] <session> <message...>');
  process.exit(2);
}
const from = source === 'tell'
  ? await messageSender()
  : houseFrom ? `@${houseFrom}` : undefined;
const item = await enqueueMessage(target, text, source, from);
console.log(`QUEUED for '${target}' (message ${item.id}).`);
