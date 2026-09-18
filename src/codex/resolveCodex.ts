import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const OPENAI_EXTENSION_ID = 'openai.chatgpt';

/**
 * Picks the codex executable: explicit setting → binary bundled with the
 * official OpenAI extension (same version the IDE integration uses) → PATH.
 */
export function resolveCodexCommand(configuredPath: string): string {
  if (configuredPath.trim()) {
    return configuredPath.trim();
  }
  const bundled = findBundledCodex();
  return bundled ?? 'codex';
}

function findBundledCodex(): string | undefined {
  const ext = vscode.extensions.getExtension(OPENAI_EXTENSION_ID);
  if (!ext) return undefined;

  const binDir = path.join(ext.extensionPath, 'bin');
  let dirs: string[];
  try {
    dirs = fs.readdirSync(binDir);
  } catch {
    return undefined;
  }

  const osNames: Record<string, string[]> = {
    win32: ['windows', 'win32'],
    darwin: ['macos', 'darwin', 'apple'],
    linux: ['linux'],
  };
  const archNames: Record<string, string[]> = {
    x64: ['x86_64', 'x64', 'amd64'],
    arm64: ['aarch64', 'arm64'],
  };
  const osMatch = osNames[process.platform] ?? [process.platform];
  const archMatch = archNames[process.arch] ?? [process.arch];
  const exe = process.platform === 'win32' ? 'codex.exe' : 'codex';

  for (const dir of dirs) {
    const lower = dir.toLowerCase();
    if (!osMatch.some((o) => lower.includes(o)) || !archMatch.some((a) => lower.includes(a))) {
      continue;
    }
    const candidate = path.join(binDir, dir, exe);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}
