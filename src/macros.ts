import { entryValue, isKeyLine, readCatalogSections, type Origin } from './resources.js';

export interface MacroParam {
  name: string;
  hint: string;
}

export interface MacroInfo {
  name: string;
  origin: Origin;
  instruction: string;
  params: MacroParam[];
  send?: string;
  preview: boolean;
  label: string;
  blurb: string;
}

export async function listMacros(): Promise<MacroInfo[]> {
  const macros: MacroInfo[] = [];
  for (const s of await readCatalogSections('MACROS.md')) {
    const lines = s.lines;
    let i = 0;
    while (i < lines.length && (!lines[i].trim() || isKeyLine(lines[i]))) i++;
    const para: string[] = [];
    while (i < lines.length && lines[i].trim()) para.push(lines[i++].trim());
    const send = parseSend(lines);
    macros.push({
      name: s.name,
      origin: s.origin,
      instruction: para.join(' '),
      params: parseParams(lines),
      preview: /^y/i.test(entryValue(lines, 'preview')),
      label: entryValue(lines, 'label'),
      blurb: entryValue(lines, 'blurb'),
      ...(send ? { send } : {}),
    });
  }
  return macros;
}

function parseSend(lines: string[]): string {
  const start = lines.findIndex((l) => /^Send:/i.test(l.trim()));
  if (start < 0) return '';
  const buf: string[] = [];
  let i = start;
  while (i < lines.length && lines[i].trim()) buf.push(lines[i++].trim());
  return buf.join(' ').replace(/^Send:\s*/i, '');
}

function parseParams(lines: string[]): MacroParam[] {
  const start = lines.findIndex((l) => /^Params:/i.test(l.trim()));
  if (start < 0) return [];
  const buf: string[] = [];
  let i = start;
  while (i < lines.length && lines[i].trim()) buf.push(lines[i++].trim());
  const blob = buf.join(' ').replace(/^Params:\s*/i, '');
  const params: MacroParam[] = [];
  for (const m of blob.matchAll(/`(\w+)`\s*(?:\(([^)]*)\))?/g)) {
    params.push({ name: m[1], hint: (m[2] ?? '').trim() });
  }
  return params;
}
