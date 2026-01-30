import * as vscode from 'vscode';
import { AgentOrbit } from '../core/agent/AgentOrbit';
import { ToolRegistry } from '../core/tools/registry';
import { ReadFileTool, WriteFileTool, ListFilesTool } from '../core/tools/implementations/FileSystem';
import { OpenRouterProvider } from '../core/providers/implementations/OpenRouter';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _agent?: AgentOrbit;
  private _toolRegistry: ToolRegistry;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri
  ) {
    this._toolRegistry = new ToolRegistry();
    this._toolRegistry.register(new ReadFileTool());
    this._toolRegistry.register(new WriteFileTool());
    this._toolRegistry.register(new ListFilesTool());
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data: { type: string, text: string }) => {
      switch (data.type) {
        case 'sendMessage':
          await this._handleSendMessage(data.text);
          break;
      }
    });
  }

  private async _handleSendMessage(text: string) {
    if (!this._agent) {
      const config = vscode.workspace.getConfiguration('aisCode');
      const apiKey = config.get<string>('openrouter.apiKey');
      const modelId = config.get<string>('openrouter.model') || 'google/gemini-2.0-flash-exp:free';

      const provider = new OpenRouterProvider({
        provider: 'openrouter',
        apiKey: apiKey,
        modelId: modelId,
        maxTokens: config.get<number>('maxTokens'),
        temperature: config.get<number>('temperature')
      });

      this._agent = new AgentOrbit(provider, this._toolRegistry);
    }

    await this._agent.run(text, (chunk: string) => {
      this._view?.webview.postMessage({ type: 'streamToken', text: chunk });
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'index.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'index.css'));

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
}
