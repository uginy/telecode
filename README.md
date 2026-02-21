# AIS Code

**AIS Code** is a VS Code extension that brings the power of an autonomous coding agent directly into your IDE. By crossbreeding the concepts of `nanoclaw`/`picoclaw` with the deep integrations of VS Code, AIS Code offers a fully functional, autonomous AI agent that doesn't just chat, but takes action.

## 🚀 Features

- **Autonomous Agent**: Powered by `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai`, the agent runs a continuous loop to understand your requests, look at your workspace, and execute tasks.
- **Native VS Code Tools**: The agent natively uses VS Code's APIs to:
  - Read files and search code matching patterns (`glob`, `grep`).
  - Execute commands in the built-in terminal (`bash`).
- **Multi-Provider Support**: Supports OpenAI, Anthropic, Google Gemini, OpenRouter, MiniMax, Moonshot, and Ollama.
- **Messenger Control**: Designed to control your VS Code agent seamlessly from Telegram and WhatsApp, enabling remote commands and background task execution without having the editor focused.

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

Press `F5` in VS Code to launch the Extension Development Host.

## ⚙️ Settings

Configure via VS Code Settings (`Cmd/Ctrl + ,` -> AIS Code):

- `aisCode.provider`: Select your AI Provider (default: `openrouter`).
- `aisCode.model`: Select the model ID.
- `aisCode.apiKey`: API key for the selected provider.
- `aisCode.telegram.enabled`, `aisCode.telegram.botToken`, `aisCode.telegram.chatId`: Telegram bot settings.
- `aisCode.whatsapp.enabled`, `aisCode.whatsapp.sessionPath`: WhatsApp bot settings.
