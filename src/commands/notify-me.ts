import { messageSender } from '../message-sender.js';
import { markTurnEnd } from '../notify-me.js';
import { isValidName, listSessions } from '../tmux.js';

const [agent = '', ...rest] = process.argv.slice(2);
if (!isValidName(agent) || rest.length) {
  console.error('usage: notify_me <agent>');
  process.exit(2);
}
const caller = await messageSender();
if (caller === 'Agent') {
  console.log('NO-SESSION: notify_me runs in an Agent\'s pane; nothing was marked.');
  process.exit(3);
}
if (!(await listSessions()).some((session) => session.name === agent)) {
  console.log(`NO-SESSION: no Agent named "${agent}"; nothing was marked.`);
  process.exit(3);
}
await markTurnEnd(agent, caller);
console.log(`MARKED ${agent}: one line reaches you when its turn ends.`);
