import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDurationMins, formatReset, planLabel, windowLabel } from '../util/format';

test('windowLabel derives names from windowDurationMins', () => {
  assert.equal(windowLabel(300, 'Primary'), 'Session (5h)');
  assert.equal(windowLabel(10080, 'Secondary'), 'Weekly (7d)');
  assert.equal(windowLabel(1440, 'x'), 'Daily (24h)');
  assert.equal(windowLabel(43200, 'x'), 'Monthly (30d)');
  assert.equal(windowLabel(90, 'x'), 'Session (1h 30m)');
  assert.equal(windowLabel(4320, 'x'), 'Window (3d)');
  assert.equal(windowLabel(null, 'Primary'), 'Primary');
});

test('formatDurationMins', () => {
  assert.equal(formatDurationMins(45), '45m');
  assert.equal(formatDurationMins(252), '4h 12m');
  assert.equal(formatDurationMins(120), '2h');
});

test('formatReset shows countdown within a day and a date beyond', () => {
  const now = Date.UTC(2026, 8, 18, 12, 0, 0);
  const sec = (ms: number) => Math.floor(ms / 1000);
  assert.equal(formatReset(sec(now + (4 * 60 + 12) * 60_000), now), 'Resets in 4h 12m');
  assert.equal(formatReset(sec(now - 1000), now), 'Resets now');
  assert.equal(formatReset(null, now), null);
  const far = formatReset(sec(now + 3 * 86_400_000), now, 'en-US');
  assert.match(far ?? '', /^Resets Sep 21/);
});

test('planLabel', () => {
  assert.equal(planLabel('plus'), 'ChatGPT Plus');
  assert.equal(planLabel('edu_pro'), 'ChatGPT Edu Pro');
  assert.equal(planLabel('some_new_plan'), 'ChatGPT Some New Plan');
  assert.equal(planLabel('unknown'), null);
});
