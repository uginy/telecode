# AIS Code

AI Studio Code - Multi-Agent IDE Extension for VS Code

## Features

- 💬 **AI Chat** - Have natural conversations with AI to help you code
- 🤖 **Multi-Provider** - Support for Anthropic Claude, OpenAI GPT, and more
- 🌊 **Streaming Responses** - Real-time token streaming for faster feedback
- 🎨 **Modern UI** - Beautiful dark theme that integrates with VS Code

## Getting Started

1. Install the extension
2. Open the AIS Code panel from the Activity Bar
3. Configure your API key in VS Code settings:
   - `aisCode.anthropic.apiKey` for Claude
   - `aisCode.openai.apiKey` for GPT

## Development

```bash
# Install dependencies
npm install
cd webview && npm install

# Build everything
npm run build

# Watch mode for development
npm run watch
```

## Commands

- `AIS Code: Open Chat` - Open the chat panel
- `AIS Code: New Conversation` - Start a fresh conversation

## Settings

| Setting                    | Description            | Default                    |
| -------------------------- | ---------------------- | -------------------------- |
| `aisCode.provider`         | AI provider to use     | `anthropic`                |
| `aisCode.anthropic.apiKey` | Anthropic API key      | -                          |
| `aisCode.anthropic.model`  | Claude model           | `claude-sonnet-4-20250514` |
| `aisCode.openai.apiKey`    | OpenAI API key         | -                          |
| `aisCode.openai.model`     | GPT model              | `gpt-4o`                   |
| `aisCode.maxTokens`        | Max tokens in response | `4096`                     |
| `aisCode.temperature`      | Response temperature   | `0.7`                      |

## License

MIT
