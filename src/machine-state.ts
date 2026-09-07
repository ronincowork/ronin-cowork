import os from 'node:os';
import { readMachineSettingsDocument, readMachineSettingsSection, writeMachineSettings } from './machine-settings.js';
import { tmux } from './tmux-client.js';

export const MAX_OPT = '@ronin-session-max';

export const OWNER_OPT = '@ronin-owner';

export const NO_LIMIT = 0;

function clean(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : NO_LIMIT;
}

export async function readSection<T>(key: string, fallback: T): Promise<T> {
  return readMachineSettingsSection(key, fallback);
}

export const writeSection = <T>(key: string, value: T): Promise<void> =>
  updateConfig((doc) => {
    doc[key] = value;
  });

export const updateSection = <T extends Record<string, unknown>>(
  key: string,
  mutate: (value: T) => T,
): Promise<void> => updateConfig((doc) => {
  const current = doc[key];
  const value = current && typeof current === 'object' && !Array.isArray(current)
    ? current as T : {} as T;
  doc[key] = mutate(value);
});

async function updateConfig(mutate: (doc: Record<string, unknown>) => void): Promise<void> {
  const before = await readMachineSettingsDocument();
  const doc = { ...before };
  mutate(doc);
  for (const [key, value] of Object.entries(doc)) {
    if (!Object.is(value, before[key])) {
      await writeMachineSettings('record-section', { key, value });
    }
  }
}

export async function readMax(): Promise<number> {
  const s = await readSection<Record<string, unknown>>('sessions', {});
  return clean(s.max);
}

export async function writeMax(max: number): Promise<number> {
  const value = clean(max);
  await updateConfig((doc) => {
    const sessions = ((doc.sessions ?? {}) as Record<string, unknown>) || {};
    sessions.max = value;
    doc.sessions = sessions;
  });
  await publishMax(value);
  return value;
}

export async function publishMax(max?: number): Promise<void> {
  const value = max ?? (await readMax());
  try {
    await tmux.run(['set-option', '-s', MAX_OPT, String(value)]);
  } catch {
  }
}

const machineUser = (): string => {
  try {
    return os.userInfo().username || 'owner';
  } catch {
    return 'owner'; // no passwd entry (a container, a stripped image) — never throw over a name
  }
};

export async function readOwner(): Promise<string> {
  const owner = await readSection<Record<string, unknown>>('owner', {});
  const name = typeof owner.name === 'string' ? owner.name.trim() : '';
  return name || machineUser();
}

export async function writeOwner(name: string): Promise<string> {
  const value = String(name ?? '').trim().slice(0, 64) || machineUser();
  await updateConfig((doc) => {
    const owner = ((doc.owner ?? {}) as Record<string, unknown>) || {};
    owner.name = value;
    doc.owner = owner;
  });
  await publishOwner(value);
  return value;
}

export const readKoshiSection = (): Promise<Record<string, unknown>> =>
  readSection<Record<string, unknown>>('koshi', {});

export const writeKoshiSection = (value: Record<string, unknown>): Promise<void> =>
  updateConfig((doc) => {
    doc.koshi = value;
  });

export const updateAuthSection = (value: Record<string, unknown> | null): Promise<void> =>
  updateConfig((doc) => {
    if (value === null) delete doc.auth;
    else doc.auth = value;
  });

export const updatePasskeysSection = (value: Record<string, unknown> | null): Promise<void> =>
  updateConfig((doc) => {
    if (value === null) delete doc.passkeys;
    else doc.passkeys = value;
  });

export const readMachineSection = (): Promise<Record<string, unknown>> =>
  readSection<Record<string, unknown>>('machine', {});

export const readMachineMonitor = async (): Promise<boolean> =>
  (await readMachineSection()).monitor !== false;

