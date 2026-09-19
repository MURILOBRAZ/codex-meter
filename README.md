# Codex Meter

**English** · [Português](README.pt-BR.md)

See your Codex account, quota and token usage in the VS Code Activity Bar.

> **Unofficial.** Codex Meter is a community extension. It is not made, endorsed or supported by OpenAI. "Codex" and "ChatGPT" are trademarks of OpenAI. You need the Codex CLI or the official OpenAI Codex extension installed and signed in.

```
▼ CODEX METER: ACCOUNT & USAGE

  ACCOUNT
  you@example.com
  ChatGPT Plus

  USAGE
  Session (5h)                  7%
  ██░░░░░░░░░░░░░░░░░░
  Resets in 4h 36m

  Weekly (7d)                  60%
  ████████████░░░░░░░░
  Resets Sep 20, 18:04

  TOKENS
  Today                 22,534,095
  Last 7 days          111,060,238
  Lifetime           2,960,568,309
  Peak day             180,528,767
  Streak                10d (best 12d)
  ▁▂▁▅▃▇▂▁▃▄▆▂▅█  (last 14 days)

  Last updated: 16:27     ↻ Refresh
```

The data comes from the official **Codex App Server**, the JSON-RPC interface the Codex IDE extension also uses. The extension never reads `~/.codex/auth.json` and never calls private ChatGPT endpoints.

## How it works

The extension starts `codex app-server` as a child process and sends newline-delimited JSON-RPC over stdio:

| Method | Used for |
| --- | --- |
| `initialize` / `initialized` | Handshake (with `experimentalApi: true`) |
| `account/read` | Email and plan |
| `account/rateLimits/read` | `usedPercent`, `windowDurationMins` and `resetsAt` for each quota window |
| `account/usage/read` | Lifetime tokens, daily buckets, streaks and peak day |
| `account/rateLimits/updated` (notification) | Live quota updates between polls |
| `account/updated` (notification) | Triggers a refresh after login or logout |

Details:

- **Window labels come from `windowDurationMins`.** `300` shows as *Session (5h)* and `10080` as *Weekly (7d)*. If OpenAI changes the windows, the labels follow automatically.
- **Quota and tokens are shown separately.** How much of your quota a request uses depends on the model, the context, the reasoning and the tools involved. It is not a token count.
- **Older Codex builds without `account/usage/read`** (such as 0.118) fall back to summing `token_count` events from `$CODEX_HOME/sessions/**/*.jsonl`. These numbers only cover this machine and the panel labels them as estimates.

### Which `codex` binary is used

1. `codexMeter.codexPath`, if set.
2. The binary bundled with the official **OpenAI Codex** VS Code extension (`openai.chatgpt`), if installed. This is usually the newest build.
3. `codex` from your `PATH`.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `codexMeter.codexPath` | `""` | Path to the `codex` executable |
| `codexMeter.refreshIntervalSeconds` | `120` | Polling interval (minimum 30) |
| `codexMeter.display` | `used` | Whether bars show `used` or `remaining` percentage |
| `codexMeter.statusBar` | `true` | Shows `5% · 60%` in the status bar |
| `codexMeter.localTokenFallback` | `true` | Uses local session logs when `account/usage/read` is unavailable |

Commands: **Codex Meter: Refresh**, **Restart Codex App Server**, **Show Log** and **Open Settings**.

## Development

```bash
npm install
npm test          # compile + unit tests (node:test)
# F5 in VS Code → "Run Extension"
npm run package   # builds codex-meter-<version>.vsix
```

```
src/
├─ extension.ts            activation, commands, config wiring
├─ UsageController.ts      owns the App Server connection, polling, notifications
├─ codex/
│  ├─ AppServerClient.ts   JSON-RPC over stdio (spawn, framing, timeouts, restart)
│  ├─ AccountService.ts    account/read
│  ├─ UsageService.ts      account/rateLimits/read, account/usage/read (+ fallback)
│  ├─ LocalSessionUsage.ts token estimate from rollout logs
│  └─ resolveCodex.ts      picks the codex executable
├─ views/
│  ├─ UsageViewProvider.ts WebviewViewProvider (CSP + nonce)
│  ├─ StatusBar.ts
│  └─ viewState.ts         pure data → display strings (unit-tested)
├─ models/                 wire types from `codex app-server generate-ts`
└─ util/                   formatting, token stats
media/                     webview script, theme-aware CSS, activity bar icon
```

To check the protocol types against your installed Codex, run `codex app-server generate-ts --out ./schema`.
