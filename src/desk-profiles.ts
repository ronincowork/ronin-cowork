import { type Origin } from './resources.js';
import { readDefinitions, type Definition } from './resource-adapters.js';
import { readDeskSection } from './campaigns.js';

export interface DeskProfileInfo {
  name: string;
  label: string;
  blurb: string;
  origin: Origin;
  shadowed: boolean;
  skin: string;
  lexicon: string;
  theme: string;
  rireki_view: string;
  team_arrangement: string[];
  defaults: Record<string, unknown>;
}

const row = (d: Definition): DeskProfileInfo => ({
  name: d.name,
  label: d.get('label') || d.name,
  blurb: d.get('blurb'),
  origin: d.origin,
  shadowed: d.shadowed,
  skin: d.get('skin').trim(),
  lexicon: d.get('lexicon').trim(),
  theme: d.get('theme').trim(),
  rireki_view: d.get('rireki_view').trim(),
  team_arrangement: d.get('team_arrangement').split(',').map((s) => s.trim()).filter(Boolean),
  defaults: {},
});

export async function listDeskProfiles(): Promise<DeskProfileInfo[]> {
  return (await readDefinitions('desk_profiles')).map(row);
}

export async function activeDeskProfileName(): Promise<string> {
  const desk = await readDeskSection();
  return typeof desk.profile === 'string' ? desk.profile.trim() : '';
}
