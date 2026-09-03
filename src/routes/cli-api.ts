import type { Express } from 'express';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { REPO_ROOT } from '../resources.js';

const TOOLS = new Set(['wipeboard', 'desk', 'promotion', 'jikan', 'bundle', 'recovery', 'auth', 'message']);
type Reply = { stdout: string; stderr: string; exit: number };
type Context = { session: string; pane: string };

function execute(tool: string, args: string[], input: string | undefined, context: Context): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', path.join(REPO_ROOT, 'src', 'commands', `${tool}.ts`), ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        RONIN_SESSION: context.session,
        TMUX_PANE: context.pane,
        RONIN_CLI_HTTP: '1',
        ...(input === undefined ? {} : { RONIN_CLI_INPUT: input }),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, exit: code ?? 1 }));
    child.stdin.end(input ?? '');
  });
}

function continuePromotion(id: string): void {
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(REPO_ROOT, 'src', 'commands', 'promotion-finish.ts'), id], {
    cwd: REPO_ROOT, env: process.env, detached: true, stdio: 'ignore',
  });
  child.unref();
}

export function registerCli(app: Express, options: {
  execute?: (tool: string, args: string[], input: string | undefined, context: Context) => Promise<Reply>;
  continuePromotion?: (id: string) => void;
} = {}): void {
  const run = options.execute ?? execute;
  const follow = options.continuePromotion ?? continuePromotion;
  app.post('/api/cli/:tool', async (req, res) => {
    const tool = String(req.params.tool ?? '');
    if (!TOOLS.has(tool)) return res.status(404).json({ error: 'No such command.' });
    const args = Array.isArray(req.body?.args) ? req.body.args.map(String) : [];
    try {
      const reply = await run(tool, args, typeof req.body?.input === 'string' ? req.body.input : undefined, {
        session: String(req.body?.session ?? ''), pane: String(req.body?.pane ?? ''),
      });
      const match = reply.stderr.match(/^RONIN_PROMOTION_FOLLOWUP=(.+)$/m);
      if (match) reply.stderr = reply.stderr.replace(/^RONIN_PROMOTION_FOLLOWUP=.+\n?/m, '');
      res.once('finish', () => {
        if (!match) return;
        follow(match[1]);
      });
      res.json(reply);
    } catch (e) { res.status(500).json({ error: String((e as Error).message ?? e) }); }
  });
}
