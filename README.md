# TeleCode AI

**TeleCode AI** is the first remote-controlled autonomous coding agent directly inside your IDE. By crossbreeding the concepts of `nanoclaw`/`picoclaw` with the deep integrations of VS Code, TeleCode AI offers a fully functional, autonomous AI agent that doesn't just chat, but takes action.

## 🚀 Features

- **Autonomous Agent**: Powered by `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai`, the agent runs a continuous loop to understand your requests, look at your workspace, and execute tasks.
- **Dual Runtime**:
  - `nanoclaw` runtime via `@anthropic-ai/claude-agent-sdk` for Claude-native execution
  - `pi` runtime for multi-provider model routing (OpenAI/Anthropic/Gemini/OpenRouter/Ollama)
- **Native Coding Toolchain**:
  - `read_file` (line ranges), `write_file`, `edit_file` (exact replace)
  - `glob`, `grep` (ripgrep with fallback)
  - `bash` with captured stdout/stderr and timeouts
- **Multi-Provider Support**: Supports OpenAI, Anthropic, Google Gemini, OpenRouter, MiniMax, Moonshot, and Ollama.
- **Messenger Control**: Designed to control your VS Code agent seamlessly from Telegram and WhatsApp, enabling remote commands and background task execution without having the editor focused.

## 💡 Why a VS Code Extension (and not Standalone)?

You might wonder why we built AIS Code inside an IDE rather than as a separate CLI tool or a standalone desktop application. Here is why:

1. **Zero Context Switching**: You spend your day in the IDE. Moving between a terminal, a browser, and your editor destroys flow. AIS Code lives directly in your sidebar.
2. **Native IDE Context**: A standalone CLI is blind to your environment. Our VS Code extension instantly knows your _Current Workspace_, _Active File_, _Cursor Position_, and even _Selected Text_. The agent sees exactly what you see.
3. **Instant Developer Feedback**: The agent modifies the exact files you have open. You see live changes in your editor, can instantly review diffs, and run tests in your integrated terminal without jumping between apps.
4. **Your Laptop is the Server (Remote Control)**: By coupling the agent with Telegram/WhatsApp bots and running it inside VS Code, your IDE becomes a secure sandbox. This unlocks incredible real-world mobility:
   - **Emergency Bug Fixes on the Go**: You stepped away from your PC to grab lunch or drive somewhere. A critical bug is reported in your project. Instead of rushing back to the office, you open Telegram, send a message to AIS Code: _"Check the latest Sentry error, find the bug in `auth.ts`, and fix it"_, and review the diff right in the chat.
   - **Working from Bed / Sick Leave**: You are sick and in bed, but all your dev environments, keys, and specific codebases are configured on your powerful office PC. You just leave VS Code open at work. From your phone at home, you can continue to instruct the agent to run scripts, fix code, or analyze files without needing remote desktop or a laptop.
   - **Background Heavy Tasks**: Tell the agent: _"Build a new admin panel component for Users and write unit tests"_, then lock your phone and go for a walk. When you return, the code is waiting for your review in VS Code.

## 🛠 Getting Started

1. Install the extension using your preferred method (e.g. `npm run package` or download a VSIX).
2. Open the **AIS Code** panel from the VS Code Activity Bar.
3. You will be prompted to enter your API key when you start the agent, or you can configure it via the settings.
4. Click **Start Agent**.
5. Click **Run Task** and give the agent an objective (e.g., "Find all TypeScript files and create a summary").

## ⚙️ Development

```bash
# Install dependencies
npm install

# Build extension
npm run build

# Watch mode for development
npm run watch
```

For hot reload during development:

1. Open `Run and Debug` in VS Code.
2. Start **Run Extension (Watch)**.
3. Edit files in `src/**` and keep coding; esbuild rebuilds automatically.
4. Extension Host reload is automatic by default (`aisCode.dev.autoReloadWindow: true`).

## ⚙️ Settings

Configure via VS Code Settings (`Cmd/Ctrl + ,` -> AIS Code):

- `aisCode.provider`: Select your AI Provider (default: `openrouter`).
- `aisCode.engine`: Runtime engine (`auto` | `nanoclaw` | `pi`).
- `aisCode.model`: Select the model ID.
- `aisCode.apiKey`: API key for the selected provider.
- `aisCode.telegram.enabled`, `aisCode.telegram.botToken`, `aisCode.telegram.chatId`: Telegram bot settings.
- `aisCode.whatsapp.enabled`, `aisCode.whatsapp.sessionPath`: WhatsApp bot settings.
