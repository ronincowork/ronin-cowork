/**
 * PROVIDER PARTS — a model provider a Services part serves beside the CLIs (KAN-650): in a
 * hosted office, Ronin models, the house connection (samurai_lab/ronin_cloud/MODEL_MANAGEMENT.md §1).
 * The socket is this file and nothing else: a part registers once; Core joins its entry into
 * the provider rows (`providerRows`), counts it when it is operational, asks it to read its list
 * on Refresh all, and lets it wrap the argv of an Agent born or restored on it. Its rows run on a
 * registry CLI (`cli`), so launch, identity and resume stay Core's; `part` keeps them apart from
 * that CLI's own list on every surface.
 */
import type { ProviderRows } from './model-providers.js';

export interface ProviderPart {
  /** The provider id its entry and rows carry. */
  provider: string;
  /** Its entry, rows joined, with `part` set; null where it does not serve (self-hosted). */
  rows(): Promise<ProviderRows | null>;
  /** Refresh all: read its model list again. */
  refresh?(): Promise<void>;
  /** An Agent's argv just before birth on one of its rows; `person` is the launching person's
   * email (the birth receipt's user_email), '' when none. */
  /** Route a model-service launch or restore through the office relay. */
  wrapService?(argv: string[], person: string): string[];
  wrapLaunch?(argv: string[], person: string): string[];
  /** Core's resume argv for an Agent born on it, with the model it was born on and the same person. */
  wrapResume?(argv: string[], model: string, person: string): string[];
}

const parts: ProviderPart[] = [];
export function addProviderPart(part: ProviderPart): void { parts.push(part); }
export const providerPart = (provider: string): ProviderPart | undefined => parts.find((part) => part.provider === provider);

/** Every part's entry that serves here; a part that throws is left out. */
export async function partProviderRows(): Promise<ProviderRows[]> {
  const rows = await Promise.all(parts.map((part) => part.rows().catch(() => null)));
  return rows.filter((entry): entry is ProviderRows => !!entry);
}
export const operationalPartCount = async (): Promise<number> => (await partProviderRows()).filter((entry) => entry.operational).length;
export async function refreshProviderParts(): Promise<void> {
  await Promise.all(parts.map((part) => part.refresh?.().catch((e) => console.error(`[providers] ${part.provider} refresh:`, e))));
}
