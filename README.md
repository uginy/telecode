<p align="center">
  <img src="media/icon.png" alt="TeleCode AI" width="96" />
</p>

<h1 align="center">TeleCode AI</h1>

<p align="center">
  <strong>Remote-controlled autonomous coding agent in your VS Code.</strong><br>
  Run tasks locally or from Telegram/WhatsApp, with grouped logs, status phases, and a focused coding toolchain.
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
You can control it from VS Code or remotely via Telegram/WhatsApp.

## 🧱 Architecture

- `src/extension.ts` is intentionally thin and acts as the VS Code composition root.
- Runtime, channels, command wiring, settings sync, fetch logging, and UI status orchestration live in focused modules under `src/extension/`.
- Agent tools are defined in `src/tools/index.ts` and `src/tools/definitions/*`.
- Telegram and WhatsApp channels share common runtime bootstrap logic, while channel-specific rendering and message helpers live next to each channel.

## 🚀 Features

- **Autonomous Agent Loop**: Continuously plans and executes multi-step tasks. The agent reads your workspace, runs bash commands, edits files, and loops until the task is done.
- **Remote Control Channels**: Use Telegram and WhatsApp channels for remote task execution from your phone.
- **Multi-Provider AI**: Works with OpenRouter, OpenAI, Anthropic Claude, Google Gemini, MiniMax, Moonshot (Kimi), and self-hosted Ollama models.
- **Structured Logs UI**:
  - Grouped log view with typed rows (`status`, `tool:start`, `tool:done`, `channel`, `llm`, etc.)
  - Tool invocations are visible in the task timeline, including remote channel runs
  - Status verbosity modes: `minimal`, `normal`, `debug`
  - Filter chips and query filter for fast navigation in long runs
  - Collapse/expand all grouped nodes
- **Native Coding Toolchain**:
  - `read_file` / `write_file` / `edit_file` (exact-line replace)
  - `fetch_url` (read readable text from any HTTP website without external APIs)
  - `diagnostics` (instantly read VS Code TypeScript/ESLint errors without running compilers)
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
4. Click **Start TeleCode**, type a task in the prompt field, and send it

## 📱 Remote Commands

TeleCode AI is designed to be useful from messengers first. Telegram and WhatsApp share the same practical remote flows:

- `run/review/checks` for daily task execution
- `queue/history/task/cancel` for task control
- `commit/revert/artifacts` for result handoff
- `memory/remember/forget` for workspace-scoped project memory
- `git/changes/diff/logs` for lightweight remote inspection
- `schedule` for periodic remote tasks

Typical examples:

```text
/run fix failing tests in taskRunner and show me the result
/review
/history 10 failed
/task last
/artifacts last
/memory
/remember repo uses pnpm only
/git status
/schedule every 1 send me the latest git commit title
```

The VS Code panel remains useful for logs and local runs, but the main operational loop can be fully driven from Telegram or WhatsApp.

## ⚙️ Development

```bash
npm install       # Install dependencies
npm run build     # Build extension
npm test          # Run test suite
npm run test:coverage # Run tests with coverage report
npm run watch     # Watch mode
```

For hot reload: open `Run and Debug` → start **Run Extension (Watch)**.

## ⚙️ Settings

| Setting                               | Description                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `telecode.provider`                   | AI provider (`openrouter`, `openai`, `anthropic`, `google`, `moonshot`, `ollama`, ...) |
| `telecode.model`                      | Model ID (e.g. `openai/gpt-4o`, `arcee-ai/trinity-large-preview:free`)                 |
| `telecode.apiKey`                     | API key for the selected provider                                                      |
| `telecode.baseUrl`                    | Custom base URL for OpenAI-compatible endpoints                                        |
| `telecode.maxSteps`                   | Max agent steps per task (default: `100`)                                              |
| `telecode.responseStyle`              | Response style (`concise`, `normal`, `detailed`)                                       |
| `telecode.language`                   | Agent language (`auto`, `ru`, `en`)                                                    |
| `telecode.uiLanguage`                 | UI language (`ru`, `en`)                                                               |
| `telecode.statusVerbosity`            | Runtime status density in logs (`minimal`, `normal`, `debug`)                          |
| `telecode.safeModeProfile`            | Permission profile (`strict`, `balanced`, `power`)                                     |
| `telecode.logMaxChars`                | Maximum in-memory UI log buffer before trimming                                        |
| `telecode.channelLogLines`            | Maximum per-channel log lines kept in memory                                           |
| `telecode.allowOutOfWorkspace`        | Allow agent file/command access outside workspace                                      |
| `telecode.allowedTools`               | Allowed tool list for the agent                                                        |
| `telecode.telegram.enabled`           | Enable Telegram bot                                                                    |
| `telecode.telegram.botToken`          | Token from `@BotFather`                                                                |
| `telecode.telegram.chatId`            | Allowed Telegram user/group ID                                                         |
| `telecode.telegram.apiRoot`           | Telegram API root URL                                                                  |
| `telecode.telegram.forceIPv4`         | Force IPv4 mode for Telegram connectivity                                              |
| `telecode.whatsapp.enabled`           | Enable WhatsApp channel                                                                |
| `telecode.whatsapp.sessionPath`       | Local session/profile path for WhatsApp Web auth                                       |
| `telecode.whatsapp.allowSelfCommands` | Allow self-chat command mode (`/run`, `/status`, `/stop`, `/help`)                     |
| `telecode.whatsapp.accessMode`        | WhatsApp sender policy (`self`, `allowlist`, `all`)                                    |
| `telecode.whatsapp.allowedPhones`     | Comma-separated allowlist phones for `allowlist` mode                                  |

## ⏱ Remote Scheduler

You can create recurring remote tasks directly from Telegram or WhatsApp:

```text
/schedule every 1 send me the current date and time
/schedule every 5 send me the latest git commit title
/schedule
/schedule run 1
/schedule pause 1
/schedule resume 1
/schedule remove 1
```

Notes:

- Minimum interval is `1` minute.
- Schedules are persisted in the workspace under `.telecode/remote-schedules.json`.
- Scheduled runs reuse the same task queue, so they do not bypass active manual tasks.

## 📄 License

MIT © [Uginy](https://github.com/uginy)
