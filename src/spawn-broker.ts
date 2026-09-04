import { execFile as nodeExecFile, fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CHILD_ARG = '--ronin-spawn-broker-child';

export interface SpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  maxBuffer?: number;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
}

interface Request {
  id: number;
  file: string;
  args: string[];
  options: SpawnOptions;
}

interface Response extends SpawnResult {
  id: number;
  error?: {
    message: string;
    code?: string | number;
    signal?: NodeJS.Signals;
    killed?: boolean;
  };
}

type Pending = {
  broker: ChildProcess;
  resolve: (result: SpawnResult) => void;
  reject: (error: SpawnBrokerError) => void;
};

export class SpawnBrokerError extends Error {
  code?: string | number;
  signal?: NodeJS.Signals;
  killed?: boolean;
  stdout: string;
  stderr: string;

  constructor(message: string, response: Partial<Response> = {}) {
    super(message);
    this.name = 'SpawnBrokerError';
    this.code = response.error?.code;
    this.signal = response.error?.signal;
    this.killed = response.error?.killed;
    this.stdout = response.stdout ?? '';
    this.stderr = response.stderr ?? '';
  }
}

let child: ChildProcess | null = null;
let sequence = 0;
const pending = new Map<number, Pending>();

function releaseWhenIdle(broker: ChildProcess): void {
  if (pending.size) return;
  broker.unref();
  broker.channel?.unref();
}

function rejectPending(message: string, broker?: ChildProcess): void {
  for (const [id, request] of pending) {
    if (broker && request.broker !== broker) continue;
    pending.delete(id);
    request.reject(new SpawnBrokerError(message));
  }
}

function makeChild(): ChildProcess {
  const broker = fork(fileURLToPath(import.meta.url), [CHILD_ARG], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  broker.unref();
  broker.channel?.unref();
  child = broker;
  broker.on('message', (raw: Response) => {
    const request = pending.get(raw.id);
    if (!request) return;
    pending.delete(raw.id);
    if (raw.error) request.reject(new SpawnBrokerError(raw.error.message, raw));
    else request.resolve({ stdout: raw.stdout, stderr: raw.stderr });
    releaseWhenIdle(broker);
  });
  broker.once('error', (error) => {
    if (child === broker) child = null;
    rejectPending(`spawn broker failed: ${error.message}`, broker);
  });
  broker.once('exit', (code, signal) => {
    if (child === broker) child = null;
    rejectPending(`spawn broker exited${signal ? ` on ${signal}` : ` with code ${code ?? 'unknown'}`}`, broker);
  });
  return broker;
}

export function startSpawnBroker(): void {
  if (!child?.connected) makeChild();
}

export function spawnBrokerPid(): number | undefined {
  return child?.pid;
}

export function stopSpawnBroker(): void {
  const broker = child;
  child = null;
  rejectPending('spawn broker stopped');
  if (broker?.connected) broker.disconnect();
  if (broker && broker.exitCode === null && broker.signalCode === null) broker.kill();
}

export function execFile(file: string, args: readonly string[] = [], options: SpawnOptions = {}): Promise<SpawnResult> {
  const broker = child?.connected ? child : makeChild();
  broker.ref();
  broker.channel?.ref();
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { broker, resolve, reject });
    broker.send({ id, file, args: [...args], options } satisfies Request, (error) => {
      if (!error) return;
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      request.reject(new SpawnBrokerError(`could not ask spawn broker: ${error.message}`));
      releaseWhenIdle(broker);
    });
  });
}

function serveRequest(request: Request): void {
  nodeExecFile(request.file, request.args, { ...request.options, encoding: 'utf8' }, (error, stdout, stderr) => {
    const response: Response = { id: request.id, stdout, stderr };
    if (error) {
      const detail = error as NodeJS.ErrnoException & { signal?: NodeJS.Signals; killed?: boolean };
      response.error = {
        message: error.message,
        code: detail.code,
        signal: detail.signal,
        killed: detail.killed,
      };
    }
    process.send?.(response);
  });
}

if (process.argv.includes(CHILD_ARG)) {
  process.on('message', (raw: Request) => serveRequest(raw));
  process.on('disconnect', () => process.exit(0));
}
