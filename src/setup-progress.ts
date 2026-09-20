import { ensureInitialCampaign, writeCampaign, type SetupAnswer, SETUP_STEP_IDS } from './campaigns.js';
import { discoverExecutable } from './agents.js';
import { measureAndRecordProviders, providerInventoryNeed, refreshProviderInventory } from './provider-summary.js';
import { githubSetupAnswer } from './setup-runtime.js';
import { broadcastEvent } from './ws/events.js';
import { tailnetIp } from './machine-settings.js';

export interface SetupProgressStep { id: typeof SETUP_STEP_IDS[number]; number: number; answered: boolean; answer: SetupAnswer | '' }
export interface SetupProgress { steps: SetupProgressStep[]; facts: { tailscale?: boolean; checked_at?: string }; scanning: boolean; scanned_at: string; reason?: string }

let scanFlight: Promise<void> | null = null;
let scannedAt = '';
let scanReason = '';

async function response(): Promise<SetupProgress> {
  const campaign = await ensureInitialCampaign();
  const answers = campaign.config.setup.answers;
  return {
    steps: SETUP_STEP_IDS.map((id, index) => ({ id, number: index + 1, answered: Boolean(answers[id]), answer: answers[id] || '' })),
    facts: campaign.config.setup.facts,
    scanning: scanFlight !== null,
    scanned_at: scannedAt || campaign.config.setup.facts.checked_at || campaign.providers?.measured_at || '',
    ...(scanReason ? { reason: scanReason } : {}),
  };
}

async function publish(): Promise<void> {
  broadcastEvent({ t: 'setup-progress', ...(await response()) });
}

async function performScan(): Promise<void> {
  const reasons: string[] = [];
  let provider = false;
  let workspace = false;
  const tailscale = tailnetIp() !== '127.0.0.1';
  const [providers, github, git] = await Promise.all([
    measureAndRecordProviders().then((value) => {
      provider = value.activated_count > 0;
      if (providerInventoryNeed(value).needed) void refreshProviderInventory();
    }, (error) => reasons.push(String((error as Error)?.message ?? error))),
    githubSetupAnswer().then((value) => {
      workspace ||= value.installed || value.authenticated;
      if (value.state === 'unreadable' && value.problem) reasons.push(value.problem);
    }, (error) => reasons.push(String((error as Error)?.message ?? error))),
    discoverExecutable('git').then((value) => { workspace ||= Boolean(value); }, (error) => reasons.push(String((error as Error)?.message ?? error))),
  ]);
  const campaign = await ensureInitialCampaign();
  const answers = { ...campaign.config.setup.answers };
  if (provider && !answers.provider) answers.provider = 'acted';
  if (workspace && !answers.workspace) answers.workspace = 'acted';
  scannedAt = new Date().toISOString();
  await writeCampaign(campaign.id, { config: { setup: { answers, facts: { tailscale, checked_at: scannedAt } } } });
  scanReason = reasons.join(' ');
}

export function startSetupProgressScan(): Promise<void> {
  if (scanFlight) return scanFlight;
  scanReason = '';
  scanFlight = performScan()
    .catch((error) => { scanReason = String((error as Error)?.message ?? error); scannedAt = new Date().toISOString(); })
    .finally(async () => { scanFlight = null; await publish(); });
  return scanFlight;
}

export async function readSetupProgress({ automatic = false } = {}): Promise<SetupProgress> {
  const campaign = await ensureInitialCampaign();
  if (automatic && Object.keys(campaign.config.setup.answers).length === 0) void startSetupProgressScan();
  return response();
}

export async function answerSetupProgress(step: string, answer: SetupAnswer): Promise<SetupProgress> {
  if (!SETUP_STEP_IDS.includes(step as typeof SETUP_STEP_IDS[number])) throw new Error(`Unknown Setup step "${step}".`);
  if (answer !== 'acted' && answer !== 'not_now') throw new Error('Answer must be acted or not_now.');
  const campaign = await ensureInitialCampaign();
  await writeCampaign(campaign.id, { config: { setup: { answers: { ...campaign.config.setup.answers, [step]: answer }, facts: campaign.config.setup.facts } } });
  await publish();
  return response();
}
