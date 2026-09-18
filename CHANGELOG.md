# Changelog

## 0.1.0

First release.

- Activity Bar panel with the signed-in account (email and plan), quota windows (labels come from `windowDurationMins`) and reset times.
- Token stats from `account/usage/read`: today, last 7 days, lifetime, peak day, streaks and a 14-day chart.
- Token estimate from local session logs on Codex builds without `account/usage/read`.
- Live quota updates through `account/rateLimits/updated`, plus polling at a configurable interval.
- Status bar indicator that turns amber at 75% and red at 90%.
- Uses the Codex binary bundled with the official OpenAI extension when available.
