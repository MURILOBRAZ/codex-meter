import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { DailyTokens } from '../models/Usage';
import { localDateKey } from '../util/tokenStats';

interface FileEntry {
  mtimeMs: number;
  size: number;
  daily: Map<string, number>;
}

/**
 * Fallback for Codex builds without `account/usage/read`: sums `token_count`
 * events from the rollout logs in `$CODEX_HOME/sessions` (this machine only).
 * Parsed files are cached by mtime/size so refreshes only re-read active logs.
 */
export class LocalSessionUsage {
  private readonly cache = new Map<string, FileEntry>();

  async readDaily(codexHome: string): Promise<DailyTokens[]> {
    const files = [
      ...(await listJsonl(path.join(codexHome, 'sessions'))),
      ...(await listJsonl(path.join(codexHome, 'archived_sessions'))),
    ];

    const seen = new Set<string>();
    const totals = new Map<string, number>();
    for (const file of files) {
      // A session moved to archived_sessions keeps its file name.
      const id = path.basename(file);
      if (seen.has(id)) continue;
      seen.add(id);

      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(file);
      } catch {
        continue;
      }
      let entry = this.cache.get(file);
      if (!entry || entry.mtimeMs !== stat.mtimeMs || entry.size !== stat.size) {
        entry = { mtimeMs: stat.mtimeMs, size: stat.size, daily: await parseRollout(file) };
        this.cache.set(file, entry);
      }
      for (const [date, tokens] of entry.daily) {
        totals.set(date, (totals.get(date) ?? 0) + tokens);
      }
    }
    return [...totals.entries()].map(([startDate, tokens]) => ({ startDate, tokens }));
  }
}

async function listJsonl(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listJsonl(full)));
    else if (entry.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

/** Per-day tokens for one rollout, from deltas of the cumulative session total. */
export async function parseRollout(file: string): Promise<Map<string, number>> {
  const daily = new Map<string, number>();
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let previousTotal = 0;
  for await (const line of rl) {
    if (!line.includes('"token_count"')) continue;
    let event: {
      timestamp?: string;
      payload?: {
        type?: string;
        info?: {
          total_token_usage?: { total_tokens?: number };
          last_token_usage?: { total_tokens?: number };
        } | null;
      };
    };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const info = event.payload?.type === 'token_count' ? event.payload.info : undefined;
    const total = info?.total_token_usage?.total_tokens;
    if (typeof total !== 'number' || !event.timestamp) continue;

    // Cumulative totals repeat across duplicate events; only count growth.
    // A drop means the counter was reset (e.g. resumed session), so fall back
    // to the last turn's usage.
    const delta =
      total >= previousTotal ? total - previousTotal : info?.last_token_usage?.total_tokens ?? total;
    previousTotal = total;
    if (delta <= 0) continue;

    const date = localDateKey(new Date(event.timestamp));
    daily.set(date, (daily.get(date) ?? 0) + delta);
  }
  return daily;
}
