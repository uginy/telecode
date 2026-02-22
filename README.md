# TeleCode AI

**TeleCode AI** is the first remote-controlled autonomous coding agent directly inside your IDE. Powered by a pure agentic architecture built on `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai`, it doesn't just chat — it plans, executes, and edits code autonomously, all controllable from your Telegram messenger.

## 🚀 Features

- **Autonomous Agent Loop**: Continuously plans and executes multi-step tasks using `pi-agent-core`. The agent reads your workspace, runs bash commands, edits files, and loops until the task is done.
- **Telegram Remote Control**: Authenticate your bot with `@BotFather`, set your Chat ID, and control your coding session from anywhere in the world.
- **Multi-Provider AI**: Works with OpenRouter, OpenAI, Anthropic Claude, Google Gemini, MiniMax, Moonshot (Kimi), and self-hosted Ollama models.
- **Native Coding Toolchain**:
  - `read_file` / `write_file` / `edit_file` (exact-line replace)
  - `glob` for file discovery
  - `grep` (ripgrep with Node.js fallback)
  - `bash` with captured stdout/stderr, timeout, and streaming
  - `workspace` context: active file, cursor, open documents
- **Configurable Response Style**: Short, Normal, or Detailed agent responses.
- **Session History**: Persistent session memory within a VS Code workspace.

## 💡 Why a VS Code Extension (and not Standalone)?

You might wonder why we built TeleCode AI inside an IDE rather than a separate CLI tool or standalone app. Here is why:

1. **Zero Context Switching**: You spend your day in the IDE. TeleCode AI lives directly in your sidebar.
2. **Native IDE Context**: The agent instantly knows your _Current Workspace_, _Active File_, _Cursor Position_, and _Selected Text_.
3. **Instant Developer Feedback**: The agent modifies the exact files you have open. See live changes without jumping between apps.
4. **Your Laptop is the Server (Remote Control)**: With Telegram integration and VS Code, your IDE becomes a secure remote sandbox:
   - **Emergency Bug Fixes on the Go**: A critical bug is reported. Open Telegram, send a message to TeleCode AI, and review the diff in chat.
   - **Working from Bed / Sick Leave**: Your dev environment is at the office PC. Leave VS Code open — instruct the agent from your phone at home.
   - **Background Heavy Tasks**: Tell the agent to build a feature, lock your phone, go for a walk. Code is waiting when you return.

## 🛠 Getting Started

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Uginy.telecode-ai) or via `.vsix`.
2. Open the **TeleCode AI** panel from the Activity Bar.
3. Configure your provider and API key in Settings (`Cmd/Ctrl + ,` → TeleCode AI).
4. Click **Start Agent**.
5. Click **Run Task** and give the agent an objective.

## ⚙️ Development

```bash
# Install dependencies
npm install

# Build extension
npm run build

# Watch mode for development
npm run watch
```

For hot reload:

1. Open `Run and Debug` in VS Code.
2. Start **Run Extension (Watch)**.
3. Edit files in `src/**`; esbuild rebuilds automatically.
4. Set `telecode.dev.autoReloadWindow: true` to auto-reload the Extension Host.

## ⚙️ Settings

Configure via VS Code Settings (`Cmd/Ctrl + ,` → TeleCode AI):

| Setting                        | Description                                                                |
| ------------------------------ | -------------------------------------------------------------------------- |
| `telecode.provider`            | AI provider (`openrouter`, `openai`, `anthropic`, `google`, `ollama`, ...) |
| `telecode.model`               | Model ID (e.g. `deepseek/deepseek-chat`, `openai/gpt-4o`)                  |
| `telecode.apiKey`              | API key for the selected provider                                          |
| `telecode.baseUrl`             | Custom base URL for OpenAI-compatible endpoints (e.g. Ollama)              |
| `telecode.maxSteps`            | Max agent steps per task (default: `100`)                                  |
| `telecode.autoApprove`         | Auto-approve tool actions without confirmation                             |
| `telecode.responseStyle`       | Response verbosity (`concise`, `normal`, `detailed`)                       |
| `telecode.language`            | Agent communication language (`auto`, `ru`, `en`)                          |
| `telecode.telegram.enabled`    | Enable Telegram bot                                                        |
| `telecode.telegram.botToken`   | Token from `@BotFather`                                                    |
| `telecode.telegram.chatId`     | Your Telegram User ID (send `/start` to the bot to get it)                 |
| `telecode.allowOutOfWorkspace` | Allow the agent to access files outside the workspace                      |
