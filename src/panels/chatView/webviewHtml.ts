import * as vscode from 'vscode';

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  isDevelopment: boolean
): string {
  const devServerUrl = 'http://localhost:5173';

  if (isDevelopment) {
    return `<!DOCTYPE html>
      <html lang="en" class="dark">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src 'unsafe-eval' 'unsafe-inline' ${devServerUrl}; style-src 'unsafe-inline' ${devServerUrl}; connect-src ${devServerUrl} ws://localhost:5173 http://localhost:5173; font-src ${devServerUrl}; frame-src ${devServerUrl};">
        <title>AIS Code (Dev)</title>
        <script type="module">
          import { injectIntoGlobalHook } from "${devServerUrl}/@react-refresh";
          injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => (type) => type;
          window.__vite_plugin_react_preamble_installed__ = true;
        </script>
        <script type="module" src="${devServerUrl}/@vite/client"></script>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="${devServerUrl}/src/main.tsx"></script>
        <script>
          const vscode = acquireVsCodeApi();
          window.vscode = vscode;
        </script>
      </body>
      </html>`;
  }

  const distPath = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'index.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'index.css'));

  return `<!DOCTYPE html>
    <html lang="en" class="dark">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';">
      <link href="${styleUri}" rel="stylesheet">
      <title>AIS Code</title>
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="${scriptUri}"></script>
      <script>
        const vscode = acquireVsCodeApi();
        window.vscode = vscode;
      </script>
    </body>
    </html>`;
}
