/** THE HOLDS HOOK (w418): every write of a holds list (a Team roster, an Agent's letter, a
 * Workspace's holds) reports the list as it now stands, so the live index (work-items-index.ts)
 * keeps each row's holders in the same step. `key` names the list (one file), `label` is the
 * holder it shows as (team:<name>, agent:<name>, workspace:<name>), `ids` the list now (empty
 * is a list holding nothing); an empty label is the list itself removed. No imports, so the stores can call it without a cycle; until
 * the index is in use it does nothing (the index is rebuilt from the files when first read). */
type Listener = (key: string, label: string, ids: string[]) => void;
let listener: Listener | null = null;

export function onHoldsWritten(fn: Listener): void { listener = fn; }
export function holdsWritten(key: string, label: string, ids: string[]): void { listener?.(key, label, ids); }

export const rosterListKey = (campaign: string, name: string): string => `team:${campaign}/${name}`;
export const letterListKey = (key: string): string => `letter:${key}`;
export const workspaceListKey = (campaign: string, name: string): string => `workspace:${campaign}/${name}`;
