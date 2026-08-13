import { capturePane } from './tmux.js';

/**
 * Context-gauge scrape (terminal view only): the CLI running in the pane publishes
 * its own context-window number into its status line; we read it back out of the
 * ORDINARY PANE TEXT. Never agent internals — no ~/.claude, no transcripts.
 *
 * The pattern list is THE extension point: one entry per CLI wording, tried in
 * order, first match wins. `mode` says what the captured number means —
 * `used` is taken as-is, `remaining` is inverted (used = 100 − n).
 */
export interface CtxPattern {
  re: RegExp;
  mode: 'used' | 'remaining';
}

export const CTX_PATTERNS: CtxPattern[] = [
  // Claude Code via ~/.claude/statusline-ronin.sh: "⛽ ctx 42% · <model>"
  { re: /⛽ ctx (\d+(?:\.\d+)?)%/, mode: 'used' },
  // Codex CLI (current wording): "Context 37.2% used"
  { re: /context\s+(\d+(?:\.\d+)?)%\s+used/i, mode: 'used' },
  // Codex CLI (older/other builds): "63% left" — remaining, so invert
  { re: /(\d+(?:\.\d+)?)%\s+left/i, mode: 'remaining' },
];

/**
 * The model name sits on the same status line as the context number, so the same
 * scrape can read it — still ordinary pane text, still never agent internals.
 * Same extension-point contract as CTX_PATTERNS: one entry per CLI wording.
 */
export const MODEL_PATTERNS: RegExp[] = [
  // Claude Code via ~/.claude/statusline-ronin.sh: "⛽ ctx 42% · Opus 5"
  /⛽ ctx \d+(?:\.\d+)?% · ([^\n·]{1,24}?)\s*$/,
  // Codex CLI: "… · gpt-5-codex"
  /·\s*(gpt-[\w.-]{1,20})\s*$/i,
];

/** Status lines live at the pane bottom — only the visible tail is worth scanning. */
const SCAN_LINES = 10;

/**
 * Scan already-captured pane text for a context reading (lets callers that also
 * status-probe share ONE capture). Scans bottom-up so the freshest status line
 * wins over stale scrollback text.
 */
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

/**
 * Scan captured pane text for the model name on the status line, or null when no
 * pattern matches (a plain shell has none — that is fine, the footer just omits it).
 * Bottom-up like scanContext, so the freshest status line wins.
 */
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

/** One capture, both readings — what the tile footer needs in a single round trip. */
export async function readCtxLine(session: string): Promise<{ ctx: number | null; model: string | null }> {
  try {
    const text = await capturePane(session, 0);
    return { ctx: scanContext(text), model: scanModel(text) };
  } catch {
    return { ctx: null, model: null };
  }
}
