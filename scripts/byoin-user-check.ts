
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

const exists = async (p: string) => !!(await stat(p).catch(() => null));
const mdFiles = async (dir: string): Promise<string[]> =>
  (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.md'));

const REQUIRED: Record<string, { keys: string[]; unless?: (e: { get: (k: string) => string }) => boolean }> = {
  'MACROS.md': { keys: ['label', 'blurb'] },
};

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
  const req = REQUIRED[file];
  for (const s of sections) {
    const get = (k: string) => entryValue(s.lines, k);
    if (entryValue(s.lines, 'hidden').toLowerCase() === 'yes') continue; // a deliberate hide
    if (!req) continue;
    if (req.unless?.({ get })) continue;
    for (const k of req.keys) {
      if (!get(k))
        find(
          `${label}: your entry "${s.name}" has no \`${k}:\` line, so the reader DROPS it — it will not appear on any surface`,
          `add \`- **${k}:** …\` (the shipped ronin_catalogs/${file} shows every field), or \`- **hidden:** yes\` if hiding it was the intent`,
        );
    }
  }
}

async function checkDefinitionsSurface(catalogsDir: string): Promise<void> {
  const kinds: DefinitionKind[] = [
    'routines', 'lexicons', 'desk_profiles', 'templates/agents', 'templates/teams',
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
}
async function checkShadowStore(id: string, stockDir: string): Promise<void> {
  const dir = storeDir(id);
  if (!(await exists(dir))) return;
  const walk = async (d: string, rel = ''): Promise<void> => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(d, e.name), r);
      else if (e.name.endsWith('.md')) {
        looked++;
        const p = path.join(d, e.name);
        const body = (await readFile(p, 'utf8').catch(() => '')).trim();
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
    await checkCatalogFile(catalogsDir, f, `${f} (yours)`);
  }
  await checkDefinitionsSurface(catalogsDir);
}
await checkShadowStore('sops', 'ronin_sops');
await checkShadowStore('library', 'ronin_library');
await checkShadowStore('session_boot', 'ronin_session_boot');

if (!looked) {
  console.log('  ok    byoin_user_check — no user customization on this box yet (nothing to check is a clean pass)');
} else if (!findings) {
  console.log(`  ok    byoin_user_check — ${looked} customization file(s)/entr(ies) looked at, all surface`);
}
process.exit(findings ? 1 : 0);
