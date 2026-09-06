import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { listProjectRoots, type ProjectRootInfo } from './project-roots.js';

export class DocumentPathError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const containedBy = (root: string, file: string): boolean => {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
};

async function resolveRegisteredDocument(rootName: unknown, requestedPath: unknown, suppliedRoots: ProjectRootInfo[] | undefined, page: boolean): Promise<string> {
  const rootToken = String(rootName ?? '').trim();
  const supplied = String(requestedPath ?? '').trim();
  if (!supplied) throw new DocumentPathError('A document path is required.');

  const roots = (suppliedRoots ?? await listProjectRoots()).filter((root) => !root.archived);
  let candidate: string;
  let permitted = roots;
  if (rootToken) {
    const root = roots.find((entry) => entry.name === rootToken);
    if (!root) throw new DocumentPathError('Choose a registered workspace folder.', 403);
    if (path.isAbsolute(supplied)) throw new DocumentPathError('Use a path relative to the workspace folder.');
    candidate = path.resolve(root.dir, supplied);
    permitted = [root];
  } else {
    // Compatibility for the existing Docs shelf. Absolute paths still pass through the
    // same registered-root boundary; they are no longer arbitrary-file authority.
    if (!path.isAbsolute(supplied)) throw new DocumentPathError('An absolute path or registered workspace folder is required.');
    candidate = path.resolve(supplied);
  }

  let canonical: string;
  try { canonical = await realpath(candidate); }
  catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') throw new DocumentPathError('No such file — it moved or was deleted.', 404);
    throw error;
  }
  if (!(page ? /\.(md|html?)$/i : /\.md$/i).test(canonical)) {
    throw new DocumentPathError(page ? 'Only documents can be opened.' : 'Only Markdown documents can be edited.', 415);
  }

  const allowed = await Promise.all(permitted.map(async (root) => {
    try { return containedBy(await realpath(root.dir), canonical); }
    catch { return false; }
  }));
  if (!allowed.some(Boolean)) throw new DocumentPathError('That document is outside the registered workspace folders.', 403);
  const facts = await stat(canonical);
  if (!facts.isFile()) throw new DocumentPathError('No such file.', 404);
  return canonical;
}

/** Resolve only an existing Markdown document inside an active registered project root. */
export const resolveDocumentFile = (rootName: unknown, requestedPath: unknown, suppliedRoots?: ProjectRootInfo[]) =>
  resolveRegisteredDocument(rootName, requestedPath, suppliedRoots, false);

/** Resolve an existing Markdown/HTML document for the existing view-only raw route. */
export const resolveDocumentPage = (requestedPath: unknown, suppliedRoots?: ProjectRootInfo[]) =>
  resolveRegisteredDocument('', requestedPath, suppliedRoots, true);

/** Read from the validated inode without following a last-moment replacement symlink. */
export async function readDocumentFile(rootName: unknown, requestedPath: unknown): Promise<{ path: string; text: string }> {
  const file = await resolveDocumentFile(rootName, requestedPath);
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return { path: file, text: await handle.readFile('utf8') }; }
  finally { await handle.close(); }
}

/** Save only to the validated inode; the API never creates a document. */
export async function saveDocumentFile(rootName: unknown, requestedPath: unknown, text: string): Promise<string> {
  const file = await resolveDocumentFile(rootName, requestedPath);
  const handle = await open(file, constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW);
  try { await handle.writeFile(text, 'utf8'); }
  finally { await handle.close(); }
  return file;
}
