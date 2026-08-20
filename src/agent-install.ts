/**
 * WHERE AN INSTALLED AGENT LANDS — the one hard edge of the install operation.
 *
 * `npm install -g` puts a package's bin into the NODE PREFIX's `bin/`, and the prefix a
 * box happens to have is the whole problem. Three answers were on the table and two of
 * them are wrong:
 *
 *   the system prefix (/usr, /usr/local)   needs sudo, pollutes the machine, and Ronin
 *                                          has no business asking for root to add a CLI.
 *   the release's own bundled Node         `vendor/node` is INSIDE the release directory,
 *                                          and ronin-update unpacks each release beside
 *                                          the last and swaps a `current` symlink
 *                                          (bin/ronin-update). Every agent the owner
 *                                          installed would vanish at the next update,
 *                                          with nothing on screen to say why.
 *   ~/.local                               the standard user-level prefix, outside every
 *                                          release, needing no root — and already where
 *                                          Claude Code's own installer puts itself
 *                                          (measured on this box, src/agents.ts).
 *
 * So Ronin installs where the agents' own installers already install. Two consequences
 * follow and both are the point: an agent Ronin installed is indistinguishable from one
 * the owner installed by hand, and uninstalling Ronin leaves them alone — they are the
 * owner's tools, not Ronin's state. That is also why this is NOT a store (src/stores.ts):
 * a store is a place Ronin keeps its own working state and an uninstall deletes it. This
 * is the same class as `~/.claude/settings.json` — somebody else's directory that setup.sh
 * legitimately writes into.
 *
 * ------------------------------------------------------------------------------------
 * VISIBILITY IS THE OTHER HALF, and without it an install "never happened".
 *
 * `listAgentAvailability()` asks a LOGIN SHELL, because a login shell's PATH is the PATH a
 * pane gets (src/agents.ts says why at length). So a prefix nothing puts on the login
 * shell's PATH is a prefix the probe cannot see and a pane cannot run — the install would
 * succeed and the row would stay "not installed" forever. `setup.sh` therefore appends
 * this bin directory to PATH in the rc block it already writes, and creates the directory,
 * because Debian's stock ~/.profile only adds ~/.local/bin when it already exists.
 *
 * APPENDED, never prepended: the owner's own copy of an agent wins over ours. The shim
 * directory is prepended because a guard that does not come first is inert; this one is a
 * fallback and must never shadow.
 *
 * The install still exports both for ITSELF (`installPreamble`), in the same append order for
 * the same reason, so a box whose rc predates this file installs correctly today and is merely
 * invisible until the next login — degraded, never wrong.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENTS, listAgentAvailability } from './agents.js';
import { REPO_ROOT } from './config.js';
import { runCommand } from './send.js';
import { collectBirthLines, emitSessionWillBorn } from './sockets.js';
import { createSession, killSessionTree, sessionExists } from './tmux.js';

/* The four below are this module's own working parts and stay unexported: the only thing
 * anything outside asks for is the dispatcher. setup.sh cannot import TypeScript anyway —
 * the rc block it writes carries the same two directories, and its comment says why. */

/** The npm prefix Ronin installs agent CLIs into. Not a store — see the header. */
function agentPrefix(): string {
  return path.join(os.homedir(), '.local');
}

/** Where the installed commands land, and what has to be on PATH for any of it to count. */
function agentBinDir(): string {
  return path.join(agentPrefix(), 'bin');
}

/**
 * The bundled runtime's bin directory, or null in a checkout.
 *
 * A bundled release carries its own Node (`vendor/node/bin`, RELEASE_BUNDLE) and a box
 * that took that door may have no system Node at all. Every npm-installed agent starts
 * `#!/usr/bin/env node`, so without this directory on PATH the install succeeds and the
 * command dies on its first line. setup.sh appends it for the same reason it appends the
 * bin directory above, and this is the resolver both halves ask.
 */
function bundledNodeBin(): string | null {
  const dir = path.join(REPO_ROOT, 'vendor', 'node', 'bin');
  return fs.existsSync(path.join(dir, 'node')) ? dir : null;
}

/**
 * The two lines an install runs before the vendor's own command — visible in the terminal,
 * because the terminal is the whole honesty mechanism here (AGENT_INSTALLER: "say the
 * command"). `npm_config_prefix` is npm's own environment spelling of `--prefix`, and it
 * governs `npm install -g` without touching the owner's ~/.npmrc.
 */
function installPreamble(): string[] {
  const nodeBin = bundledNodeBin();
  const pathParts = ['$PATH', agentBinDir(), ...(nodeBin ? [nodeBin] : [])];
  return [`export npm_config_prefix=${shq(agentPrefix())}`, `export PATH=${shq(pathParts.join(':'), true)}`];
}

/** One argument, safe in every POSIX shell. `keep` leaves `$PATH` expandable. */
function shq(s: string, keep = false): string {
  if (keep) return `"${s.replace(/(["\\`])/g, '\\$1')}"`;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/* ------------------------------------------------------------------ the operation */

