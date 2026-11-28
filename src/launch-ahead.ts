/**
 * SET AHEAD AT LAUNCH (KAN-616): the questions a CLI asks before its first turn that have a
 * known answer are answered in its own files before it starts, and the hook that tells Ronin
 * what the Agent is doing (ronin_bin/ronin-asking, src/asking.ts) is put in place. Each CLI's launch doc
 * (docs/agents/claude.md, codex.md) says what is set. Login is not: the owner signs in in the
 * terminal. Returns the argv the CLI is given after its executable.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from './resources.js';

const readText = (file: string) => readFile(file, 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return ''; throw e; });

/** Claude: the folder is trusted in ~/.claude.json, and the hooks ride --settings. */
async function claude(cwd: string): Promise<string[]> {
  await claudeAhead(cwd);
  return ['--settings', path.join(REPO_ROOT, 'hostside', 'claude-asking.json')];
}

/**
 * Claude's first-run questions answered for the office (owner, 28 Nov 2026; KAN-995): onboarding done, a
 * theme, and the folder trusted. Without them a first start stops at the theme picker, so neither the
 * owner's first Agent nor the hidden start that writes Claude's model list gets past it.
 */
export async function claudeAhead(cwd: string): Promise<void> {
  const file = path.join(process.env.CLAUDE_CONFIG_DIR || homedir(), '.claude.json');
  const text = await readText(file);
  const state = text ? JSON.parse(text) : {};
  const projects = state.projects ??= {};
  const onboarded = state.hasCompletedOnboarding === true && typeof state.theme === 'string';
  if (!onboarded || projects[cwd]?.hasTrustDialogAccepted !== true) {
    state.hasCompletedOnboarding = true;
    state.theme ??= 'dark';
    projects[cwd] = { ...projects[cwd], hasTrustDialogAccepted: true };
    // Whole or not at all: running Claudes read this file too.
    await writeFile(`${file}.ronin`, JSON.stringify(state, null, 2));
    await rename(`${file}.ronin`, file);
  }
}

// The hooks in the Codex home's hooks.json. Codex asks the person to trust a new hook
// ("Hooks need review") unless it is launched with --dangerously-bypass-hook-trust.
const CODEX_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'Stop', 'Interrupt'];

/** One `key = value` in a TOML text, left alone when the key is already there. Line-wise, so
 * the owner's file keeps its layout; Codex itself edits the file the same way. */
export function tomlEnsure(text: string, table: string | null, key: string, value: string): string {
  const line = `${key} = ${value}`;
  const lines = text.split('\n');
  const isKey = (l: string) => l.trimStart().startsWith(`${key} `) || l.trimStart().startsWith(`${key}=`);
  const isHeader = (l: string) => l.trimStart().startsWith('[');
  if (table === null) {
    const top = lines.findIndex(isHeader);
    if (lines.slice(0, top < 0 ? undefined : top).some(isKey)) return text;
    return `${line}\n${text}`;
  }
  const at = lines.findIndex((l) => l.trim() === `[${table}]`);
  if (at < 0) return `${text.replace(/\n*$/, '')}\n\n[${table}]\n${line}\n`;
  const next = lines.findIndex((l, i) => i > at && isHeader(l));
  if (lines.slice(at + 1, next < 0 ? undefined : next).some(isKey)) return text;
  lines.splice(at + 1, 0, line);
  return lines.join('\n');
}

/** Codex: the hooks in its home's hooks.json, run without a trust review; in its home's
 * config.toml, the folder trusted, no update check, the warnings off. */
async function codex(cwd: string, home: string): Promise<string[]> {
  const hooks = path.join(home, 'hooks.json');
  const entry = [{ hooks: [{ type: 'command', command: 'ronin-asking' }] }];
  await mkdir(home, { recursive: true });
  await writeFile(hooks, JSON.stringify({ hooks: Object.fromEntries(CODEX_HOOK_EVENTS.map((e) => [e, entry])) }, null, 2) + '\n');
  const config = path.join(home, 'config.toml'); // the owner's own, linked into this home
  let text = await readText(config);
  const before = text;
  text = tomlEnsure(text, null, 'check_for_update_on_startup', 'false');
  text = tomlEnsure(text, 'notice', 'hide_full_access_warning', 'true');
  text = tomlEnsure(text, 'notice', 'hide_rate_limit_model_nudge', 'true');
  text = tomlEnsure(text, `projects.${JSON.stringify(cwd)}`, 'trust_level', '"trusted"');
  if (text !== before) await writeFile(config, text);
  return ['--dangerously-bypass-hook-trust'];
}

export async function setAhead(cli: string, cwd: string, home: string | undefined): Promise<string[]> {
  if (cli === 'claude') return claude(cwd);
  if (cli === 'codex' && home) return codex(cwd, home);
  return [];
}
