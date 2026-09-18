import * as vscode from 'vscode';
import { readSettings, UsageController } from './UsageController';
import { StatusBar } from './views/StatusBar';
import { UsageViewProvider } from './views/UsageViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Codex Meter');
  const version = String(context.extension.packageJSON.version ?? '0.0.0');
  const controller = new UsageController(version, log);
  const provider = new UsageViewProvider(context.extensionUri, controller);
  const statusBar = new StatusBar(controller);
  let settings = readSettings();

  context.subscriptions.push(
    log,
    controller,
    provider,
    statusBar,
    vscode.window.registerWebviewViewProvider(UsageViewProvider.viewId, provider),
    vscode.commands.registerCommand('codexMeter.refresh', () => controller.refresh()),
    vscode.commands.registerCommand('codexMeter.restartServer', () => controller.restart()),
    vscode.commands.registerCommand('codexMeter.showLog', () => log.show()),
    vscode.commands.registerCommand('codexMeter.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:murilobraz.codex-meter')
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('codexMeter')) return;
      const previous = settings;
      settings = readSettings();
      void controller.reconfigure(previous);
      statusBar.update();
    })
  );

  // Fetch once at startup so the status bar is populated before the panel opens.
  void controller.refresh();
}

export function deactivate(): void {}
