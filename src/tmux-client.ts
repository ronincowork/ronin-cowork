import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export type ClientState = 'up' | 'reconnecting' | 'fallback';

export interface Notification {
  kind: string;
  rawKind: `%${string}`;
  line: string;
  args: string[];
  paneId?: string;
  output?: string;
  subscription?: string;
  value?: string;
}

export interface TmuxClient {
  /** Opt into the persistent control connection. Long-lived server processes only. */
  connect(): Promise<void>;
  run(args: readonly string[], opts?: { timeoutMs?: number }): Promise<string>;
  on(kind: Notification['kind'], handler: (notification: Notification) => void): () => void;
  state(): ClientState;
}

interface ControlProcess {
  stdin: Pick<NodeJS.WritableStream, 'write' | 'on'> & { ref?(): void; unref?(): void };
  stdout: NodeJS.ReadableStream & { ref?(): void; unref?(): void };
  stderr: NodeJS.ReadableStream & { ref?(): void; unref?(): void };
  once(event: 'exit' | 'error', handler: (...args: unknown[]) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
  ref?(): void;
  unref?(): void;
}

interface Dependencies {
  exec(file: string, args: readonly string[], timeoutMs: number): Promise<string>;
  spawnControl(): ControlProcess;
  setTimer(handler: () => void, delayMs: number): NodeJS.Timeout;
  clearTimer(timer: NodeJS.Timeout): void;
  log(message: string): void;
}

interface Reply {
  id: string;
  lines: string[];
  resolve(value: string): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

interface StartupReply {
  id: string;
  resolve(): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export const TMUX_CONTROL_HOLDER = 'grid_ctl';
const DEFAULT_TIMEOUT_MS = 5_000;
const BACKOFF_MS = [200, 1_000, 5_000] as const;
const ACTIVITY_SUBSCRIPTION = 'activity::#{S:#{session_name}:#{window_activity},}';
const tmuxEnvironment = (): string => `${process.env.TMUX ?? ''}\0${process.env.TMUX_TMPDIR ?? ''}`;

class ConnectionLostError extends Error {}

export function quoteTmuxArg(arg: string): string {
  if (arg === ';') return ';';
  return `'${arg.replaceAll("'", "'\\''")}'`;
}

export function commandLine(args: readonly string[]): string {
  if (!args.length) throw new Error('A tmux command must not be empty.');
  if (args.some((arg) => arg.includes('\n') || arg.includes('\r'))) {
    throw new Error('Tmux command arguments must not contain newlines.');
  }
  return args.map(quoteTmuxArg).join(' ');
}

export function decodeTmuxOutput(value: string): string {
  return value.replace(/\\([0-7]{3})/g, (_match, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)));
}

function defaultExec(file: string, args: readonly string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { encoding: 'utf8', timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        const text = String(stderr || error.message).replace(/\r?\n$/, '');
        reject(new Error(text));
      } else {
        resolve(String(stdout).replace(/\r?\n$/, ''));
      }
    });
  });
}

