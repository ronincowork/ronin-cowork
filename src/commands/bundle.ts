/**
 * ronin-bundle — a template bundle in and out of this install, from the command line.
 *
 *   ronin-bundle pack <team> [--agents a,b] [--sops x] [--ways y] [--library z]
 *                            [--macros m] [--actions a] [--tools t] [--version v] [--out file]
 *   ronin-bundle plan <file.json>                what an install would do, nothing written
 *   ronin-bundle install <file.json> [--replace] the install, and its receipt
 *   ronin-bundle card <file.json> --url <rel>    the index card a library carries for it
 *
 * THE LOGIC IS NOT HERE. src/bundles.ts owns it and is covered by the unit floor
 * (tests/bundles.test.ts); this is the wrapper bin/ronin-bundle execs, the same arrangement
 * as tejun-desk. Every verdict is one line; exit 2 = bad arguments, 3 = refused.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { installBundle, libraryCard, packBundle, parseBundle, planInstall, type PackRequest } from '../bundles.js';

const USAGE = `usage: ronin-bundle pack <team> [--agents a,b] [--sops x] [--ways y] [--library z] [--macros m] [--actions a] [--tools t] [--version v] [--out file]
       ronin-bundle plan <file.json>
       ronin-bundle install <file.json> [--replace]
       ronin-bundle card <file.json> --url <relative-url>`;

function flags(argv: string[]): { positional: string[]; opts: Record<string, string | true> } {
  const positional: string[] = [];
  const opts: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { opts[key] = next; i++; } else opts[key] = true;
  }
  return { positional, opts };
}

const list = (v: string | true | undefined): string[] =>
  typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

async function readDoc(file: string | undefined): Promise<ReturnType<typeof parseBundle>> {
  if (!file) { console.error(USAGE); process.exit(2); }
  return parseBundle(JSON.parse(await readFile(file, 'utf8')));
}

async function main(): Promise<void> {
  const [verb, ...rest] = process.argv.slice(2);
  const { positional, opts } = flags(rest);
  if (verb === 'pack') {
    const team = positional[0];
    if (!team) { console.error(USAGE); process.exit(2); }
    const req: PackRequest = {
      team,
      agents: list(opts.agents), sops: list(opts.sops), ways: list(opts.ways), library: list(opts.library),
      macros: list(opts.macros), actions: list(opts.actions), tools: list(opts.tools),
      version: typeof opts.version === 'string' ? opts.version : undefined,
    };
    const bundle = await packBundle(req);
    const text = `${JSON.stringify(bundle, null, 2)}\n`;
    if (typeof opts.out === 'string') {
      await writeFile(opts.out, text, 'utf8');
      console.log(`PACKED ${bundle.name} → ${opts.out} (${bundle.files.length} files, ${bundle.entries.length} entries)`);
    } else process.stdout.write(text);
    return;
  }
  if (verb === 'plan') {
    const bundle = await readDoc(positional[0]);
    for (const item of await planInstall(bundle)) {
      console.log(`${item.verdict.padEnd(16)} ${String(item.store).padEnd(10)} ${item.path}${item.why ? `  — ${item.why}` : ''}`);
    }
    return;
  }
  if (verb === 'install') {
    const bundle = await readDoc(positional[0]);
    const receipt = await installBundle(bundle, { replace: opts.replace === true });
    console.log(`INSTALLED ${receipt.name}${receipt.version ? ` ${receipt.version}` : ''}: ${receipt.written.length} written · ${receipt.skipped.length} left alone · ${receipt.refused.length} refused`);
    for (const item of receipt.refused) console.log(`  refused ${item.store}/${item.path} — ${item.why}`);
    return;
  }
  if (verb === 'card') {
    const file = positional[0];
    const bundle = await readDoc(file);
    if (typeof opts.url !== 'string') { console.error(USAGE); process.exit(2); }
    console.log(JSON.stringify(libraryCard(bundle, await readFile(file!, 'utf8'), opts.url), null, 2));
    return;
  }
  console.error(USAGE);
  process.exit(2);
}

main().catch((e: Error) => {
  console.error(`REFUSED: ${e.message}`);
  process.exit(3);
});
