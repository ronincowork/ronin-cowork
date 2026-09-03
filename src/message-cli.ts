import { attemptMessage, enqueueMessage, MessageRefused, pendingTellsFrom, type MessageSource } from './message-queue.js';
import { isValidName } from './tmux.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const args = process.argv.slice(2);
const sources = new Set<MessageSource>(['tell', 'wipeboard_notice', 'owner', 'house', 'jikan']);
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
try {
  if (source === 'tell') {
    const sender = from ?? 'Agent';
    const pending = await pendingTellsFrom(sender, target);
    if (pending.length) console.warn(`WARNING: ${pending.length} unresolved tell(s) from '${sender}' to '${target}' remain visible in Messages; sending this one too.`);
  }
  const item = await enqueueMessage(target, text, source, from);
  const retained = await attemptMessage(item.id, 'safe');
  console.log(retained
    ? `QUEUED for '${target}': ${retained.reason} (message ${retained.id})`
    : `DELIVERED to '${target}'.`);
} catch (error) {
  if (error instanceof MessageRefused) {
    console.error(`REFUSED: ${error.message}`);
    process.exitCode = 4;
  } else {
    throw error;
  }
}
