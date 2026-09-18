import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { InitializeResponse } from '../models/Account';

export interface Notification {
  method: string;
  params: unknown;
}

export class RpcError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(message);
    this.name = 'RpcError';
  }

  /** The server does not know this method (older Codex builds). */
  get isUnknownMethod(): boolean {
    return this.code === -32601 || /unknown variant|method not found/i.test(this.message);
  }
}

interface Pending {
  resolve(value: unknown): void;
  reject(err: Error): void;
  timer: NodeJS.Timeout;
}

export interface AppServerOptions {
  /** Resolved path or command name of the codex executable. */
  command: string;
  clientVersion: string;
  log(line: string): void;
  requestTimeoutMs?: number;
}

/**
 * Minimal client for `codex app-server`: newline-delimited JSON-RPC 2.0
 * (without the `jsonrpc` field) over the child's stdio.
 */
export class AppServerClient {
  private proc: ChildProcessWithoutNullStreams | undefined;
  private starting: Promise<InitializeResponse> | undefined;
  private readonly pending = new Map<number, Pending>();
  private readonly events = new EventEmitter();
  private nextId = 1;
  private stdoutBuffer = '';
  private stderrTail = '';

  constructor(private readonly options: AppServerOptions) {}

  onNotification(listener: (n: Notification) => void): () => void {
    this.events.on('notification', listener);
    return () => this.events.off('notification', listener);
  }

  /** Starts the server if needed; resolves with the `initialize` result. */
  start(): Promise<InitializeResponse> {
    if (!this.starting) {
      this.starting = this.spawnAndInitialize().catch((err) => {
        this.stop();
        throw err;
      });
    }
    return this.starting;
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    await this.start();
    return this.send<T>(method, params);
  }

  stop(): void {
    const proc = this.proc;
    this.proc = undefined;
    this.starting = undefined;
    this.stdoutBuffer = '';
    this.rejectAll(new Error('Codex App Server stopped'));
    if (proc && proc.exitCode === null) {
      proc.kill();
    }
  }

  private async spawnAndInitialize(): Promise<InitializeResponse> {
    const { command, log } = this.options;
    log(`Starting: ${command} app-server`);

    // npm installs `codex` as a .cmd/.ps1 shim on Windows, which needs a shell.
    const useShell = process.platform === 'win32' && !/\.exe$/i.test(command);
    const proc = useShell
      ? spawn(`"${command}" app-server`, { shell: true, windowsHide: true })
      : spawn(command, ['app-server'], { windowsHide: true });
    this.proc = proc;
    this.stderrTail = '';

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-2000);
      for (const line of chunk.split(/\r?\n/)) {
        if (line.trim()) log(`[stderr] ${line}`);
      }
    });

    const exited = new Promise<never>((_, reject) => {
      proc.on('error', (err) => {
        reject(new Error(`Could not start "${command}": ${err.message}`));
      });
      proc.on('exit', (code, signal) => {
        log(`App Server exited (code=${code}, signal=${signal})`);
        const detail = this.stderrTail.trim().split(/\r?\n/).slice(-3).join(' ');
        const err = new Error(
          `Codex App Server exited (code ${code ?? signal})${detail ? `: ${detail}` : ''}`
        );
        if (this.proc === proc) {
          this.proc = undefined;
          this.starting = undefined;
          this.rejectAll(err);
        }
        reject(err);
      });
    });
    // Avoid an unhandled rejection once initialization has succeeded.
    exited.catch(() => undefined);

    const init = await Promise.race([
      this.send<InitializeResponse>('initialize', {
        clientInfo: {
          name: 'codex_meter_vscode',
          title: 'Codex Meter (VS Code)',
          version: this.options.clientVersion,
        },
        // `account/usage/read` is gated behind the experimental API.
        capabilities: { experimentalApi: true },
      }),
      exited,
    ]);
    this.write({ method: 'initialized' });
    log(`Connected: ${init.userAgent} (CODEX_HOME=${init.codexHome})`);
    return init;
  }

  private send<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    const timeoutMs = this.options.requestTimeoutMs ?? 20_000;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      try {
        this.write(params === undefined ? { method, id } : { method, id, params });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err as Error);
      }
    });
  }

  private write(message: object): void {
    if (!this.proc || !this.proc.stdin.writable) {
      throw new Error('Codex App Server is not running');
    }
    this.proc.stdin.write(JSON.stringify(message) + '\n');
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newline: number;
    while ((newline = this.stdoutBuffer.indexOf('\n')) >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.onMessage(line);
    }
  }

  private onMessage(line: string): void {
    let msg: {
      id?: number | string;
      method?: string;
      params?: unknown;
      result?: unknown;
      error?: { code: number; message: string; data?: unknown };
    };
    try {
      msg = JSON.parse(line);
    } catch {
      this.options.log(`[invalid json] ${line.slice(0, 200)}`);
      return;
    }

    if (msg.method !== undefined && msg.id !== undefined) {
      // Server → client request (approvals etc.). We never start threads, so decline.
      this.write({ id: msg.id, error: { code: -32601, message: 'Not supported by Codex Meter' } });
      return;
    }
    if (msg.method !== undefined) {
      this.events.emit('notification', { method: msg.method, params: msg.params });
      return;
    }

    const pending = typeof msg.id === 'number' ? this.pending.get(msg.id) : undefined;
    if (!pending) return;
    this.pending.delete(msg.id as number);
    clearTimeout(pending.timer);
    if (msg.error) {
      pending.reject(new RpcError(msg.error.code, msg.error.message, msg.error.data));
    } else {
      pending.resolve(msg.result);
    }
  }

  private rejectAll(err: Error): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
  }
}
