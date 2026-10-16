<p align="center">
  <img src="media/icon.png" alt="TeleCode AI" width="96" />
</p>

<h1 align="center">TeleCode AI</h1>

<p align="center">
  <strong>Remote-controlled autonomous coding agent in your VS Code.</strong><br>
  Send a task from your phone. TeleCode edits your project, shows the changes, and sends the result back.
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

**TeleCode AI** runs coding tasks in your VS Code workspace, locally or from **Telegram and WhatsApp**.
Ask it to investigate a bug, edit code, or run checks. Follow progress from your phone, inspect the diff, and commit the result when you are ready.

```text
/run find why the login test fails and fix it
/review
/artifacts last
/commit fix: correct login validation
```

You bring your own model API key. VS Code must remain open on the machine with your project.

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
  - `bash` with captured stdout/stderr and a timeout
  - `workspace` context: active file, cursor, open documents
- **Configurable Response Style**: `concise`, `normal`, `detailed`.
- **Session History**: Recent conversation history is saved per workspace.
- **Connection Check**: Test the selected model and API key before running a task; the check sends no project files and runs no tools.
- **Model Autocomplete**: Search current model choices as you type, use the keyboard to select, and filter OpenRouter to free models.
- **Credential Storage**: API keys and Telegram tokens are kept in VS Code SecretStorage.

## 💡 Why a VS Code Extension?

1. **Zero Context Switching**: TeleCode AI lives directly in your sidebar. No terminal juggling.
2. **Native Context**: The agent instantly knows your _Active File_, _Cursor Position_, and _Selected Text_.
3. **Instant Feedback**: The agent modifies the exact files you have open. See live diffs without jumping between apps.
4. **Remote Control via Telegram**:
   - 🚑 **Emergency fix on the go**: A bug is reported. Message the bot from your phone, inspect its result, then request a commit.
   - 🛏 **Work from bed**: Your dev environment is on your office PC. Just leave VS Code open and instruct remotely.
   - 🚶 **Background tasks**: Ask the agent to build a feature, go for a walk. Code is waiting when you return.

## 🛠 Getting Started

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Uginy.telecode-ai) and open a project folder.
2. Open **TeleCode AI** from the Activity Bar, then **Settings → Inference**.
3. Choose a provider and enter its API key. Click the model field to load choices, then type to filter; use **↑/↓** and **Enter** to select. OpenRouter also has a **Free models only** filter. You can enter any model ID manually or use **↻** to refresh the list. The default is OpenRouter's `openrouter/free`; free models have provider rate limits and varying availability.
4. Click **Test connection**. This makes one short model request, which may incur provider usage charges.
5. Save settings, start the agent, and send a small task such as `Explain the project structure without changing files`.

Requires **VS Code 1.107+**. Other compatible IDEs need an extension host running **Node.js 22.19+**. Ollama uses your local server and does not require an API key.

### Telegram

Create a bot with **@BotFather**. In TeleCode settings, enable Telegram and enter the bot token and your numeric **Chat ID**, then save. Commands remain blocked until a valid allowed chat is configured. Send `/help` to the bot to see the commands.

### WhatsApp

Enable WhatsApp in TeleCode settings and save. Open **Logs** and scan the QR code with **WhatsApp → Linked Devices → Link a Device**. The default access mode accepts commands only from your own linked account. Keep VS Code open for remote tasks and schedules.

### Permissions and Git changes

- **Strict** provides read/search tools. **Balanced** adds file editing and shell commands. **Power** also allows tool paths outside the project.
- Shell commands are **not sandboxed**. A working-directory restriction does not prevent a command from accessing other paths.
- Tool execution is autonomous; interactive tool approvals are not supported. The legacy `autoApprove=false` setting prevents agent startup.
- `maxSteps` limits actual tool calls per task. Provider failures and interrupted runs are reported as failures or interruptions.
- Automatic task commit/revert requires a recorded clean starting working tree. It also refuses files changed after the task finished. For existing uncommitted work, review and manage the changes manually in Git.

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
npm run build:all # Build extension and webview
npm test          # Run test suite
npm run test:coverage # Run tests with coverage report
npm run watch     # Watch mode
```

For hot reload: open `Run and Debug` → start **Run Extension (Watch)**.

## ⚙️ Settings

| Setting                               | Description                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `telecode.provider`                   | AI provider (`openrouter`, `openai`, `anthropic`, `google`, `moonshot`, `ollama`, ...) |
| `telecode.model`                      | Model ID (e.g. `openrouter/free` for OpenRouter; use provider-specific IDs for direct APIs)                 |
| `telecode.apiKey`                     | Legacy input; use the panel to save the key in SecretStorage                                                      |
| `telecode.baseUrl`                    | Custom base URL for OpenAI-compatible endpoints                                        |
| `telecode.maxSteps`                   | Max agent steps per task (default: `100`)                                              |
| `telecode.responseStyle`              | Response style (`concise`, `normal`, `detailed`)                                       |
| `telecode.language`                   | Agent language (`auto`, `ru`, `en`)                                                    |
| `telecode.uiLanguage`                 | UI language (`ru`, `en`)                                                               |
| `telecode.statusVerbosity`            | Runtime status density in logs (`minimal`, `normal`, `debug`)                          |
| `telecode.safeModeProfile`            | Permission profile (`strict`, `balanced`, `power`)                                     |
| `telecode.logMaxChars`                | Maximum in-memory UI log buffer before trimming                                        |
| `telecode.channelLogLines`            | Maximum per-channel log lines kept in memory                                           |
| `telecode.allowOutOfWorkspace`        | Controlled by the profile; shell commands are not sandboxed                                      |
| `telecode.allowedTools`               | Allowed tool list for the agent                                                        |
| `telecode.telegram.enabled`           | Enable Telegram bot                                                                    |
| `telecode.telegram.botToken`          | Legacy input; use the panel to save the BotFather token in SecretStorage                                                                |
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

## 🧱 Architecture

TeleCode uses `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai`.
`src/extension.ts` wires the VS Code UI, lifecycle and channel controllers. Tools live in `src/tools/definitions/`; Telegram and WhatsApp use shared runtime and task queue helpers.

## 📄 License

MIT © [Uginy](https://github.com/uginy)
