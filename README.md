<p align="center">
  <img src="media/icon.png" alt="TeleCode AI" width="96" />
</p>

<h1 align="center">TeleCode AI</h1>

<p align="center">
  <strong>Remote-controlled autonomous coding agent in your VS Code.</strong><br>
  Run tasks locally or from Telegram, with grouped logs, status phases, and a focused coding toolchain.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=Uginy.telecode-ai">
    <img alt="VS Marketplace" src="https://img.shields.io/visual-studio-marketplace/v/Uginy.telecode-ai?label=VS%20Marketplace&color=22d3ee&labelColor=09090b">
  </a>
  <a href="https://github.com/uginy/telecode">
    <img alt="Open Source" src="https://img.shields.io/badge/Open%20Source-MIT-a855f7?labelColor=09090b">
  </a>
  <a href="https://github.com/uginy/telecode/stargazers">
    <img alt="Stars" src="https://img.shields.io/github/stars/uginy/telecode?color=f59e0b&labelColor=09090b">
  </a>
</p>

---

**TeleCode AI** is an autonomous coding agent built on `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai`.
It plans, executes tools, edits files, and reports progress in a structured log UI.
You can control it from VS Code or remotely via Telegram.

## 🆕 Version 0.1.6 Highlights

- Refined grouped logs UX with collapse/expand-all control and cleaner status noise handling.
- Safe Mode Profiles (`strict`, `balanced`, `power`) in both composer and Settings.
- Adaptive tooltip service in webview (auto placement + smooth transitions + RU/EN labels).
- Quick block above composer: pinned filters, prompt presets, and run summary card.
- About page redesigned and synchronized with project metadata and links.

## 🚀 Features

- **Autonomous Agent Loop**: Continuously plans and executes multi-step tasks. The agent reads your workspace, runs bash commands, edits files, and loops until the task is done.
- **Telegram Remote Control**: Authenticate your bot with `@BotFather`, set your Chat ID, and control your coding session from anywhere in the world.
- **Multi-Provider AI**: Works with OpenRouter, OpenAI, Anthropic Claude, Google Gemini, MiniMax, Moonshot (Kimi), and self-hosted Ollama models.
- **Structured Logs UI**:
  - Grouped log view with typed rows (`status`, `tool:start`, `tool:done`, `channel`, `llm`, etc.)
  - Status verbosity modes: `minimal`, `normal`, `debug`
  - Filter chips and query filter for fast navigation in long runs
  - Collapse/expand all grouped nodes
- **Native Coding Toolchain**:
  - `read_file` / `write_file` / `edit_file` (exact-line replace)
  - `glob` for file discovery
  - `grep` (ripgrep with Node.js fallback)
  - `bash` with captured stdout/stderr, timeout, and streaming
  - `workspace` context: active file, cursor, open documents
- **Configurable Response Style**: `concise`, `normal`, `detailed`.
- **Session History**: Persistent session memory within a VS Code workspace.

## 💡 Why a VS Code Extension?

1. **Zero Context Switching**: TeleCode AI lives directly in your sidebar. No terminal juggling.
2. **Native Context**: The agent instantly knows your _Active File_, _Cursor Position_, and _Selected Text_.
3. **Instant Feedback**: The agent modifies the exact files you have open. See live diffs without jumping between apps.
4. **Remote Control via Telegram**:
   - 🚑 **Emergency fix on the go**: A bug is reported. Message the bot from your phone — it fixes and commits.
   - 🛏 **Work from bed**: Your dev environment is on your office PC. Just leave VS Code open and instruct remotely.
   - 🚶 **Background tasks**: Ask the agent to build a feature, go for a walk. Code is waiting when you return.

## 🛠 Getting Started

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Uginy.telecode-ai)
2. Open the **TeleCode AI** panel from the Activity Bar
3. Configure your provider and API key in Settings (`Cmd/Ctrl + ,` → TeleCode AI)
4. Click **Start Agent**, type a task in the prompt field, and send it

## ⚙️ Development

```bash
npm install       # Install dependencies
npm run build     # Build extension
npm run watch     # Watch mode
```

For hot reload: open `Run and Debug` → start **Run Extension (Watch)**.

## ⚙️ Settings

| Setting                         | Description                                                                 |
| ------------------------------- | --------------------------------------------------------------------------- |
| `telecode.provider`             | AI provider (`openrouter`, `openai`, `anthropic`, `google`, `moonshot`, `ollama`, ...) |
| `telecode.model`                | Model ID (e.g. `openai/gpt-4o`, `arcee-ai/trinity-large-preview:free`)    |
| `telecode.apiKey`               | API key for the selected provider                                           |
| `telecode.baseUrl`              | Custom base URL for OpenAI-compatible endpoints                             |
| `telecode.maxSteps`             | Max agent steps per task (default: `100`)                                   |
| `telecode.responseStyle`        | Response style (`concise`, `normal`, `detailed`)                            |
| `telecode.language`             | Agent language (`auto`, `ru`, `en`)                                         |
| `telecode.uiLanguage`           | UI language (`ru`, `en`)                                                    |
| `telecode.statusVerbosity`      | Runtime status density in logs (`minimal`, `normal`, `debug`)               |
| `telecode.safeModeProfile`      | Permission profile (`strict`, `balanced`, `power`)                           |
| `telecode.logMaxChars`          | Maximum in-memory UI log buffer before trimming                             |
| `telecode.telegramMaxLogLines`  | Maximum Telegram log lines kept in memory                                   |
| `telecode.allowOutOfWorkspace`  | Allow agent file/command access outside workspace                           |
| `telecode.allowedTools`         | Allowed tool list for the agent                                             |
| `telecode.telegram.enabled`     | Enable Telegram bot                                                         |
| `telecode.telegram.botToken`    | Token from `@BotFather`                                                     |
| `telecode.telegram.chatId`      | Allowed Telegram user/group ID                                              |
| `telecode.telegram.apiRoot`     | Telegram API root URL                                                       |
| `telecode.telegram.forceIPv4`   | Force IPv4 mode for Telegram connectivity                                   |

## 📄 License

MIT © [Uginy](https://github.com/uginy)
