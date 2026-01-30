# AIS Code — Agent Guidelines

VS Code extension for AI-assisted coding with multi-provider support.

## ⚠️ Don't Reinvent the Wheel

Before implementing any feature, check how it's done in these established projects:

| Project       | Repository                                                             | What to learn                                 |
| ------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| **Cline**     | [github.com/cline/cline](https://github.com/cline/cline)               | Tool architecture, agent loop, diff handling  |
| **Kilo Code** | [github.com/kilocode/kilo](https://github.com/kilocode/kilo)           | UI patterns, streaming, context management    |
| **Roo Code**  | [github.com/RooVetGit/Roo-Code](https://github.com/RooVetGit/Roo-Code) | Provider abstraction, settings, webview comms |

**Rules:**

- Study competitor implementations before coding new features
- Reuse proven patterns, don't invent custom solutions
- If a feature exists in Cline/Kilo/Roo, understand their approach first
- Copy architecture decisions, not code (respect licenses)

## Project Structure

```
src/                    # Extension backend (Node.js)
├── extension.ts        # Entry point, activation
├── panels/             # WebviewPanel controllers
├── providers/          # AI provider implementations
│   ├── base.ts         # Abstract base class
│   ├── anthropic.ts    # Claude
│   ├── openai.ts       # GPT
│   ├── openrouter.ts   # OpenRouter (free tier)
│   ├── openai-compatible.ts  # Ollama, LM Studio
│   └── registry.ts     # Provider factory
├── storage/            # Conversation persistence
├── tools/              # Agent tool implementations
└── types/              # Shared TypeScript types

webview/                # Chat UI (React + Vite)
├── src/
│   ├── App.tsx         # Main component
│   ├── components/     # UI components
│   ├── stores/         # State management
│   ├── hooks/          # Custom hooks
│   └── types/          # Frontend types
└── vite.config.ts
```

## Quick Start

```bash
npm install && cd webview && npm install && cd ..
npm run build          # Build everything
npm run watch          # Dev mode (extension + webview)
```

Press `F5` in VS Code to launch Extension Development Host.

## Key Commands

| Command           | Description          |
| ----------------- | -------------------- |
| `npm run build`   | Production build     |
| `npm run watch`   | Watch mode for dev   |
| `npm run lint`    | ESLint check         |
| `npm run package` | Create .vsix package |

## Architecture

### Message Flow

```
User Input → Webview → postMessage → Extension → AI Provider → Stream → Webview
```

### Adding a New Provider

1. Create `src/providers/{name}.ts` extending `BaseProvider`
2. Implement `sendMessage()` with streaming support
3. Register in `registry.ts`
4. Add config options in `package.json` contributes.configuration

### Communication Protocol

Extension ↔ Webview via `vscode.postMessage`:

```typescript
// Webview → Extension
{ type: 'sendMessage', content: string, context?: FileContext[] }
{ type: 'newConversation' }
{ type: 'getState' }

// Extension → Webview
{ type: 'addMessage', message: Message }
{ type: 'streamChunk', chunk: string }
{ type: 'streamEnd' }
{ type: 'setState', messages: Message[] }
```

## Code Style

### General Rules

- **TypeScript strict mode** — no `any` without justification
- **Async/await** — no raw promises or callbacks
- **Error handling** — always catch and show user-friendly messages
- **Comments in English only** — all code comments must be in English

### Architecture & Decomposition

| Rule                      | Guideline                                       |
| ------------------------- | ----------------------------------------------- |
| **No god files**          | Max ~300 lines per file. Split when logic grows |
| **Single responsibility** | One file = one purpose                          |
| **Extract utilities**     | Shared logic → `lib/` or `utils/`               |
| **Separate concerns**     | UI, state, API calls in different files         |

**When to split a file:**

- More than 300 lines
- Multiple unrelated exports
- Hard to name (sign of mixed concerns)
- Contains both UI and business logic

### File Organization

```
// ✅ Good: focused files
components/
├── ChatMessage.tsx      # Single message display
├── ChatInput.tsx        # Input field + send button
├── ChatList.tsx         # Message list container
└── ProviderSelector.tsx # Provider dropdown

// ❌ Bad: god file
components/
└── Chat.tsx             # 800 lines doing everything
```

### TypeScript Discipline

```bash
# ALWAYS run after changes
npm run build   # Catches TS errors

# Before committing
npm run lint    # ESLint check
```

**After every code change:**

1. Run `npm run build` to verify no TypeScript errors
2. Fix any type errors before moving on
3. Never suppress errors with `// @ts-ignore` without comment explaining why

### Commenting Guidelines

```typescript
// ✅ Good: explains WHY
// OpenRouter returns empty content on rate limit, retry with backoff
if (!response.content) {
  await sleep(1000);
  return this.sendMessage(messages);
}

// ❌ Bad: explains WHAT (obvious from code)
// Check if content is empty
if (!response.content) {
```

### Import Organization

```typescript
// 1. Node/external modules
import * as vscode from "vscode";
import Anthropic from "@anthropic-ai/sdk";

// 2. Internal modules (absolute paths)
import { Message } from "../types";
import { BaseProvider } from "./base";

// 3. Relative imports
import { parseResponse } from "./utils";
```

## Testing Changes

1. Run `npm run build`
2. Press `F5` to launch dev host
3. Open AIS Code panel from Activity Bar
4. Test chat functionality with different providers

## Common Issues

| Issue                  | Solution                                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| Webview blank          | Check browser devtools (Help → Toggle Developer Tools), look for errors |
| API errors             | Verify API key in settings, check provider status                       |
| Build fails            | Delete `dist/`, run `npm run build` again                               |
| Hot reload not working | Restart extension host (Ctrl+Shift+F5)                                  |

## Files to Know

| File                             | Purpose                               |
| -------------------------------- | ------------------------------------- |
| `src/extension.ts`               | Extension entry, command registration |
| `src/panels/ChatViewProvider.ts` | Main webview controller               |
| `src/providers/base.ts`          | Provider interface contract           |
| `webview/src/App.tsx`            | React app root                        |
| `webview/src/stores/`            | Zustand stores for state              |
| `package.json`                   | Commands, settings, activation events |
