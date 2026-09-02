import { attemptMessage, enqueueMessage, pendingTellsFrom, type MessageSource } from './message-queue.js';
import { isValidName } from './tmux.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const args = process.argv.slice(2);
const sources = new Set<MessageSource>(['tell', 'wipeboard_notice', 'owner', 'house']);
const source: MessageSource = sources.has(args[0] as MessageSource) ? args.shift() as MessageSource : 'tell';
const target = args.shift() ?? '';
const text = args.join(' ').trim();
if (!isValidName(target) || !text) {
  console.error('usage: message-cli [tell|wipeboard_notice|house] <session> <message...>');
  process.exit(2);
}
const from = source === 'tell' && process.env.TMUX_PANE
  ? await promisify(execFile)('tmux', ['display-message', '-p', '-t', process.env.TMUX_PANE, '#S'])
      .then(({ stdout }) => stdout.trim() || 'Agent').catch(() => 'Agent')
  : undefined;
if (source === 'tell') {
  const sender = from ?? 'Agent';
  const pending = await pendingTellsFrom(sender, target);
  if (pending.length) {
    console.log(`NOT SENT to '${target}': ${pending.length} unresolved tell(s) from '${sender}' already visible in Messages (${pending.map((item) => item.id).join(', ')}). Let them deliver or dismiss them before sending new wording.`);
    process.exit(3);
  }
}
const item = await enqueueMessage(target, text, source, from);
const retained = await attemptMessage(item.id, 'safe');
console.log(retained
  ? `QUEUED for '${target}': ${retained.reason} (message ${retained.id})`
  : `DELIVERED to '${target}'.`);
