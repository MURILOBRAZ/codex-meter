// Wire types mirror `codex app-server generate-ts` (v2 protocol).

export interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  /** Unix seconds. */
  resetsAt: number | null;
}

export interface CreditsSnapshot {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
}

export interface RateLimitSnapshot {
  limitId: string | null;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  credits: CreditsSnapshot | null;
  planType: string | null;
}

export interface GetAccountRateLimitsResponse {
  rateLimits: RateLimitSnapshot;
  rateLimitsByLimitId: { [limitId: string]: RateLimitSnapshot | undefined } | null;
}

export interface AccountRateLimitsUpdatedNotification {
  rateLimits: RateLimitSnapshot;
}

export interface GetAccountTokenUsageResponse {
  summary: {
    lifetimeTokens: number | null;
    peakDailyTokens: number | null;
    longestRunningTurnSec: number | null;
    currentStreakDays: number | null;
    longestStreakDays: number | null;
  };
  dailyUsageBuckets: DailyTokens[] | null;
}

export interface DailyTokens {
  /** Local calendar date, `YYYY-MM-DD`. */
  startDate: string;
  tokens: number;
}

export type TokenSource = 'app-server' | 'local-sessions';

export interface TokenStats {
  source: TokenSource;
  today: number;
  last7Days: number;
  lifetime: number;
  peakDaily: number;
  currentStreakDays: number;
  longestStreakDays: number;
  longestTurnSec: number | null;
  /** Sorted ascending by date; only days with activity. */
  daily: DailyTokens[];
}
