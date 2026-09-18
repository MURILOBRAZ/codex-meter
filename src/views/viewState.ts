import { AccountInfo } from '../models/Account';
import { RateLimitSnapshot, RateLimitWindow, TokenStats } from '../models/Usage';
import {
  clampPercent,
  formatClock,
  formatCompact,
  formatNumber,
  formatReset,
  formatSeconds,
  planLabel,
  windowLabel,
} from '../util/format';
import { addDays, localDateKey } from '../util/tokenStats';

export type DisplayMode = 'used' | 'remaining';
export type Level = 'ok' | 'warn' | 'crit';

/** Everything the webview renders; plain strings so the webview stays dumb. */
export interface ViewState {
  phase: 'loading' | 'ready' | 'error';
  refreshing: boolean;
  signedOut: boolean;
  account: { primary: string; secondary: string | null } | null;
  quotaGroups: QuotaGroupView[];
  displayMode: DisplayMode;
  tokens: TokensView | null;
  errors: string[];
  updatedText: string | null;
}

export interface QuotaGroupView {
  title: string | null;
  windows: QuotaWindowView[];
  creditsText: string | null;
}

export interface QuotaWindowView {
  label: string;
  /** Percentage shown to the user (used or remaining, per setting). */
  percent: number;
  percentText: string;
  level: Level;
  resetText: string | null;
}

export interface TokensView {
  rows: { label: string; value: string }[];
  chart: { date: string; tokens: number; ratio: number; title: string; isToday: boolean }[];
  sourceNote: string | null;
}

export interface UsageData {
  account: AccountInfo | null;
  rateLimits: RateLimitSnapshot[];
  tokens: TokenStats | null;
  errors: string[];
  updatedAt: number | null;
}

export interface BuildOptions {
  now: number;
  locale?: string;
  displayMode: DisplayMode;
  refreshing: boolean;
  chartDays?: number;
}

export function buildViewState(data: UsageData | null, opts: BuildOptions): ViewState {
  if (!data) {
    return {
      phase: 'loading',
      refreshing: opts.refreshing,
      signedOut: false,
      account: null,
      quotaGroups: [],
      displayMode: opts.displayMode,
      tokens: null,
      errors: [],
      updatedText: null,
    };
  }

  const hasContent = !!data.account || data.rateLimits.length > 0 || !!data.tokens;
  const signedOut = !!data.account && data.account.kind === 'none' && data.account.requiresAuth;
  return {
    phase: hasContent ? 'ready' : 'error',
    refreshing: opts.refreshing,
    signedOut,
    account: accountView(data.account),
    quotaGroups: signedOut
      ? []
      : data.rateLimits.map((s) => quotaGroupView(s, data.rateLimits.length > 1, opts)),
    displayMode: opts.displayMode,
    tokens: data.tokens ? tokensView(data.tokens, opts) : null,
    errors: data.errors,
    updatedText: data.updatedAt ? formatClock(data.updatedAt, opts.locale) : null,
  };
}

function accountView(account: AccountInfo | null): ViewState['account'] {
  if (!account) return null;
  switch (account.kind) {
    case 'chatgpt':
      return { primary: account.email ?? 'ChatGPT account', secondary: planLabel(account.planType) };
    case 'apiKey':
      return { primary: 'API key', secondary: 'Usage is billed per token; no plan quota' };
    case 'amazonBedrock':
      return { primary: 'Amazon Bedrock', secondary: null };
    default:
      return { primary: 'Not signed in', secondary: 'Run `codex login` in a terminal' };
  }
}

function quotaGroupView(
  snapshot: RateLimitSnapshot,
  showTitle: boolean,
  opts: BuildOptions
): QuotaGroupView {
  const windows: QuotaWindowView[] = [];
  const add = (w: RateLimitWindow | null, fallback: string) => {
    if (w) windows.push(windowView(w, fallback, opts));
  };
  add(snapshot.primary, 'Primary');
  add(snapshot.secondary, 'Secondary');

  let creditsText: string | null = null;
  const credits = snapshot.credits;
  if (credits?.unlimited) creditsText = 'Unlimited credits';
  else if (credits?.hasCredits && credits.balance) creditsText = `Credits: ${credits.balance}`;

  return {
    title: showTitle ? snapshot.limitName ?? snapshot.limitId : null,
    windows,
    creditsText,
  };
}

function windowView(w: RateLimitWindow, fallback: string, opts: BuildOptions): QuotaWindowView {
  const used = clampPercent(w.usedPercent);
  const percent = opts.displayMode === 'used' ? used : 100 - used;
  return {
    label: windowLabel(w.windowDurationMins, fallback),
    percent,
    percentText: `${Math.round(percent)}%${opts.displayMode === 'remaining' ? ' left' : ''}`,
    level: used >= 90 ? 'crit' : used >= 75 ? 'warn' : 'ok',
    resetText: formatReset(w.resetsAt, opts.now, opts.locale),
  };
}

function tokensView(t: TokenStats, opts: BuildOptions): TokensView {
  const n = (v: number) => formatNumber(v, opts.locale);
  const rows = [
    { label: 'Today', value: n(t.today) },
    { label: 'Last 7 days', value: n(t.last7Days) },
    { label: 'Lifetime', value: n(t.lifetime) },
    { label: 'Peak day', value: n(t.peakDaily) },
    {
      label: 'Streak',
      value: `${t.currentStreakDays}d (best ${t.longestStreakDays}d)`,
    },
  ];
  if (t.longestTurnSec) rows.push({ label: 'Longest turn', value: formatSeconds(t.longestTurnSec) });

  const today = localDateKey(new Date(opts.now));
  const days = opts.chartDays ?? 14;
  const byDate = new Map(t.daily.map((d) => [d.startDate, d.tokens]));
  const series = Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - days + 1);
    return { date, tokens: byDate.get(date) ?? 0 };
  });
  const max = Math.max(1, ...series.map((d) => d.tokens));
  const chart = series.map((d) => ({
    ...d,
    ratio: d.tokens / max,
    title: `${d.date}: ${formatCompact(d.tokens, opts.locale)} tokens`,
    isToday: d.date === today,
  }));

  return {
    rows,
    chart,
    sourceNote:
      t.source === 'local-sessions'
        ? 'Estimated from local session logs (this machine only). Update Codex for account-wide totals.'
        : null,
  };
}
