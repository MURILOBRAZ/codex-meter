import * as vscode from 'vscode';
import { readSettings, UsageController } from '../UsageController';
import { buildViewState } from './viewState';

/** Compact "Codex 5% · 59%" indicator; click opens the panel. */
export class StatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  private readonly subscription: vscode.Disposable;

  constructor(private readonly controller: UsageController) {
    this.item.name = 'Codex Meter';
    this.item.command = 'codexMeter.view.focus';
    this.subscription = controller.onDidChange(() => this.update());
    this.update();
  }

  update(): void {
    const settings = readSettings();
    if (!settings.statusBar) {
      this.item.hide();
      return;
    }
    const state = buildViewState(this.controller.data, {
      now: Date.now(),
      locale: vscode.env.language,
      displayMode: settings.display,
      refreshing: this.controller.refreshing,
    });

    const main = state.quotaGroups[0]?.windows ?? [];
    if (main.length === 0) {
      this.item.text = state.phase === 'loading' ? '$(sync~spin) Codex' : '$(pulse) Codex';
      this.item.tooltip = state.errors[0] ?? 'Codex Meter';
      this.item.backgroundColor = undefined;
      this.item.show();
      return;
    }

    this.item.text = `$(pulse) ${main.map((w) => `${Math.round(w.percent)}%`).join(' · ')}`;
    const worst = main.some((w) => w.level === 'crit')
      ? 'statusBarItem.errorBackground'
      : main.some((w) => w.level === 'warn')
        ? 'statusBarItem.warningBackground'
        : undefined;
    this.item.backgroundColor = worst ? new vscode.ThemeColor(worst) : undefined;

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**Codex ${settings.display === 'used' ? 'usage' : 'remaining'}**\n\n`);
    for (const w of main) {
      tooltip.appendMarkdown(`- ${w.label}: **${w.percentText}**${w.resetText ? ` — ${w.resetText}` : ''}\n`);
    }
    if (state.tokens) {
      tooltip.appendMarkdown(`\nTokens today: ${state.tokens.rows[0].value}\n`);
    }
    this.item.tooltip = tooltip;
    this.item.show();
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }
}
