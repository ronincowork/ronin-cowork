
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { storeDir, splitSections, entryValue } from '../src/resources.js';
import { readDefinitions, type DefinitionKind } from '../src/resource-adapters.js';

let findings = 0;
let looked = 0;
const find = (msg: string, remedy: string) => {
  console.error(`  FIND  ${msg}`);
  console.error(`        remedy: ${remedy}`);
  findings++;
};

const absent = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const exists = async (p: string) => {
  try { await stat(p); return true; }
  catch (error) { if (absent(error)) return false; throw error; }
};
const mdFiles = async (dir: string): Promise<string[]> =>
  (await readdir(dir).catch((error) => { if (absent(error)) return [] as string[]; throw error; })).filter((f) => f.endsWith('.md'));

async function checkCatalogFile(dir: string, file: string, label: string): Promise<void> {
  looked++;
  const raw = await readFile(path.join(dir, file), 'utf8');
  const sections = splitSections(raw, 'user').filter((s) => s.head === s.name);
  const body = raw.replace(/^#.*$/gm, '').replace(/^>.*$/gm, '').trim();
  if (!sections.length) {
    if (body)
      find(
        `${label}: no \`## <name>\` entries parse from this file, but it is not empty`,
        `an entry is a \`## name\` heading with \`- **key:** value\` lines under it — see the shipped ronin_catalogs/${file.includes('/') ? file : file} for the format`,
      );
    return;
  }
  for (const s of sections) {
    if (entryValue(s.lines, 'hidden').toLowerCase() === 'yes') continue; // a deliberate hide
  }
}

async function checkDefinitionsSurface(catalogsDir: string): Promise<void> {
  const kinds: DefinitionKind[] = [
    'lexicons', 'desk_profiles', 'installations', 'capabilities', 'templates/agents', 'templates/teams',
  ];
  for (const kind of kinds) {
    const dir = path.join(catalogsDir, kind);
    if (!(await exists(dir))) continue;
    const listed = new Set((await readDefinitions(kind)).map((row) => row.name.toLowerCase()));
    for (const file of await mdFiles(dir)) {
      if (file.toLowerCase() === 'readme.md') continue;
      looked++;
      const name = file.replace(/\.md$/, '');
      const lines = (await readFile(path.join(dir, file), 'utf8')).split('\n');
      if (/^yes$/i.test(entryValue(lines, 'hidden'))) continue;
      if (listed.has(name.toLowerCase())) continue;
      const shipped = `ronin_catalogs/${kind}/${file}`;
      const remedy = await exists(path.join(process.cwd(), shipped))
        ? `copy ${shipped} into your catalogs store and edit that complete definition, or delete your shadow to restore the shipped one`
        : `copy a complete definition from ronin_catalogs/${kind}/ and rename it, or delete this abandoned file`;
      find(
        `${kind}/${file} (yours): "${name}" does not surface — the reader requires at least one \`- **key:** value\` line`,
        remedy,
      );
    }
  }

  const behaviourDir = storeDir('ways');
  if (await exists(behaviourDir)) {
    const listed = new Set((await readDefinitions('behaviours')).filter((row) => row.origin === 'user').map((row) => path.resolve(row.file)));
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (entry.name.endsWith('.md') && entry.name.toLowerCase() !== 'readme.md') {
          looked++;
          if (!listed.has(path.resolve(file))) find(
            `behaviours/${path.relative(behaviourDir, file)} (yours) does not surface`,
            'put it under floor, conditional, selected, or sought; make its `scope` match that directory; and include at least one `- **key:** value` line',
          );
        }
      }
    };
    await walk(behaviourDir);
  }
}
async function checkShadowStore(id: string, stockDir: string): Promise<void> {
  const dir = storeDir(id);
  if (!(await exists(dir))) return;
  const walk = async (d: string, rel = ''): Promise<void> => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(d, e.name), r);
      else if (e.name.endsWith('.md') && e.name.toLowerCase() !== 'readme.md') {
        looked++;
        const p = path.join(d, e.name);
        const body = (await readFile(p, 'utf8')).trim();
        if (!body)
          find(
            `${id} store: ${r} is empty — it shadows (or adds to) ${stockDir}/ but says nothing`,
            `write the content, or delete the file; an empty shadow replaces a shipped page with silence`,
          );
      }
    }
  };
  await walk(dir);
}

const catalogsDir = storeDir('catalogs');
if (await exists(catalogsDir)) {
  for (const f of await mdFiles(catalogsDir)) {
    // These catalogs have dedicated readers and do not use `## name` sections.
    if (f === 'MODEL_PROVIDERS.md' || f === 'TOOLS.md') continue;
    await checkCatalogFile(catalogsDir, f, `${f} (yours)`);
  }
  await checkDefinitionsSurface(catalogsDir);
}
await checkShadowStore('ways', 'ronin_catalogs/behaviours');
await checkShadowStore('library', 'ronin_library');
await checkShadowStore('session_boot', 'ronin_session_boot');

if (!looked) {
  console.log('  ok    byoin_user_check — no user customization on this box yet (nothing to check is a clean pass)');
} else if (!findings) {
  console.log(`  ok    byoin_user_check — ${looked} customization file(s)/entr(ies) checked; no unreadable, empty, or rejected definitions found`);
}
process.exit(findings ? 1 : 0);
