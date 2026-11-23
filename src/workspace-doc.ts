/**
 * WORKSPACE DOCS (owner, 2026-11-19, KAN-713): one Markdown file per Workspace, so Agents know the
 * office's Workspaces. ~/ronin/office/workspaces/<handle>.md, the handle being the Workspace's name
 * (listWorkspaces). A "## Summary" section, then "## Notes". Made with the Workspace
 * (saveWorkspace); an older Workspace gets its file on the first read. The folder is the store:
 * plain files, greppable. `workspace-doc` reads and writes it; `office read` shows each Summary.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';

const SUMMARY = '## Summary';
const NOTES = '## Notes';

export const workspaceDocPath = (handle: string): string => path.join(storeDir('office'), 'workspaces', `${handle}.md`);

const readText = async (handle: string): Promise<string | null> => {
  try { return await readFile(workspaceDocPath(handle), 'utf8'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
};

export const writeWorkspaceDoc = async (handle: string, text: string): Promise<void> => writeText(handle, text.endsWith('\n') ? text : `${text}\n`);

const writeText = async (handle: string, text: string): Promise<void> => {
  const file = workspaceDocPath(handle);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, text, 'utf8');
  await rename(`${file}.tmp`, file);
};

/** The Summary: the text from "## Summary" to the next "## " heading, trimmed; '' when none. */
export const summaryOf = (text: string): string => {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line.trim() === SUMMARY);
  if (at < 0) return '';
  const end = lines.findIndex((line, n) => n > at && line.startsWith('## '));
  return lines.slice(at + 1, end < 0 ? undefined : end).join('\n').trim();
};

export async function readWorkspaceSummary(handle: string): Promise<string> {
  return summaryOf((await readText(handle)) ?? '');
}

/** The file's text, made first when it is not there yet. */
export async function ensureWorkspaceDoc(handle: string, title = handle): Promise<string> {
  const had = await readText(handle);
  if (had !== null) return had;
  const text = `# ${title || handle}\n\n${SUMMARY}\n\n${NOTES}\n`;
  await writeText(handle, text);
  return text;
}

/** Replace the Summary section's text; the rest of the file stays as it is. */
export async function writeWorkspaceSummary(handle: string, summary: string): Promise<string> {
  const lines = (await ensureWorkspaceDoc(handle)).split('\n');
  let at = lines.findIndex((line) => line.trim() === SUMMARY);
  if (at < 0) { lines.splice(lines[0]?.startsWith('# ') ? 1 : 0, 0, '', SUMMARY); at = lines.indexOf(SUMMARY); }
  const end = lines.findIndex((line, n) => n > at && line.startsWith('## '));
  const tail = end < 0 ? [] : lines.slice(end);
  const text = [...lines.slice(0, at + 1), '', summary.trim(), '', ...tail].join('\n').replace(/\n*$/, '\n');
  await writeText(handle, text);
  return text;
}

/** Add a note at the file's end: "- <date> <by>: <text>". */
export async function addWorkspaceNote(handle: string, note: string, by: string): Promise<string> {
  const had = (await ensureWorkspaceDoc(handle)).replace(/\n*$/, '\n');
  const text = `${had}- ${new Date().toISOString().slice(0, 10)} ${by || 'unknown'}: ${note.trim().replace(/\s*\n\s*/g, ' ')}\n`;
  await writeText(handle, text);
  return text;
}
