import * as vscode from 'vscode';
import { AccountService } from './codex/AccountService';
import { AppServerClient, Notification } from './codex/AppServerClient';
import { resolveCodexCommand } from './codex/resolveCodex';
import { mergeRateLimits, UsageService } from './codex/UsageService';
import { AccountRateLimitsUpdatedNotification } from './models/Usage';
import { DisplayMode, UsageData } from './views/viewState';

export interface Settings {
  codexPath: string;
  refreshIntervalSeconds: number;
  display: DisplayMode;
  statusBar: boolean;
  localTokenFallback: boolean;
}

export function readSettings(): Settings {
  const c = vscode.workspace.getConfiguration('codexMeter');
  return {
    codexPath: c.get('codexPath', ''),
    refreshIntervalSeconds: Math.max(30, c.get('refreshIntervalSeconds', 120)),
    display: c.get<DisplayMode>('display', 'used'),
    statusBar: c.get('statusBar', true),
    localTokenFallback: c.get('localTokenFallback', true),
  };
}

/** Owns the App Server connection and the latest usage data. */
export class UsageController implements vscode.Disposable {
  private client!: AppServerClient;
  private accounts!: AccountService;
  private usage!: UsageService;
  private unsubscribe: (() => void) | undefined;
  private timer: NodeJS.Timeout | undefined;
  private inflight: Promise<void> | undefined;
  private readonly changed = new vscode.EventEmitter<void>();

  data: UsageData | null = null;
  refreshing = false;
  readonly onDidChange = this.changed.event;

  constructor(private readonly version: string, private readonly log: vscode.OutputChannel) {
    this.connect();
    this.schedule();
  }

  refresh(): Promise<void> {
    this.inflight ??= this.doRefresh().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  async restart(): Promise<void> {
    await this.inflight?.catch(() => undefined);
    this.disconnect();
    this.connect();
    await this.refresh();
  }

  /** Re-reads settings; restarts the server only if the executable changed. */
  async reconfigure(previous: Settings): Promise<void> {
    const next = readSettings();
    this.schedule();
    if (next.codexPath !== previous.codexPath) {
      await this.restart();
    } else {
      this.changed.fire();
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.disconnect();
    this.changed.dispose();
  }

  private connect(): void {
    const command = resolveCodexCommand(readSettings().codexPath);
    this.client = new AppServerClient({
      command,
      clientVersion: this.version,
      log: (line) => this.log.appendLine(`[${new Date().toISOString()}] ${line}`),
    });
    this.accounts = new AccountService(this.client);
    this.usage = new UsageService(this.client);
    this.unsubscribe = this.client.onNotification((n) => this.onNotification(n));
  }

  private disconnect(): void {
    this.unsubscribe?.();
    this.client.stop();
  }

  private schedule(): void {
    if (this.timer) clearInterval(this.timer);
    const ms = readSettings().refreshIntervalSeconds * 1000;
    this.timer = setInterval(() => void this.refresh(), ms);
  }

  private onNotification(n: Notification): void {
    if (n.method === 'account/rateLimits/updated' && this.data) {
      const { rateLimits } = n.params as AccountRateLimitsUpdatedNotification;
      this.data = {
        ...this.data,
        rateLimits: mergeRateLimits(this.data.rateLimits, rateLimits),
        updatedAt: Date.now(),
      };
      this.changed.fire();
    } else if (n.method === 'account/updated' || n.method === 'account/login/completed') {
      void this.refresh();
    }
  }

  private async doRefresh(): Promise<void> {
    this.refreshing = true;
    this.changed.fire();
    const settings = readSettings();
    const prev = this.data;
    try {
      let codexHome: string;
      try {
        codexHome = (await this.client.start()).codexHome;
      } catch (err) {
        this.data = {
          account: prev?.account ?? null,
          rateLimits: prev?.rateLimits ?? [],
          tokens: prev?.tokens ?? null,
          errors: [startErrorMessage(err)],
          updatedAt: prev?.updatedAt ?? null,
        };
        return;
      }

      // Quota is what people look at; show it before the (possibly slow) token scan.
      const [account, limits] = await Promise.allSettled([
        this.accounts.read(),
        this.usage.readRateLimits(),
      ]);
      const signedOut =
        account.status === 'fulfilled' && account.value.kind === 'none' && account.value.requiresAuth;
      const errors: string[] = [];
      if (account.status === 'rejected') errors.push(`Account: ${message(account.reason)}`);
      if (limits.status === 'rejected' && !signedOut) {
        errors.push(`Rate limits: ${message(limits.reason)}`);
      }
      this.data = {
        account: account.status === 'fulfilled' ? account.value : prev?.account ?? null,
        rateLimits: limits.status === 'fulfilled' ? limits.value : prev?.rateLimits ?? [],
        tokens: prev?.tokens ?? null,
        errors,
        updatedAt: Date.now(),
      };
      this.changed.fire();

      if (signedOut) return;
      try {
        const tokens = await this.usage.readTokens(codexHome, settings.localTokenFallback);
        this.data = { ...this.data, tokens };
      } catch (err) {
        this.data = { ...this.data, errors: [...errors, `Tokens: ${message(err)}`] };
      }
    } finally {
      this.refreshing = false;
      this.changed.fire();
    }
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function startErrorMessage(err: unknown): string {
  const text = message(err);
  if (/ENOENT|not recognized|not found/i.test(text)) {
    return 'Codex CLI not found. Install it (npm i -g @openai/codex), install the OpenAI Codex extension, or set "codexMeter.codexPath".';
  }
  return text;
}