/**
 * THE DISPATCHER — the mechanical half of needed[], executed.
 *
 * ONE SESSION PER ITEM, and that is the whole design (owner, 2026-08-20). The install
 * runs in a real tmux session, so the work shows in a real tile like all work in Ronin:
 * the exact command is on screen because the screen IS the terminal it runs in, a failed
 * install is a shell prompt under the vendor's own error message — the most honest error
 * page there is — and on success the same session starts the agent, whose first-run
 * login appears in the same tile. Install → sign-in, one seat, and no progress UI to
 * build or maintain. Concurrency comes free: sessions are parallel by nature.
 *
 * IT INVENTS NO PROCESS MANAGEMENT. `createSession` and `runCommand` are the same
 * machinery `/api/launch` uses; this door differs only in what it types.
 *
 * DONE IS MEASURED, NEVER CLAIMED. Nothing here reports success — `listAgentAvailability()`
 * does, later, when someone next reads the record. The runner's exit code is not the
 * finish line and this function never waits for one. What it returns is what it STARTED.
 *
 * RERUN IS RETRY. An item that failed stays in needed[] (met items do not exist), so
 * asking again is the retry, and the stale session from the last attempt is killed rather
 * than left to collide with its own name — it is ours, named by us, and its only job was
 * the attempt being redone.
 */
/** One item asked for, in the same vocabulary a want is typed in (`kind` + `name`). */
export interface InstallItem {
  kind: string;
  name: string;
}

/** What happened to one item. `session` is the tile to watch, when there is one. */
export interface InstallStarted {
  kind: string;
  name: string;
  session: string | null;
  outcome: 'started' | 'already' | 'refused';
  say: string;
}

/** The session an install runs in. Named for the item, so a rerun finds its own. */
const sessionFor = (name: string): string => `install_${name}`;

/**
 * The one door. Callable by the setup flow at Save and by ⚙ any day after, and by nothing
 * else new — a second install path is a defect (AGENT_INSTALLER).
 *
 * `kind` is the registry's own verb, so the day the services bundle becomes mechanical it
 * is one branch here and no change at any caller. Today only `agent` is mechanical, and
 * anything else is refused out loud rather than silently dropped: `met_by` already said
 * which items belong here (src/settei-registry.ts), so an item arriving that does not is
 * worth saying.
 */
export async function dispatchInstall(items: InstallItem[]): Promise<InstallStarted[]> {
  const agents = items.some((i) => i.kind === 'agent') ? await listAgentAvailability() : [];
  const out: InstallStarted[] = [];
  for (const item of items) {
    out.push(await one(item, agents));
  }
  return out;
}

async function one(
  item: InstallItem,
  probed: Awaited<ReturnType<typeof listAgentAvailability>>,
): Promise<InstallStarted> {
  const said = (outcome: InstallStarted['outcome'], say: string, session: string | null = null) => ({
    kind: item.kind,
    name: item.name,
    session,
    outcome,
    say,
  });
  if (item.kind !== 'agent') {
    return said('refused', `nothing installs a ${item.kind} mechanically yet — see met_by in the registry`);
  }
  const spec = AGENTS.find((a) => a.id === item.name);
  if (!spec) return said('refused', `no agent called "${item.name}"`);
  // NO COMMAND, NO ATTEMPT. A parked agent carries the sentence saying why, written for
  // a person, so the refusal reads the same here as it does on the row that offered it.
  if (!spec.get) return said('refused', spec.parked || `nothing installs ${item.name} yet`);
  // MET ITEMS DO NOT EXIST — including here. A box that already has it gets no session,
  // no npm call, and no second copy shadowing the owner's own.
  if (probed.find((p) => p.id === spec.id)?.installed) {
    return said('already', `${spec.label} is already on this machine`);
  }

  const session = sessionFor(spec.id);
  try {
    // The previous attempt, if there was one. Killed rather than collided with.
    if (await sessionExists(session)) await killSessionTree(session);
    await emitSessionWillBorn(session); // a reused name's stale tape is reset here
    // `agent: false` is the bare-shell shape: never refused at the session max, because
    // a box at its cap must still be able to finish installing what the owner ticked.
    await createSession(session, undefined, { agent: false });
    void collectBirthLines(session, true);
    await runCommand(session, installLine(spec.get, spec.cmd));
    return said('started', `installing ${spec.label} in ${session}`, session);
  } catch (e) {
    return said('refused', String((e as Error)?.message ?? e));
  }
}

/**
 * The line the pane runs, and every character of it is on screen before it does anything —
 * which is the mitigation for the fact that a vendor installer is somebody else's code.
 *
 * `&&`, not `;`: the agent starts only if the install actually succeeded. A failure stops
 * at the shell prompt with the vendor's own message above it and nothing else blocked.
 */
function installLine(get: string, cmd: string): string {
  return [...installPreamble(), `${get} && ${cmd}`].join('; ');
}
