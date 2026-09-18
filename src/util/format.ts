const MIN_PER_DAY = 1440;
const MIN_PER_WEEK = 7 * MIN_PER_DAY;

/** "5h", "1h 30m", "45m", "7d". */
export function formatDurationMins(mins: number): string {
  if (mins >= MIN_PER_DAY && mins % MIN_PER_DAY === 0) return `${mins / MIN_PER_DAY}d`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Names a quota window from its length instead of assuming 5h/weekly, so a
 * plan with different windows still gets sensible labels.
 */
export function windowLabel(mins: number | null, fallback: string): string {
  if (mins === null || !Number.isFinite(mins) || mins <= 0) return fallback;
  const dur = formatDurationMins(mins);
  if (mins === MIN_PER_WEEK) return `Weekly (${dur})`;
  if (mins === MIN_PER_DAY) return `Daily (24h)`;
  if (mins >= 28 * MIN_PER_DAY && mins <= 31 * MIN_PER_DAY) return `Monthly (${dur})`;
  if (mins < MIN_PER_DAY) return `Session (${dur})`;
  return `Window (${dur})`;
}

/** "Resets in 4h 12m" within a day, otherwise "Resets Sep 21, 14:30". */
export function formatReset(resetsAtSec: number | null, nowMs: number, locale?: string): string | null {
  if (resetsAtSec === null || !Number.isFinite(resetsAtSec)) return null;
  const diffMs = resetsAtSec * 1000 - nowMs;
  if (diffMs <= 0) return 'Resets now';
  const diffMins = Math.ceil(diffMs / 60_000);
  if (diffMins < MIN_PER_DAY) return `Resets in ${formatDurationMins(diffMins)}`;
  const when = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(resetsAtSec * 1000));
  return `Resets ${when}`;
}

export function formatNumber(n: number, locale?: string): string {
  return new Intl.NumberFormat(locale).format(Math.round(n));
}

export function formatCompact(n: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function formatClock(ms: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

/** "2h 3m" / "45s" for a duration in seconds. */
export function formatSeconds(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  return formatDurationMins(Math.round(sec / 60));
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro',
  prolite: 'Pro Lite',
  team: 'Team',
  business: 'Business',
  self_serve_business_usage_based: 'Business',
  self_serve_business_prolite: 'Business',
  enterprise: 'Enterprise',
  enterprise_cbp_usage_based: 'Enterprise',
  enterprise_cbp_automation: 'Enterprise',
  ent26: 'Enterprise',
  edu: 'Edu',
  edu_plus: 'Edu Plus',
  edu_pro: 'Edu Pro',
};

export function planLabel(planType: string | null): string | null {
  if (!planType || planType === 'unknown') return null;
  const name =
    PLAN_LABELS[planType] ??
    planType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return `ChatGPT ${name}`;
}

export function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(100, Math.max(0, p));
}
