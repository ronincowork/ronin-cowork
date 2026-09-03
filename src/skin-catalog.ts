import { entryValue, isKeyLine, readCatalogSections, type Origin } from './resources.js';

export interface SkinInfo {
  name: string;
  label: string;
  blurb: string;
  origin: Origin;
  shadowed: boolean;
  tokens: Record<string, string>;
  light: Record<string, string>;
  dark: Record<string, string>;
}

const TOKEN_LINE = /^-\s*\*\*(light|dark)?(--[\w-]+):\*\*\s*(.+?)\s*$/;

export async function listSkins(): Promise<SkinInfo[]> {
  const sections = await readCatalogSections('SKINS.md', true);
  const out: SkinInfo[] = [];
  for (const s of sections) {
    if (entryValue(s.lines, 'hidden').toLowerCase() === 'yes') continue;
    const tokens: Record<string, string> = {};
    const light: Record<string, string> = {};
    const dark: Record<string, string> = {};
    for (const line of s.lines) {
      if (!isKeyLine(line)) continue;
      const m = TOKEN_LINE.exec(line.trim());
      if (!m) continue;
      (m[1] === 'light' ? light : m[1] === 'dark' ? dark : tokens)[m[2]] = m[3];
    }
    out.push({
      name: s.name,
      label: entryValue(s.lines, 'label') || s.name,
      blurb: entryValue(s.lines, 'blurb'),
      origin: s.origin,
      shadowed: s.shadowed,
      tokens,
      light,
      dark,
    });
  }
  return out;
}
