/**
 * DESK PROFILES — the owner's standing defaults for the surfaces they work at, as a
 * shadowable catalog (`ronin_catalogs/desk_profiles/`). KOTOBA R38, 2026-08-27: a
 * desk_profile is NOT a skin; each one HAS a skin — and a lexicon, a
 * RIREKI view for a new tile, and the Team page's default order.
 *
 * WHICH ONE IS ACTIVE IS SETTEI'S (`set.desk.profile`): one object, every surface a
 * view on it — a choice that must hold across browsers is not a browser's to keep.
 * This module answers the two questions the surfaces ask: the list (with `origin`, so
 * the picker can say which are yours) and the active one's NAME — '' is the ordinary
 * state of every install older than the catalog, and it means "as stock" everywhere;
 * nothing here invents a default profile.
 */
import { type Origin } from './resources.js';
import { readDefinitions, type Definition } from './definitions.js';
// The profile is the CAMPAIGN's (its vocabulary, skin and offered templates), so the
// chosen name comes from the initial campaign_config, not from ronin.json. Same shape.
import { readDeskSection } from './campaign-config.js';

export interface DeskProfileInfo {
  name: string;
  label: string;
  blurb: string;
  origin: Origin;
  shadowed: boolean;
  skin: string;
  lexicon: string;
  /** Light/dark/automatic is part of the template, not inferred from its skin. */
  theme: string;
  rireki_view: string;
  /** Slot names in order, as written — the Team page validates against its declaration. */
  team_arrangement: string[];
  /** Reserved, typed expansion point copied whole when a template is applied. */
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

/** The chosen profile's name as settei holds it — '' when none was ever chosen. */
export async function activeDeskProfileName(): Promise<string> {
  const desk = await readDeskSection();
  return typeof desk.profile === 'string' ? desk.profile.trim() : '';
}

// The active profile RESOLVED is the client's question (public/js/desk-profile.js reads
// the list and the name in one answer and matches them); the server only holds the name.
