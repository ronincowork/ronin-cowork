/**
 * DESK PROFILES — the owner's standing defaults for the surfaces they work at, as a
 * shadowable catalog (`ronin_catalogs/desk_profiles/`). KOTOBA R38, 2026-08-27: a
 * desk_profile is NOT a skin; each one HAS a skin — and a lexicon, a campaign kind, a
 * RIREKI view for a new tile, and the Team page's default order.
 *
 * WHICH ONE IS ACTIVE IS SETTEI'S (`set.desk.profile`): one object, every surface a
 * view on it — a choice that must hold across browsers is not a browser's to keep.
 * This module answers the two questions the surfaces ask: the list (with `origin`, so
 * the picker can say which are yours) and the active one's NAME — '' is the ordinary
 * state of every install older than the catalog, and it means "as stock" everywhere;
 * nothing here invents a default profile.
 */
import { type Origin } from './catalog.js';
import { readDefinitions, type Definition } from './definitions.js';
import { readDeskSection } from './user-config.js';

export interface DeskProfileInfo {
  name: string;
  label: string;
  blurb: string;
  origin: Origin;
  shadowed: boolean;
  skin: string;
  lexicon: string;
  campaign_kind: string;
  rireki_view: string;
  /** Slot names in order, as written — the Team page validates against its declaration. */
  team_arrangement: string[];
}

const row = (d: Definition): DeskProfileInfo => ({
  name: d.name,
  label: d.get('label') || d.name,
  blurb: d.get('blurb'),
  origin: d.origin,
  shadowed: d.shadowed,
  skin: d.get('skin').trim(),
  lexicon: d.get('lexicon').trim(),
  campaign_kind: d.get('campaign_kind').trim(),
  rireki_view: d.get('rireki_view').trim(),
  team_arrangement: d.get('team_arrangement').split(',').map((s) => s.trim()).filter(Boolean),
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
