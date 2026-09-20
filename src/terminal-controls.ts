import { readFile } from 'node:fs/promises';
import type { Express } from 'express';
import { readMachineSettingsSection, updateDocument } from './machine-settings.js';
import { agentSpec } from './agents.js';
import { exactPane, listSessions } from './tmux.js';
import { tmux } from './tmux-client.js';

export const CONTROL_DEFAULTS = Object.freeze({ clear: 'Ctrl+Shift+Backspace', close: 'Ctrl+Shift+X', stop: 'Escape' });
export type TerminalIntent = keyof typeof CONTROL_DEFAULTS;
export type ControlBindings = Record<TerminalIntent, string>;
export function validateBindings(input: unknown): ControlBindings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Supply the three shortcut bindings.');
  const bindings = input as Record<string, unknown>;
  if (Object.keys(bindings).some((k) => !(k in CONTROL_DEFAULTS))) throw new Error('Unknown terminal action.');
  const result = {} as ControlBindings;
  for (const intent of Object.keys(CONTROL_DEFAULTS) as TerminalIntent[]) {
    const key = bindings[intent];
    if (typeof key !== 'string' || !/^(?:(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:Meta\+)?(?:[A-Z]|Backspace|Delete|Enter|Escape)|F(?:[1-9]|1[0-2]))$/.test(key)) throw new Error(`Invalid shortcut for ${intent}. Use Ctrl+X, Escape, or a function key.`);
    if (/^(?:Shift\+)?[A-Z]$/.test(key) || ['Enter', 'Backspace', 'Delete', 'Ctrl+C', 'Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+R', 'Ctrl+L', 'Meta+C', 'Meta+V', 'Meta+X', 'Meta+W', 'Meta+Q', 'Alt+F4', 'F5', 'F11', 'F12'].includes(key)) throw new Error(`${key} belongs to typing or the browser. Choose another shortcut.`);
    result[intent] = key;
  }
  if (new Set(Object.values(result)).size !== 3) throw new Error('Each action needs a different shortcut.');
  return result;
}
export async function controlBindings(): Promise<ControlBindings> {
  const stored = await readMachineSettingsSection('terminalControls', { bindings: CONTROL_DEFAULTS });
  // Drop the retired Copy binding while preserving the owner's other shortcuts.
  const { copy: _retiredCopy, ...bindings } = (stored.bindings || {}) as Record<string, unknown>;
  if (bindings.close === 'Ctrl+C') bindings.close = CONTROL_DEFAULTS.close;
  try { return validateBindings(bindings); } catch { return { ...CONTROL_DEFAULTS }; }
}
/** The Agent document owns the sequence; entries use tmux key names in send order. */
export async function agentControlKeys(cli: string, intent: 'stop' | 'clear'): Promise<readonly string[]> {
  if (!agentSpec(cli)) throw new Error(`No ${intent} binding is registered for ${cli || 'this terminal'}.`);
  const doc = await readFile(new URL(`../docs/agents/${cli}.md`, import.meta.url), 'utf8');
  const field = doc.split('\n').find((line) => line.startsWith(`- **${intent}_keys:** `));
  const keys = field?.split('** ')[1]?.trim().split(/\s+/);
  if (!keys?.length || keys.some((key) => !/^[A-Za-z0-9][A-Za-z0-9+-]*$/.test(key))) {
    throw new Error(`Missing or invalid ${intent}_keys in docs/agents/${cli}.md.`);
  }
  return keys;
}

export function registerTerminalControls(app: Express): void {
  app.get('/api/terminal-controls', async (_req, res) => res.json({ bindings: await controlBindings(), defaults: CONTROL_DEFAULTS }));
  app.put('/api/terminal-controls', async (req, res) => {
    let bindings: ControlBindings;
    try { bindings = validateBindings(req.body?.bindings); }
    catch (e) { return res.status(400).json({ error: (e as Error).message }); }
    await updateDocument((doc) => { doc.terminalControls = { bindings }; });
    res.json({ bindings, defaults: CONTROL_DEFAULTS });
  });
  app.post('/api/sessions/:name/control-action', async (req, res) => {
    const intent = req.body?.intent;
    if (intent !== 'stop' && intent !== 'clear') return res.status(400).json({ error: 'Choose Stop or Clear.' });
    const session = (await listSessions()).find((s) => s.name === req.params.name);
    if (!session || session.key !== req.body?.key) return res.status(409).json({ error: 'This Agent session changed. Reopen its Tile.' });
    let keys: readonly string[];
    try { keys = await agentControlKeys(session.identity?.cli || session.agent, intent); }
    catch (e) { return res.status(422).json({ error: (e as Error).message }); }
    try {
      await tmux.run(['send-keys', '-t', exactPane(session.name), '-X', 'cancel']).catch(() => {});
      await tmux.run(['send-keys', '-t', exactPane(session.name), ...keys]);
      res.json({ ok: true });
    } catch (e) { res.status(409).json({ error: (e as Error).message }); }
  });
}