const DEFAULT_DEPENDENCIES: Dependencies = {
  exec: defaultExec,
  spawnControl: () => spawn('tmux', ['-C', 'attach-session', '-t', `=${TMUX_CONTROL_HOLDER}`], {
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams,
  setTimer: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
  log: (message) => console.error(message),
};

export class ControlTmuxClient implements TmuxClient {
  private readonly deps: Dependencies;
  private currentState: ClientState = 'fallback';
  private process: ControlProcess | undefined;
  private buffer = '';
  private reply: Reply | undefined;
  private startup: StartupReply | undefined;
  private queue: Promise<void> = Promise.resolve();
  private connecting: Promise<void> | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private reconnectAttempt = 0;
  private activeRequests = 0;
  private connectionEnvironment = '';
  private stoppedProcess = new WeakSet<object>();
  private readonly handlers = new Map<string, Set<(notification: Notification) => void>>();
  private activityRequested = false;
  private controlEnabled = false;
  private hasBeenUp = false;

  constructor(dependencies: Partial<Dependencies> = {}) {
    this.deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  }

  state(): ClientState {
    return this.currentState;
  }

  async connect(): Promise<void> {
    this.controlEnabled = true;
    if (this.process && this.currentState === 'up') return;
    await this.ensureConnected();
  }

  on(kind: Notification['kind'], handler: (notification: Notification) => void): () => void {
    const handlers = this.handlers.get(kind) ?? new Set();
    handlers.add(handler);
    this.handlers.set(kind, handlers);
    if ((kind === 'subscription' || kind === '%subscription-changed') && !this.activityRequested) {
      this.activityRequested = true;
      if (this.process && this.currentState === 'up') {
        void this.run(['refresh-client', '-B', ACTIVITY_SUBSCRIPTION]).catch(() => undefined);
      } else {
        void this.ensureConnected().catch(() => undefined);
      }
    }
    return () => handlers.delete(handler);
  }

  run(args: readonly string[], opts: { timeoutMs?: number } = {}): Promise<string> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('timeoutMs must be positive.'));
    this.activeRequests += 1;
    this.syncProcessRefs();
    const task = this.queue.then(() => this.runSerialized(args, timeoutMs));
    this.queue = task.then(() => undefined, () => undefined);
    return task.finally(() => {
      this.activeRequests -= 1;
      this.syncProcessRefs();
    });
  }

  private async runSerialized(args: readonly string[], timeoutMs: number): Promise<string> {
    // tmux's parser ends a command at a newline and a quoted string cannot span lines, so
    // an argument holding one — a birth's brief, handed to new-session as argv — cannot
    // travel over the control line. That one call takes the process path, state unchanged.
    if (args.some((arg) => arg.includes('\n') || arg.includes('\r'))) return this.deps.exec('tmux', args, timeoutMs);
    commandLine(args); // Validate before opening a connection or invoking the fallback.
    if (!this.controlEnabled) return this.fallback(args, timeoutMs);
    this.followTmuxEnvironment();
    if (this.connecting) await this.connecting.catch(() => undefined);
    if (!this.process && !this.connecting && !this.reconnectTimer) {
      await this.ensureConnected().catch(() => undefined);
    }
    if (!this.process || this.currentState !== 'up') return this.fallback(args, timeoutMs);
    try {
      return await this.controlRun(args, timeoutMs);
    } catch (error) {
      // A command whose connection vanished is safe to retry once through whichever
      // path is now healthy. Timeouts and tmux command errors are never replayed.
      if (error instanceof ConnectionLostError) {
        if (this.process && this.currentState === 'up') return this.controlRun(args, timeoutMs);
        return this.fallback(args, timeoutMs);
      }
      throw error;
    }
  }

  private fallback(args: readonly string[], timeoutMs: number): Promise<string> {
    this.setState('fallback');
    return this.deps.exec('tmux', args, timeoutMs);
  }

  private async ensureConnected(): Promise<void> {
    if (this.process && this.currentState === 'up') return;
    if (this.connecting) return this.connecting;
    this.connecting = this.openConnection();
    try {
      await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private async openConnection(): Promise<void> {
    this.setState('reconnecting');
    try {
      await this.ensureHolder();
      const child = this.deps.spawnControl();
      this.process = child;
      this.connectionEnvironment = tmuxEnvironment();
      this.buffer = '';
      child.stdout.on('data', (chunk) => this.read(chunk));
      child.stdout.once('end', () => this.connectionEnded(child, 'EOF'));
      child.once('exit', (...args) => this.connectionEnded(child, `exit ${String(args[0] ?? '')}`.trim()));
      child.once('error', (...args) => this.connectionEnded(child, String(args[0] ?? 'error')));
      for (const stream of [child.stdin, child.stdout, child.stderr]) {
        stream.on('error', (error) => this.dropConnection(child, `stream error: ${String(error)}`));
      }
      await new Promise<void>((resolve, reject) => {
        const timer = this.deps.setTimer(() => {
          reject(new Error('tmux control attach timed out'));
          this.startup = undefined;
          this.dropConnection(child, 'attach timeout');
        }, DEFAULT_TIMEOUT_MS);
        this.startup = { id: '', resolve, reject, timer };
      });
      this.reconnectAttempt = 0;
      this.setState('up');
      if (this.activityRequested) {
        await this.controlRun(['refresh-client', '-B', ACTIVITY_SUBSCRIPTION], DEFAULT_TIMEOUT_MS);
      }
      this.syncProcessRefs();
    } catch (error) {
      if (this.process) this.dropConnection(this.process, `connection setup failed: ${String(error)}`);
      this.setState('fallback');
      this.scheduleReconnect();
      throw error;
    }
  }

  private async ensureHolder(): Promise<void> {
    try {
      await this.deps.exec('tmux', ['new-session', '-d', '-s', TMUX_CONTROL_HOLDER, 'exec sleep 2147483647'], DEFAULT_TIMEOUT_MS);
    } catch {
      // `new-session` returning nonzero is expected when another process already made it.
      await this.deps.exec('tmux', ['has-session', '-t', `=${TMUX_CONTROL_HOLDER}`], DEFAULT_TIMEOUT_MS);
    }
  }

  private controlRun(args: readonly string[], timeoutMs: number): Promise<string> {
    const child = this.process;
    if (!child) return Promise.reject(new ConnectionLostError('tmux control connection is down'));
    return new Promise((resolve, reject) => {
      const timer = this.deps.setTimer(() => {
        reject(new Error(`tmux command timed out after ${timeoutMs} ms`));
        this.reply = undefined;
        this.dropConnection(child, 'command timeout');
      }, timeoutMs);
      this.reply = { id: '', lines: [], resolve, reject, timer };
      child.stdin.write(`${commandLine(args)}\n`, (error?: Error | null) => {
        if (error && this.reply) this.dropConnection(child, error.message);
      });
    });
  }

  private read(chunk: unknown): void {
    this.buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline === -1) return;
      const line = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      this.readLine(line);
    }
  }

  private readLine(line: string): void {
    if (line.startsWith('%begin ')) {
      const id = line.split(/\s+/)[2] ?? '';
      if (this.startup && !this.startup.id) {
        this.startup.id = id;
        return;
      }
      if (!this.reply || this.reply.id) return this.protocolFailure(`unexpected ${line}`);
      this.reply.id = id;
      return;
    }
    if (line.startsWith('%end ') || line.startsWith('%error ')) {
      const id = line.split(/\s+/)[2] ?? '';
      if (this.startup) {
        if (!this.startup.id || this.startup.id !== id) return this.protocolFailure(`unmatched startup ${line}`);
        const startup = this.startup;
        this.startup = undefined;
        this.deps.clearTimer(startup.timer);
        if (line.startsWith('%error ')) startup.reject(new Error('tmux control attach failed'));
        else startup.resolve();
        return;
      }
      const reply = this.reply;
      if (!reply || !reply.id || reply.id !== id) return this.protocolFailure(`unmatched ${line}`);
      this.reply = undefined;
      this.deps.clearTimer(reply.timer);
      const text = reply.lines.join('\n');
      if (line.startsWith('%error ')) reply.reject(new Error(text));
      else reply.resolve(text);
      return;
    }
    if (line === '%exit' || line.startsWith('%exit ')) {
      if (this.process) this.dropConnection(this.process, line.slice(6).trim() || 'tmux exited');
      return;
    }
    if (this.reply?.id) {
      this.reply.lines.push(line);
      return;
    }
    if (this.startup?.id) return;
    if (line.startsWith('%')) this.emitNotification(line);
  }

  private emitNotification(line: string): void {
    const [rawKind, ...args] = line.split(' ');
    if (!rawKind) return;
    const kind = rawKind === '%subscription-changed' ? 'subscription' : rawKind.slice(1);
    const notification: Notification = { kind, rawKind: rawKind as `%${string}`, line, args };
    if (rawKind === '%output' && args.length) {
      notification.paneId = args[0];
      notification.output = decodeTmuxOutput(line.slice(rawKind.length + 1 + args[0]!.length + 1));
    }
    if (rawKind === '%subscription-changed') {
      notification.subscription = args[0];
      const divider = line.indexOf(' : ');
      notification.value = divider === -1 ? '' : line.slice(divider + 3);
    }
    const listeners = new Set([
      ...(this.handlers.get(kind) ?? []),
      ...(this.handlers.get(rawKind) ?? []),
    ]);
    for (const handler of listeners) {
      try {
        handler(notification);
      } catch (error) {
        this.deps.log(`[tmux-client] notification handler failed: ${String(error)}`);
      }
    }
  }

  private protocolFailure(reason: string): void {
    if (this.process) this.dropConnection(this.process, `tmux control protocol: ${reason}`);
  }

  private dropConnection(child: ControlProcess, reason: string): void {
    this.connectionEnded(child, reason);
    child.kill();
  }

  private connectionEnded(child: ControlProcess, reason: string): void {
    if (this.stoppedProcess.has(child as object)) return;
    this.stoppedProcess.add(child as object);
    if (this.process !== child) return;
    this.process = undefined;
    this.buffer = '';
    const reply = this.reply;
    this.reply = undefined;
    const startup = this.startup;
    this.startup = undefined;
    if (startup) {
      this.deps.clearTimer(startup.timer);
      startup.reject(new ConnectionLostError(`tmux control connection lost during attach: ${reason}`));
    }
    if (reply) {
      this.deps.clearTimer(reply.timer);
      reply.reject(new ConnectionLostError(`tmux control connection lost: ${reason}`));
    }
    this.setState('fallback');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = BACKOFF_MS[Math.min(this.reconnectAttempt, BACKOFF_MS.length - 1)]!;
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.deps.setTimer(() => {
      this.reconnectTimer = undefined;
      void this.ensureConnected().catch(() => undefined);
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private followTmuxEnvironment(): void {
    if (!this.connectionEnvironment || this.connectionEnvironment === tmuxEnvironment()) return;
    if (this.reconnectTimer) {
      this.deps.clearTimer(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const child = this.process;
    if (child) {
      this.stoppedProcess.add(child as object);
      this.process = undefined;
      this.buffer = '';
      child.kill();
    }
    this.connectionEnvironment = '';
    this.reconnectAttempt = 0;
    this.setState('fallback');
  }

  private syncProcessRefs(): void {
    const child = this.process;
    if (!child) return;
    const method = this.activeRequests > 0 || this.startup ? 'ref' : 'unref';
    child[method]?.();
    child.stdin[method]?.();
    child.stdout[method]?.();
    child.stderr[method]?.();
  }

  private setState(state: ClientState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    if (state === 'up') {
      if (this.hasBeenUp) this.deps.log(`[tmux-client] ${state}`);
      this.hasBeenUp = true;
    } else if (this.hasBeenUp) {
      this.deps.log(`[tmux-client] ${state}`);
    }
  }
}

export const tmux: TmuxClient = new ControlTmuxClient();