export const writeMachineSection = (v: { name?: string; where?: string; monitor?: boolean }): Promise<void> =>
  updateConfig((doc) => {
    const m = ((doc.machine ?? {}) as Record<string, unknown>) || {};
    if (v.monitor !== undefined) m.monitor = Boolean(v.monitor);
    if (v.name !== undefined) m.name = String(v.name).trim().slice(0, 64);
    if (v.where !== undefined) m.where = String(v.where).trim().slice(0, 120);
    doc.machine = m;
  });

export type NewProjectDesks = 'managed' | 'none';
export const readDesksSection = async (): Promise<{ new_project: NewProjectDesks }> => {
  const s = await readSection<{ new_project?: unknown }>('desks', {});
  return { new_project: s.new_project === 'none' ? 'none' : 'managed' };
};
export const writeDesksSection = (v: { new_project?: string }): Promise<void> =>
  updateConfig((doc) => {
    const d = ((doc.desks ?? {}) as Record<string, unknown>) || {};
    if (v.new_project !== undefined) d.new_project = v.new_project === 'none' ? 'none' : 'managed';
    doc.desks = d;
  });

export const readAgentsSection = (): Promise<Record<string, unknown>> =>
  readSection<Record<string, unknown>>('agents', {});

export const writeAgentsSection = (value: Record<string, unknown>): Promise<void> =>
  updateConfig((doc) => {
    doc.agents = value;
  });

export const writeGbrainSection = (value: Record<string, unknown>): Promise<void> =>
  updateConfig((doc) => {
    doc.gbrain = value;
  });

export const writeWantedSection = (list: Array<{ kind: string; name: string }>): Promise<void> =>
  updateConfig((doc) => {
    doc.wanted = list.slice(0, 50).map((w) => ({ kind: String(w.kind), name: String(w.name).slice(0, 80) }));
  });

export const readSetupSection = (): Promise<Record<string, unknown>> =>
  readSection<Record<string, unknown>>('setup', {});

export async function stampFreshInstall(): Promise<void> {
  try {
    if (Object.keys(await readMachineSettingsDocument()).length > 0) return;
    await updateConfig((doc) => {
      doc.setup = { pending: true, stamped_at: new Date().toISOString() };
    });
  } catch {
  }
}

export const completeSetup = (): Promise<void> =>
  updateConfig((doc) => {
    doc.setup = { completed_at: new Date().toISOString() };
  });

export async function publishOwner(name?: string): Promise<void> {
  const value = name ?? (await readOwner());
  try {
    await tmux.run(['set-option', '-s', OWNER_OPT, value]);
  } catch {
  }
}

export async function liveCount(): Promise<number> {
  try {
    const stdout = await tmux.run(['list-sessions', '-F', '#{session_name}']);
    return stdout.split('\n').filter((n) => n && !n.startsWith('grid_')).length;
  } catch {
    return 0; // no server: nothing is running, so nothing is at the limit
  }
}

export class AtSessionMax extends Error {
  readonly max: number;
  readonly live: number;
  constructor(max: number, live: number) {
    super(
      `At the session max: ${live} of ${max} running. ` +
        `The owner sets this number at the top of the ⌂ Roster tab in Ronin. ` +
        `End a session, or raise the max — nothing else will let this start. ` +
        `The limit exists because past it the kernel chooses which session dies, and it chooses the largest, which is the lead.`,
    );
    this.name = 'AtSessionMax';
    this.max = max;
    this.live = live;
  }
}

export async function assertUnderMax(): Promise<void> {
  const max = await readMax();
  if (max === NO_LIMIT) return;
  const live = await liveCount();
  if (live >= max) throw new AtSessionMax(max, live);
}

const DEFAULT_TTL_HOURS = 48;

const hours = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export async function readWipeboardSettings(board?: string): Promise<{ ttlMs: number }> {
  const sec = await readSection<Record<string, unknown>>('wipeboard', {});
  const per = (board && (sec[board] as Record<string, unknown> | undefined)) || {};
  const ttlH = hours(per.ttl_hours ?? sec.ttl_hours, DEFAULT_TTL_HOURS);
  return { ttlMs: ttlH * 3600_000 };
}
