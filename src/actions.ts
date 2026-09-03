/**
 * ACTION CATALOG — a typed read projection over the shared entry parser.
 *
 * `readCatalogSections` owns merge order, whole-entry shadows and tombstones. This file
 * does not parse the action language or grant a writer; it exposes each resolved block as
 * readable text with the provenance Customize already understands.
 */
import { readCatalogSections, type Origin } from './resources.js';

export interface ActionRow {
  name: string;
  label: string;
  blurb: string;
  content: string;
  origin: Origin;
  shadowed: boolean;
}

export async function listActions(): Promise<ActionRow[]> {
  return (await readCatalogSections('ACTIONS.md'))
    .map((section) => ({
      name: section.name,
      // ACTIONS.md allows a human annotation after the token; the shared parser keeps
      // the first word as identity and the complete heading as its readable label.
      label: section.head,
      blurb: '',
      content: `## ${section.head}\n${section.lines.join('\n')}`.trimEnd(),
      origin: section.origin,
      shadowed: section.shadowed,
    }));
}
