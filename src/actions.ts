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
      label: section.head,
      blurb: '',
      content: `## ${section.head}\n${section.lines.join('\n')}`.trimEnd(),
      origin: section.origin,
      shadowed: section.shadowed,
    }));
}
