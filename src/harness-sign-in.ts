/**
 * A HARNESS SIGNED IN WITHOUT A TERMINAL (owner, 24 Nov 2026; samurai_lab/wip/SETUP_HARNESS.md).
 * Ronin runs the CLI's own login command for the way the person chose (AGENTS `login`), reads the
 * link and code it prints, sends what the person pastes, and when it exits measures the machine
 * again: the CLI's credential file is the record, nothing else is kept. One run per harness, in
 * memory; every change is pushed (`harness-sign-in`) so the card and Irasshai's page follow it.
 * A run started with `tell` reports how it ended to that Agent, by its message queue.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { execFile } from './spawn-broker.js';
import { AGENTS, type AgentLogin } from './agents.js';
import { broadcastEvent } from './ws/events.js';
import { enqueueMessage } from './message-queue.js';
import { readHarnessSummary, refreshHarnesses } from './harness-summary.js';

export type SignInWay = 'subscription' | 'api_key';

export interface SignInRun {
  provider: string;
  label: string;
  way: SignInWay;
  /** The link the CLI printed; '' until it has. */
  link: string;
  /** The one-time code it printed, when it prints one. */
  code: string;
  /** What the person sends back: a code, a key, or nothing. */
  paste: 'code' | 'key' | null;
  /** Whether that has been sent. */
  sent: boolean;
}

const runs = new Map<string, { run: SignInRun; child: ChildProcess; tell: string; out: string }>();
/** The CLI's last line when its last run did not sign in; cleared by the next start. */
const failed = new Map<string, string>();

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\][^\u0007]*\u0007|\u001b\[[0-9;?]*[A-Za-z]/g;
const LINK = /https:\/\/[^\s<>"']+/;

const loginOf = (provider: string) => {
  const agent = AGENTS.find((one) => one.id === provider);
  const login = (agent as { login?: AgentLogin } | undefined)?.login;
  if (!agent || !login) throw new Error(`${agent?.label ?? provider} signs in on its terminal.`);
  return { agent, login };
};

/** WHICH WAY EACH HARNESS IS SIGNED IN, as its CLI says (AGENTS `login.status`): read when first
 *  asked and again when a run ends; '' when it says neither (not signed in). Nothing is recorded. */
let ways: Record<string, SignInWay | ''> | null = null;
async function readWays(): Promise<Record<string, SignInWay | ''>> {
  const paths = (await readHarnessSummary())?.paths ?? {};
  const read = await Promise.all(AGENTS.map(async (agent) => {
    const login = (agent as { login?: AgentLogin }).login;
    if (!login) return null;
    const out = await execFile(paths[agent.id] || agent.cmd, [...login.status.argv], { timeout: 15_000 })
      .then((r) => `${r.stdout}\n${r.stderr}`, () => '');
    const way: SignInWay | '' = new RegExp(login.status.subscription).test(out) ? 'subscription' : new RegExp(login.status.api_key).test(out) ? 'api_key' : '';
    return [String(agent.id), way] as [string, SignInWay | ''];
  }));
  ways = Object.fromEntries(read.filter((row): row is [string, SignInWay | ''] => row !== null));
  return ways;
}

/** Every open run, every last failure and each harness's way, as the page draws them. */
export async function signInState(): Promise<{ runs: SignInRun[]; failed: Record<string, string>; ways: Record<string, SignInWay | ''> }> {
  return { runs: [...runs.values()].map((entry) => entry.run), failed: Object.fromEntries(failed), ways: ways ?? await readWays() };
}

const push = () => { void signInState().then((state) => broadcastEvent({ t: 'harness-sign-in', ...state })); };

export async function startSignIn(provider: string, way: SignInWay, tell = ''): Promise<SignInRun> {
  const { agent, login } = loginOf(provider);
  const step = login[way];
  if (!step) throw new Error(`Choose subscription or API key.`);
  runs.get(provider)?.child.kill();
  failed.delete(provider);
  // No browser here: the CLI prints its link instead of opening one.
  // The CLI as the measure found it: Ronin's own PATH need not hold ~/.local/bin.
  const file = (await readHarnessSummary())?.paths?.[provider] || agent.cmd;
  const child = spawn(file, [...step.argv], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'true' } });
  const run: SignInRun = { provider, label: agent.label, way, link: '', code: '', paste: step.paste, sent: false };
  const entry = { run, child, tell, out: '' };
  runs.set(provider, entry);
  const code = login.code ? new RegExp(login.code) : null;
  const read = (chunk: Buffer) => {
    entry.out += chunk.toString('utf8').replace(ANSI, '');
    const link = entry.out.match(LINK)?.[0] ?? '';
    const found = code ? entry.out.match(code)?.[0] ?? '' : '';
    if (link !== run.link || found !== run.code) { run.link = link; run.code = found; push(); }
  };
  child.stdout?.on('data', read);
  child.stderr?.on('data', read);
  child.on('error', (error) => { entry.out += `\n${error.message}`; });
  child.on('close', (exit) => { void ended(provider, entry, exit === 0); });
  push();
  return run;
}

async function ended(provider: string, entry: { run: SignInRun; child: ChildProcess; tell: string; out: string }, ok: boolean): Promise<void> {
  if (runs.get(provider) !== entry) return; // replaced by a newer start, or cancelled
  runs.delete(provider);
  const last = entry.out.split('\n').map((line) => line.trim()).filter(Boolean).pop() ?? '';
  if (!ok) failed.set(provider, last || 'The sign-in stopped.');
  // Measured again, model lists read: the facts and Setup's tick follow on their own.
  await refreshHarnesses().catch((error) => console.error('[sign-in] measure:', error));
  await readWays().catch(() => {});
  push();
  if (entry.tell) {
    const said = ok ? `${entry.run.label} is signed in.` : `${entry.run.label} sign-in did not finish: ${failed.get(provider)}`;
    await enqueueMessage(entry.tell, said, 'house', 'Setup').catch(() => {});
  }
}

/** What the person pasted: a code goes back as a line; a key goes on stdin, which then closes. */
export function pasteSignIn(provider: string, text: string): SignInRun {
  const entry = runs.get(provider);
  if (!entry || !entry.run.paste) throw new Error('No sign-in is waiting for a paste.');
  const value = text.trim();
  if (!value) throw new Error(entry.run.paste === 'key' ? 'Paste your API key.' : 'Paste the code.');
  entry.child.stdin?.write(`${value}\n`);
  if (entry.run.paste === 'key') entry.child.stdin?.end();
  entry.run.sent = true;
  push();
  return entry.run;
}

/** Stops the run by its own process; nothing is recorded. */
export function cancelSignIn(provider: string): void {
  const entry = runs.get(provider);
  if (!entry) return;
  runs.delete(provider);
  entry.child.kill();
  push();
}
