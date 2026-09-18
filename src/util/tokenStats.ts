import { DailyTokens, GetAccountTokenUsageResponse, TokenSource, TokenStats } from '../models/Usage';

/** `YYYY-MM-DD` for the given instant in the local time zone. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

type Summary = Partial<GetAccountTokenUsageResponse['summary']>;

/**
 * Builds display stats from daily buckets. Server-provided summary values win
 * over locally computed ones (the server sees usage from every device).
 */
export function buildTokenStats(
  source: TokenSource,
  buckets: DailyTokens[],
  today: string,
  summary: Summary = {}
): TokenStats {
  const byDate = new Map<string, number>();
  for (const b of buckets) {
    const tokens = Number(b.tokens) || 0;
    if (tokens > 0) byDate.set(b.startDate, (byDate.get(b.startDate) ?? 0) + tokens);
  }
  const daily = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([startDate, tokens]) => ({ startDate, tokens }));

  const weekStart = addDays(today, -6);
  let sum = 0;
  let peak = 0;
  let last7Days = 0;
  let longest = 0;
  let run = 0;
  let prev: string | undefined;
  for (const { startDate, tokens } of daily) {
    sum += tokens;
    peak = Math.max(peak, tokens);
    if (startDate >= weekStart && startDate <= today) last7Days += tokens;
    run = prev !== undefined && addDays(prev, 1) === startDate ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = startDate;
  }

  // A streak is still "current" if the last active day is today or yesterday.
  let current = 0;
  if (prev === today || prev === addDays(today, -1)) {
    let cursor = prev;
    while (byDate.has(cursor)) {
      current++;
      cursor = addDays(cursor, -1);
    }
  }

  const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
  return {
    source,
    today: byDate.get(today) ?? 0,
    last7Days,
    lifetime: num(summary.lifetimeTokens) ?? sum,
    peakDaily: num(summary.peakDailyTokens) ?? peak,
    currentStreakDays: num(summary.currentStreakDays) ?? current,
    longestStreakDays: num(summary.longestStreakDays) ?? longest,
    longestTurnSec: num(summary.longestRunningTurnSec),
    daily,
  };
}
