import * as vscode from 'vscode';
import { CodingAgent, createAgent } from './agent/codingAgent';
import { AgentTool, AgentEvent } from '@mariozechner/pi-agent-core';
import { Type, Static } from '@sinclair/typebox';

let agent: CodingAgent | null = null;
import { TelegramChannel } from './channels/telegram';

let telegramChannel: TelegramChannel | null = null;


const tools: AgentTool[] = [
  {
    name: 'read_file',
    description: 'Read contents of a file',
    parameters: Type.Object({
      path: Type.String({ description: 'Path to the file' }),
    }),
    label: 'Read File',
    execute: async (toolCallId, params) => {
      const path = (params as any).path;
      const uri = vscode.Uri.file(path);
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        return { content: [{ type: 'text', text: doc.getText() }], details: {} };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], details: {} };
      }
    },
  },
  {
    name: 'glob',
    description: 'Find files matching a pattern',
    parameters: Type.Object({
      pattern: Type.String({ description: 'Glob pattern (e.g., **/*.ts)' }),
    }),
    label: 'Glob',
    execute: async (toolCallId, params) => {
      const pattern = (params as any).pattern;
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
      return { content: [{ type: 'text', text: files.map(f => f.fsPath).join('\n') }], details: {} };
    },
  },
  {
    name: 'grep',
    description: 'Search for text in files',
    parameters: Type.Object({
      query: Type.String({ description: 'Text to search for' }),
      glob: Type.Optional(Type.String({ description: 'File pattern (e.g., *.ts)' })),
    }),
    label: 'Grep',
    execute: async (toolCallId, params) => {
      const query = (params as any).query;
      const glob = (params as any).glob || '*';
      const files = await vscode.workspace.findFiles(glob, '**/node_modules/**');
      const results: string[] = [];
      for (const file of files.slice(0, 10)) {
        const doc = await vscode.workspace.openTextDocument(file);
        const text = doc.getText();
        if (text.includes(query)) {
          results.push(`${file.fsPath}: found "${query}"`);
        }
      }
      return { content: [{ type: 'text', text: results.join('\n') || 'No matches found' }], details: {} };
    },
  },
  {
    name: 'bash',
    description: 'Execute a shell command',
    parameters: Type.Object({
      command: Type.String({ description: 'Command to execute' }),
    }),
    label: 'Bash',
    execute: async (toolCallId, params) => {
      const command = (params as any).command;
      const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
      terminal.sendText(command);
      return { content: [{ type: 'text', text: `Executing: ${command}` }], details: {} };
    },
  },
];

export let chatProvider: ChatViewProvider | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('AIS Code: Extension activated');

  telegramChannel = new TelegramChannel(tools);
  telegramChannel.start();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aisCode.telegram')) {
        telegramChannel?.start();
      }
    })
  );

  chatProvider = new ChatViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aisCode.chatView', chatProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aisCode.openChat', () => {
      vscode.commands.executeCommand('aisCode.chatView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aisCode.startAgent', async () => {
      const config = vscode.workspace.getConfiguration('aisCode');
      
      let apiKey = config.get<string>('apiKey');
      let provider = config.get<string>('provider') || 'openrouter';
      let model = config.get<string>('model') || 'google/gemini-2.0-flash-exp:free';
      
      if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
          prompt: 'Enter API key (or press Esc to use settings)',
          ignoreFocusOut: true,
        }) || '';
        
        if (!apiKey) {
          vscode.window.showErrorMessage('Please set aisCode.apiKey in settings');
          return;
        }
      }

      try {
        agent = createAgent({ provider, model, apiKey }, tools);
        
        const logToUI = (text: string) => {
          chatProvider?.webview?.postMessage({ type: 'output', text });
        };

        logToUI(`\n✅ Agent started with provider: ${provider}, model: ${model}\n`);

        agent.subscribe((event: AgentEvent) => {
          if (event.type === 'message_update' || event.type === 'message_end') {
             // Try to find delta
             const ev = event as any;
             if (ev.assistantMessageEvent?.type === 'text_delta') {
               logToUI(ev.assistantMessageEvent.delta);
             }
          }
          if (event.type === 'tool_execution_start') {
            logToUI(`\n🔧 Executing tool: ${(event as any).toolName}\n`);
          }
          if (event.type === 'tool_execution_end') {
            logToUI(`✅ Tool finished\n`);
          }
          if (event.type === 'tool_execution_error') {
            logToUI(`❌ Tool error: ${(event as any).error?.message}\n`);
          }
        });

        vscode.window.showInformationMessage(`AIS Code: Agent started with ${provider}/${model}`);
      } catch (e: any) {
        vscode.window.showErrorMessage(`Agent error: ${e.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aisCode.runTask', async () => {
      if (!agent) {
        vscode.window.showWarningMessage('Agent not started. Run "Start Agent" first.');
        return;
      }

      const input = await vscode.window.showInputBox({
        prompt: 'What do you want the agent to do?',
        placeHolder: 'e.g., create a new file called hello.txt with "Hello World"',
      });

      if (input) {
        await agent.prompt(input);
      }
    })
  );
}

export function deactivate() {
  if (telegramChannel) {
    telegramChannel.stop();
  }
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  public webview?: vscode.Webview;

  constructor(private context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.webview = webviewView.webview;
    
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { 
              font-family: system-ui, -apple-system, sans-serif; 
              padding: 20px;
              background: #1e1e1e;
              color: #d4d4d4;
            }
            h1 { color: #569cd6; }
            .status { color: #4ec9b0; margin: 10px 0; }
            .config { background: #2d2d2d; padding: 15px; border-radius: 8px; margin-bottom: 10px;}
            button {
              background: #0e639c;
              color: white;
              border: none;
              padding: 8px 16px;
              border-radius: 4px;
              cursor: pointer;
              margin-right: 8px;
            }
            button:hover { background: #1177bb; }
            #output { 
              background: #1e1e1e; 
              color: #d4d4d4;
              padding: 10px;
              border-radius: 4px;
              font-family: monospace;
              white-space: pre-wrap;
              max-height: 400px;
              overflow-y: auto;
            }
          </style>
        </head>
        <body>
          <h1>🦞 AIS Code</h1>
          
          <div class="config">
            <h3>Agent Control</h3>
            <button id="startBtn">Start Agent</button>
            <button id="taskBtn">Run Task</button>
          </div>
          
          <div class="config">
            <h3>Output</h3>
            <div id="output">Ready. Click "Start Agent" to begin.</div>
          </div>
          
          <script>
            const vscode = acquireVsCodeApi();
            
            document.getElementById('startBtn').onclick = () => {
              vscode.postMessage({ command: 'startAgent' });
            };
            
            document.getElementById('taskBtn').onclick = () => {
              vscode.postMessage({ command: 'runTask' });
            };
            
            window.addEventListener('message', (event) => {
              const msg = event.data;
              if (msg.type === 'output') {
                const outputDiv = document.getElementById('output');
                outputDiv.textContent += msg.text;
                outputDiv.scrollTop = outputDiv.scrollHeight;
              }
            });
          </script>
        </body>
      </html>
    `;

    webviewView.webview.onDidReceiveMessage(data => {
      switch (data.command) {
        case 'startAgent':
          vscode.commands.executeCommand('aisCode.startAgent');
          break;
        case 'runTask':
          vscode.commands.executeCommand('aisCode.runTask');
          break;
      }
    });
  }
}
