/** THE USER INTRO — the self-hosted owner's own text about themself: `~/ronin/facts/user-intro.md`.
 * One writer. The about_user fact reads it (src/facts.ts, KAN-768); its own header is depth none,
 * so the brief tells it only through that fact. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCatalogFile } from './catalog.js';
import { storeDir } from './resources.js';

export const userIntroFile = (): string => process.env.RONIN_USER_INTRO_FILE?.trim()
  || path.join(storeDir('facts'), 'user-intro.md');

/** The user intro file: the user's own text, under a header that keeps it out of the brief's own facts. */
export const userIntroFact = (intro: string): string =>
  `# User intro\n- **depth:** none\n\n${intro.trim()}\n`;

const clean = (value: unknown): string => typeof value === 'string'
  ? value.trim().replace(/\r\n?/g, '\n').slice(0, 600)
  : '';

export async function readUserIntro(): Promise<{ intro: string; file: string }> {
  const file = userIntroFile();
  try {
    return { intro: parseCatalogFile('facts', 'user-intro', await fs.readFile(file, 'utf8')).body, file };
  } catch {
    return { intro: '', file };
  }
}

/** Write the intro; blank removes the file. */
export async function saveUserIntro(intro: string): Promise<void> {
  const file = userIntroFile();
  if (!intro.trim()) {
    await fs.rm(file, { force: true });
    return;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, userIntroFact(intro), { mode: 0o600 });
  await fs.rename(tmp, file);
}

export async function writeUserIntro(value: unknown): Promise<{ intro: string; file: string }> {
  const intro = clean(value);
  if (!intro) throw new Error('Write a short introduction before saving.');
  await saveUserIntro(intro);
  return { intro, file: userIntroFile() };
}
