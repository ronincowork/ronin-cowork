/**
 * ONE PLACE WHERE A LAUNCH IS BOUND TO ITS CONVERSATION.
 *
 * Ronin starts the agent's CLI, and that CLI keeps its own conversation journal on disk.
 * Nothing afterwards can reliably say which journal belongs to which pane — a working
 * directory cannot, because `project_root` is shared by nearly every session on a project,
 * and matching by "newest file in that directory" hands two live sessions each other's
 * conversation as the ordinary case (found in review, 2026-09-22).
 *
 * The moment the binding is knowable is the moment we build the command. So every launch
 * passes through here, and each CLI either gets an assigned id or is told, in one place,
 * why it could not have one. A provider that cannot be bound is not quietly guessed at
 * later — it is recorded as unbound and its transcript stays unavailable.
 *
 * This function does not decide whether a transcript is recorded, served, or shown. It
 * only makes the launch knowable. The Services part reads the id back off the launched
 * command; if this is never called, nothing breaks and nothing binds.
 */
import { randomUUID } from 'node:crypto';

export interface StampedLaunch {
  /** The command to actually start, stamped when the CLI supports it. */
  cmd: string;
  /** The provider's own session id, when this launch assigned or already named one. */
  providerSession?: string;
  /** Why it is what it is, in words. Returned for the caller to record or log; nothing
   * downstream depends on it, and it is deliberately not parsed. */
  note: string;
}

/** Does the command already name a conversation? Then it is already bound; leave it alone. */
const NAMED = /--session-id[= ]+([0-9a-fA-F-]{8,})|--resume[= ]+([0-9a-fA-F-]{8,})|\bresume\s+([0-9a-fA-F-]{8,})/;

/**
 * Stamp a launch command with an assigned provider session id where the CLI allows it.
 *
 * `claude` takes `--session-id <uuid>`: we generate the id, so the journal's filename is
 * known before the process starts. Exact, with no directory matching anywhere.
 *
 * `codex` has no equivalent — it mints its own id and names the rollout after it, and
 * `codex resume <id>` only continues a session that already exists. So a fresh Codex
 * launch cannot be bound at this point, and says so rather than pretending.
 *
 * An unrecognised CLI is left exactly as it is. Appending a flag to a command we do not
 * understand is a worse failure than leaving it unbound.
 */
export function stampProviderSession(cmd: string, cli: string, id: () => string = randomUUID): StampedLaunch {
  const trimmed = (cmd ?? '').trim();
  if (!trimmed) return { cmd, note: 'no command: nothing to bind' };

  const already = NAMED.exec(trimmed);
  if (already) {
    return {
      cmd,
      providerSession: already[1] ?? already[2] ?? already[3],
      note: 'the command already names its conversation; left as written',
    };
  }

  if (cli === 'claude') {
    const uuid = id();
    return {
      cmd: `${trimmed} --session-id ${uuid}`,
      providerSession: uuid,
      note: 'assigned at launch with --session-id',
    };
  }

  if (cli === 'codex') {
    return {
      cmd,
      note: 'codex assigns its own session id and cannot be given one at launch; left unbound',
    };
  }

  return { cmd, note: `no binding known for the ${cli || 'unnamed'} CLI; left unbound` };
}
