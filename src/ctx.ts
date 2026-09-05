import { capturePane } from './tmux.js';

export interface CtxPattern {
  re: RegExp;
  mode: 'used' | 'remaining';
}

export const CTX_PATTERNS: CtxPattern[] = [
  { re: /⛽ ctx (\d+(?:\.\d+)?)%/, mode: 'used' },
  { re: /context\s+(\d+(?:\.\d+)?)%\s+used/i, mode: 'used' },
  { re: /(\d+(?:\.\d+)?)%\s+left/i, mode: 'remaining' },
];

export const MODEL_PATTERNS: RegExp[] = [
  // The model is the text after " · ", up to the end of the line OR the first run of two
  // or more spaces. Claude Code pads its status line and may right-align other text on
  // the same row (seen on dohyo, 2026-09-05: `⛽ ctx 36% · Fable 5.1      /rc`), and an
  // end-of-line-only anchor read nothing for exactly the sessions that had the line.
  /⛽ ctx \d+(?:\.\d+)?% · ([^\n·]{1,24}?)(?:\s{2,}.*)?\s*$/,
  /·\s*(gpt-[\w.-]{1,20})\s*$/i,
  /^\s*(gpt-[\w.-]{1,24})(?:\s+\w+)?\s+·/i,
];

const SCAN_LINES = 10;

export function scanContext(text: string): number | null {
  const lines = text.replace(/\n+$/, '').split('\n').slice(-SCAN_LINES);
  for (let i = lines.length - 1; i >= 0; i--) {
    for (const p of CTX_PATTERNS) {
      const m = p.re.exec(lines[i]);
      if (!m) continue;
      const n = Number(m[1]);
      if (!Number.isFinite(n)) continue;
      const used = p.mode === 'remaining' ? 100 - n : n;
      return Math.max(0, Math.min(100, Math.round(used)));
    }
  }
  return null;
}

export function scanModel(text: string): string | null {
  const lines = text.replace(/\n+$/, '').split('\n').slice(-SCAN_LINES);
  for (let i = lines.length - 1; i >= 0; i--) {
    for (const re of MODEL_PATTERNS) {
      const m = re.exec(lines[i]);
      if (m && m[1].trim()) return m[1].trim();
    }
  }
  return null;
}

export async function readCtxLine(session: string): Promise<{ ctx: number | null; model: string | null }> {
  try {
    const text = await capturePane(session, 0);
    return { ctx: scanContext(text), model: scanModel(text) };
  } catch {
    return { ctx: null, model: null };
  }
}
