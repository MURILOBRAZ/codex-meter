import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { parseRollout } from '../codex/LocalSessionUsage';
import { mergeRateLimits } from '../codex/UsageService';
import { RateLimitSnapshot } from '../models/Usage';
import { buildTokenStats, localDateKey } from '../util/tokenStats';
import { buildViewState } from '../views/viewState';

test('buildTokenStats computes totals and streaks', () => {
  const stats = buildTokenStats(
    'local-sessions',
    [
      { startDate: '2026-09-10', tokens: 50 },
      { startDate: '2026-09-16', tokens: 100 },
      { startDate: '2026-09-17', tokens: 200 },
      { startDate: '2026-09-18', tokens: 300 },
      { startDate: '2026-09-18', tokens: 5 },
    ],
    '2026-09-18'
  );
  assert.equal(stats.today, 305);
  assert.equal(stats.last7Days, 605);
  assert.equal(stats.lifetime, 655);
  assert.equal(stats.peakDaily, 305);
  assert.equal(stats.currentStreakDays, 3);
  assert.equal(stats.longestStreakDays, 3);
});

test('buildTokenStats prefers the server summary', () => {
  const stats = buildTokenStats('app-server', [{ startDate: '2026-09-17', tokens: 10 }], '2026-09-18', {
    lifetimeTokens: 999,
    currentStreakDays: 8,
  });
  assert.equal(stats.lifetime, 999);
  assert.equal(stats.currentStreakDays, 8);
  assert.equal(stats.today, 0);
});

test('parseRollout counts cumulative growth once per day', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-meter-')), 'r.jsonl');
  const event = (ts: string, total: number, last: number) =>
    JSON.stringify({
      timestamp: ts,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { total_tokens: total }, last_token_usage: { total_tokens: last } },
      },
    });
  fs.writeFileSync(
    file,
    [
      JSON.stringify({ timestamp: '2026-09-18T12:00:00Z', type: 'session_meta', payload: {} }),
      event('2026-09-18T12:00:01Z', 100, 100),
      event('2026-09-18T12:00:02Z', 100, 100), // duplicate snapshot
      event('2026-09-18T12:00:03Z', 250, 150),
      JSON.stringify({ timestamp: '2026-09-18T12:00:04Z', type: 'event_msg', payload: { type: 'token_count', info: null } }),
    ].join('\n')
  );
  const daily = await parseRollout(file);
  assert.equal(daily.get(localDateKey(new Date('2026-09-18T12:00:01Z'))), 250);
});

test('mergeRateLimits keeps fields a sparse update omits', () => {
  const base: RateLimitSnapshot = {
    limitId: 'codex',
    limitName: null,
    primary: { usedPercent: 5, windowDurationMins: 300, resetsAt: 1 },
    secondary: { usedPercent: 30, windowDurationMins: 10080, resetsAt: 2 },
    credits: null,
    planType: 'plus',
  };
  const merged = mergeRateLimits([base], {
    ...base,
    primary: { usedPercent: 9, windowDurationMins: 300, resetsAt: 1 },
    secondary: null,
    planType: null,
  });
  assert.equal(merged[0].primary?.usedPercent, 9);
  assert.equal(merged[0].secondary?.usedPercent, 30);
  assert.equal(merged[0].planType, 'plus');
});

test('buildViewState renders remaining mode and warning levels', () => {
  const now = Date.UTC(2026, 8, 18, 12);
  const state = buildViewState(
    {
      account: { kind: 'chatgpt', email: 'a@b.c', planType: 'plus', requiresAuth: true },
      rateLimits: [
        {
          limitId: 'codex',
          limitName: null,
          primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: now / 1000 + 3600 },
          secondary: { usedPercent: 80, windowDurationMins: 10080, resetsAt: null },
          credits: null,
          planType: 'plus',
        },
      ],
      tokens: null,
      errors: [],
      updatedAt: now,
    },
    { now, displayMode: 'remaining', refreshing: false, locale: 'en-US' }
  );
  assert.deepEqual(state.account, { primary: 'a@b.c', secondary: 'ChatGPT Plus' });
  const [session, weekly] = state.quotaGroups[0].windows;
  assert.equal(session.label, 'Session (5h)');
  assert.equal(session.percentText, '75% left');
  assert.equal(session.resetText, 'Resets in 1h');
  assert.equal(weekly.level, 'warn');
  assert.equal(state.quotaGroups[0].title, null);
});
