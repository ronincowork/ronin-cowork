import { enqueueMessage, type MessageSource } from '../message-queue.js';
import { messageSender } from '../message-sender.js';
import { isValidName, listSessions } from '../tmux.js';

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
const sessions = await listSessions();
// A Team is told through its live lead(s), the way every notice reaches a Team (work-items.ts namesOf).
const to = sessions.some((session) => session.name === target) ? [target]
  : sessions.filter((session) => session.leads.includes(target) && session.name !== from).map((session) => session.name);
if (!to.length) {
  console.log(`NO-SESSION: send failed, no session or led Team named "${target}"; nothing was queued.`);
  process.exit(3);
}
for (const name of to) {
  const item = await enqueueMessage(name, text, source, from);
  console.log(`QUEUED for '${name}'${name === target ? '' : ` (lead of ${target})`} (message ${item.id}).`);
}
