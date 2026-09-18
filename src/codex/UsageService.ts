import {
  GetAccountRateLimitsResponse,
  GetAccountTokenUsageResponse,
  RateLimitSnapshot,
  TokenStats,
} from '../models/Usage';
import { buildTokenStats, localDateKey } from '../util/tokenStats';
import { AppServerClient, RpcError } from './AppServerClient';
import { LocalSessionUsage } from './LocalSessionUsage';

export class UsageService {
  /** Flipped off once the server says it doesn't know `account/usage/read`. */
  private usageReadSupported = true;
  private readonly local = new LocalSessionUsage();

  constructor(private readonly client: AppServerClient) {}

  /** Call after (re)starting the server, which may be a different Codex build. */
  resetCapabilities(): void {
    this.usageReadSupported = true;
  }

  /** All metered buckets, the main `codex` bucket first. */
  async readRateLimits(): Promise<RateLimitSnapshot[]> {
    const res = await this.client.request<GetAccountRateLimitsResponse>('account/rateLimits/read');
    const byId = Object.values(res.rateLimitsByLimitId ?? {}).filter(
      (s): s is RateLimitSnapshot => !!s
    );
    const snapshots = byId.length > 0 ? byId : [res.rateLimits];
    return snapshots.sort((a, b) => rank(a) - rank(b));
  }

  async readTokens(codexHome: string, allowLocalFallback: boolean): Promise<TokenStats | null> {
    const today = localDateKey(new Date());
    if (this.usageReadSupported) {
      try {
        const res = await this.client.request<GetAccountTokenUsageResponse>('account/usage/read');
        return buildTokenStats('app-server', res.dailyUsageBuckets ?? [], today, res.summary);
      } catch (err) {
        if (!(err instanceof RpcError && err.isUnknownMethod)) throw err;
        this.usageReadSupported = false;
      }
    }
    if (!allowLocalFallback) return null;
    const daily = await this.local.readDaily(codexHome);
    return buildTokenStats('local-sessions', daily, today);
  }
}

function rank(s: RateLimitSnapshot): number {
  return s.limitId === 'codex' || s.limitId === null ? 0 : 1;
}

/** Merges a pushed `account/rateLimits/updated` snapshot into the current list. */
export function mergeRateLimits(
  current: RateLimitSnapshot[],
  update: RateLimitSnapshot
): RateLimitSnapshot[] {
  const index = current.findIndex((s) => s.limitId === update.limitId);
  if (index < 0) return [...current, update].sort((a, b) => rank(a) - rank(b));
  const next = current.slice();
  // Notifications may be sparse; keep fields the update omits.
  const prev = next[index];
  next[index] = {
    ...prev,
    ...update,
    primary: update.primary ?? prev.primary,
    secondary: update.secondary ?? prev.secondary,
    credits: update.credits ?? prev.credits,
    planType: update.planType ?? prev.planType,
  };
  return next;
}
