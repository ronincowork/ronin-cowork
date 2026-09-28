/**
 * READINGS — derived from the store and the holder lists, never stored.
 * agent: the items an Agent holds, with its focus item's ladder and every held item's docs.
 */
import { readLetterHolds } from './tegami.js';
import { sessionKey } from './session-dir.js';
import { readItem, type Rung, type WorkItem } from './work-items.js';

export interface AgentReading {
  holder: string;
  items: WorkItem[];
  focus: string | null;
  at: { rung?: number; leg?: number } | null;
  ladder: Rung[];
  docs: string[];
}

const present = (items: Array<WorkItem | null>): WorkItem[] => items.filter((item): item is WorkItem => item !== null);

export async function agentReading(session: string): Promise<AgentReading> {
  const letter = await readLetterHolds(await sessionKey(session));
  const items = present(await Promise.all((letter?.holds ?? []).map((id) => readItem(id))));
  const named = typeof letter?.at?.item === 'string' ? letter.at.item : null;
  const focus = items.find((item) => item.id === named) ?? items[0] ?? null;
  const at = focus && letter?.at?.item === focus.id
    ? { ...(Number.isInteger(letter.at.rung) ? { rung: letter.at.rung as number } : {}), ...(Number.isInteger(letter.at.leg) ? { leg: letter.at.leg as number } : {}) }
    : null;
  return {
    holder: `agent:${session}`,
    items,
    focus: focus?.id ?? null,
    at: at && Object.keys(at).length ? at : null,
    ladder: focus?.ladder ?? [],
    docs: [...new Set(items.flatMap((item) => item.docs))],
  };
}
