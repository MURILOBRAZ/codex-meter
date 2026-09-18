import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { readSettings, UsageController } from '../UsageController';
import { buildViewState } from './viewState';

type InboundMessage = { type: 'ready' | 'refresh' | 'openSettings' | 'showLog' | 'restart' };

export class UsageViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'codexMeter.view';

  private view: vscode.WebviewView | undefined;
  /** Re-renders relative times ("Resets in 3h 42m") between data refreshes. */
  private tick: NodeJS.Timeout | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly controller: UsageController
  ) {
    this.disposables.push(controller.onDidChange(() => this.post()));
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const media = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    view.webview.html = this.html(view.webview, media);

    view.webview.onDidReceiveMessage(
      (msg: InboundMessage) => {
        switch (msg.type) {
          case 'ready':
            this.post();
            if (!this.controller.data) void this.controller.refresh();
            break;
          case 'refresh':
            void this.controller.refresh();
            break;
          case 'restart':
            void vscode.commands.executeCommand('codexMeter.restartServer');
            break;
          case 'openSettings':
            void vscode.commands.executeCommand('codexMeter.openSettings');
            break;
          case 'showLog':
            void vscode.commands.executeCommand('codexMeter.showLog');
            break;
        }
      },
      undefined,
      this.disposables
    );

    view.onDidChangeVisibility(() => this.updateTick(), undefined, this.disposables);
    view.onDidDispose(
      () => {
        this.view = undefined;
        this.updateTick();
      },
      undefined,
      this.disposables
    );
    this.updateTick();
  }

  post(): void {
    if (!this.view) return;
    const state = buildViewState(this.controller.data, {
      now: Date.now(),
      locale: vscode.env.language,
      displayMode: readSettings().display,
      refreshing: this.controller.refreshing,
    });
    void this.view.webview.postMessage({ type: 'state', state });
  }

  dispose(): void {
    if (this.tick) clearInterval(this.tick);
    this.disposables.forEach((d) => d.dispose());
  }

  private updateTick(): void {
    const visible = !!this.view?.visible;
    if (visible && !this.tick) {
      this.tick = setInterval(() => this.post(), 30_000);
      this.post();
    } else if (!visible && this.tick) {
      clearInterval(this.tick);
      this.tick = undefined;
    }
  }

  private html(webview: vscode.Webview, media: vscode.Uri): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'usage.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'main.js'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${css}" rel="stylesheet">
  <title>Codex Meter</title>
</head>
<body>
  <main id="root" aria-live="polite"></main>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }
}
