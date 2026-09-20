import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STOCK_DIR, resolveTreeFiles, storeDir, type Origin } from './resources.js';

export const BEHAVIOUR_SCOPES = ['floor', 'conditional', 'selected', 'sought'] as const;
export type BehaviourDocumentScope = typeof BEHAVIOUR_SCOPES[number];

export class BehaviourDocumentError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const tokenPattern = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

function identity(scopeValue: unknown, nameValue: unknown): { scope: BehaviourDocumentScope; name: string; relative: string } {
  const scope = String(scopeValue ?? '').trim() as BehaviourDocumentScope;
  const name = String(nameValue ?? '').trim();
  if (!BEHAVIOUR_SCOPES.includes(scope)) throw new BehaviourDocumentError('Choose a valid Behavior scope.');
  if (!tokenPattern.test(name)) throw new BehaviourDocumentError('Use a lowercase Behavior name with hyphens or underscores.');
  return { scope, name, relative: path.join(scope, `${name}.md`) };
}

function validateText(textValue: unknown, scope: BehaviourDocumentScope): string {
  const text = String(textValue ?? '');
  if (!text.trim()) throw new BehaviourDocumentError('A Behavior cannot be empty.');
  if (Buffer.byteLength(text, 'utf8') > 256 * 1024) throw new BehaviourDocumentError('That Behavior is too large.', 413);
  if (!/^#\s+\S.+$/m.test(text)) throw new BehaviourDocumentError('A Behavior needs a Markdown title.');
  const stated = text.match(/^-\s+\*\*scope:\*\*\s*(\S+)\s*$/mi)?.[1];
  if (stated !== scope) throw new BehaviourDocumentError(`The Behavior must declare scope: ${scope}.`);
  return text.endsWith('\n') ? text : `${text}\n`;
}

async function resolved(scope: BehaviourDocumentScope, name: string) {
  const { relative } = identity(scope, name);
  return (await resolveTreeFiles({
    stock: path.join(STOCK_DIR, 'behaviours'),
    store: 'ways',
    include: (candidate) => candidate === relative,
  }))[0];
}

export interface BehaviourDocument {
  name: string;
  scope: BehaviourDocumentScope;
  text: string;
  origin: Origin;
  shadowed: boolean;
  revision: string;
}

export async function readBehaviourDocument(scopeValue: unknown, nameValue: unknown): Promise<BehaviourDocument> {
  const { scope, name } = identity(scopeValue, nameValue);
  const file = await resolved(scope, name);
  if (!file) throw new BehaviourDocumentError('No such Behavior.', 404);
  return { name, scope, text: file.text, origin: file.origin, shadowed: file.shadowed, revision: digest(file.text) };
}

async function ownerTarget(scope: BehaviourDocumentScope, name: string): Promise<string> {
  const root = storeDir('ways');
  const dir = path.join(root, scope);
  await mkdir(dir, { recursive: true });
  const directoryFacts = await lstat(dir);
  if (!directoryFacts.isDirectory() || directoryFacts.isSymbolicLink()) throw new BehaviourDocumentError('The owner Behavior scope is not a regular directory.', 409);
  const target = path.join(dir, `${name}.md`);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new BehaviourDocumentError('Invalid Behavior destination.');
  return target;
}

async function ownerText(target: string): Promise<string | null> {
  try {
    const facts = await lstat(target);
    if (!facts.isFile() || facts.isSymbolicLink()) throw new BehaviourDocumentError('The owner Behavior is not a regular file.', 409);
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { return await handle.readFile('utf8'); } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicWrite(target: string, text: string): Promise<void> {
  const temporary = `${target}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
  await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  await rename(temporary, target);
}

async function exclusiveWrite(target: string, text: string): Promise<void> {
  try { await writeFile(target, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new BehaviourDocumentError('That owner Behavior already exists.', 409);
    throw error;
  }
}

export async function createBehaviourDocument(input: {
  scope: unknown; name: unknown; text: unknown; shadow?: unknown;
}): Promise<BehaviourDocument> {
  const { scope, name } = identity(input.scope, input.name);
  const text = validateText(input.text, scope);
  const existing = await resolved(scope, name);
  const shadow = input.shadow === true;
  if (existing?.origin === 'user') throw new BehaviourDocumentError('That owner Behavior already exists.', 409);
  if (existing?.origin === 'stock' && !shadow) throw new BehaviourDocumentError('That name belongs to a stock Behavior. Use Save to make an owner shadow.', 409);
  if (!existing && shadow) throw new BehaviourDocumentError('There is no stock Behavior to shadow.', 409);
  const target = await ownerTarget(scope, name);
  if (await ownerText(target) !== null) throw new BehaviourDocumentError('That owner Behavior already exists.', 409);
  await exclusiveWrite(target, text);
  return readBehaviourDocument(scope, name);
}

export async function updateBehaviourDocument(input: {
  scope: unknown; name: unknown; text: unknown; revision: unknown;
}): Promise<BehaviourDocument> {
  const { scope, name } = identity(input.scope, input.name);
  const text = validateText(input.text, scope);
  const target = await ownerTarget(scope, name);
  const current = await ownerText(target);
  if (current === null) throw new BehaviourDocumentError('Save the stock Behavior as your own before updating it.', 409);
  if (String(input.revision ?? '') !== digest(current)) throw new BehaviourDocumentError('This Behavior changed after you opened it. Reload it before saving.', 409);
  await atomicWrite(target, text);
  return readBehaviourDocument(scope, name);
}

export function behaviourStarter(label = 'My Behavior', scope: BehaviourDocumentScope = 'selected'): string {
  return `# ${label}\n\n- **label:** ${label}\n- **blurb:** Describe when this guidance helps.\n- **installation:** —\n- **scope:** ${scope}\n\nWrite the guidance the Agent receives at birth.\n`;
}
