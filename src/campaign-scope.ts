import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initialCampaign, listCampaigns } from './campaigns.js';
import { listProjectRoots, upsertProjectRoot } from './project-roots.js';
import { listTeamRosters, teamRosterFile } from './team-rosters.js';
import { getCampaign, listSessions, setCampaign } from './tmux.js';

export async function initialCampaignId(): Promise<string> {
  return (await initialCampaign())?.id ?? '';
}

export async function machineCampaignId(): Promise<string> {
  return initialCampaignId();
}

export async function campaignResolver(): Promise<(stored: string) => string> {
  const initial = await initialCampaignId();
  return (stored: string) => stored || initial;
}

export async function campaignFilter(wanted: readonly string[]): Promise<(stored: string) => boolean> {
  const resolve = await campaignResolver();
  if (!wanted.length) return () => true;
  const set = new Set(wanted);
  const known = new Set((await listCampaigns()).map((campaign) => campaign.id));
  return (stored: string) => Boolean(stored && !known.has(stored)) || set.has(resolve(stored));
}

export async function assertSameCampaignTeams(session: string, teams: readonly string[]): Promise<void> {
  if (!teams.length) return;
  const resolve = await campaignResolver();
  const mine = resolve(await getCampaign(session));
  if (!mine) return; // no Campaign exists on this box yet — nothing to enforce against
  const rosters = await listTeamRosters();
  const wrong: string[] = [];
  for (const team of teams) {
    const roster = rosters.find((r) => r.name === team);
    if (!roster) continue; // a tag-only team has no roster and therefore no Campaign
    const theirs = resolve(roster.campaign_id);
    if (theirs && theirs !== mine) wrong.push(`${team} (${theirs})`);
  }
  if (wrong.length) {
    throw new Error(
      `This Agent is in Campaign "${mine}" and cannot join ${wrong.join(', ')}. ` +
        'A Cowork and its Agents belong to one Campaign; moving between Campaigns is a ' +
        'deliberate migration, not a membership change.',
    );
  }
}

export async function assertSameCampaignRoot(campaign_id: string, root: string): Promise<void> {
  if (!root) return;
  const resolve = await campaignResolver();
  const mine = resolve(campaign_id);
  if (!mine) return;
  const found = (await listProjectRoots()).find((r) => r.name === root);
  if (!found) return; // an unknown root is the resolver's refusal to make, not this one's
  const theirs = resolve(found.campaign_id);
  if (theirs && theirs !== mine) {
    throw new Error(
      `Project root "${root}" belongs to Campaign "${theirs}", not "${mine}". ` +
        'A Cowork and an Agent may reference only a Project root in their own Campaign.',
    );
  }
}

export interface CampaignScopeMigration {
  campaign_id: string;
  rosters: string[];
  roots: string[];
  sessions: string[];
}

export async function migrateCampaignScope(): Promise<CampaignScopeMigration> {
  const done: CampaignScopeMigration = { campaign_id: '', rosters: [], roots: [], sessions: [] };
  const campaign_id = await initialCampaignId();
  if (!campaign_id) return done; // nothing seeded yet; the next boot will have one
  done.campaign_id = campaign_id;

  for (const roster of await listTeamRosters()) {
    if (roster.campaign_id) continue;
    const from = teamRosterFile(roster.name, '');
    const to = teamRosterFile(roster.name, campaign_id);
    try {
      await mkdir(path.dirname(to), { recursive: true });
      if (await access(to).then(() => true, () => false)) continue;
      const raw = await readFile(from, 'utf8');
      await writeFile(to, raw.replace(/^(# .*\n\n)/m, `$1- **campaign_id:** ${campaign_id}\n`), 'utf8');
      await unlink(from);
      done.rosters.push(roster.name);
    } catch {
    }
  }

  for (const root of await listProjectRoots()) {
    if (root.campaign_id) continue;
    try {
      await upsertProjectRoot(root.name, { campaign_id });
      done.roots.push(root.name);
    } catch {
    }
  }

  for (const session of await listSessions()) {
    if (session.campaign_id) continue;
    try {
      await setCampaign(session.name, campaign_id);
      done.sessions.push(session.name);
    } catch {
    }
  }

  return done;
}
