# AIS Code Documentation

## Overview

AIS Code (AI Studio Code) is a next-generation VS Code extension for AI-assisted coding with a multi-agent architecture and spec-driven development approach.

## Documentation Index

| Document                                         | Description                                    |
| ------------------------------------------------ | ---------------------------------------------- |
| [VISION.md](./VISION.md)                         | Project philosophy, goals, and target users    |
| [ARCHITECTURE.md](./ARCHITECTURE.md)             | System layers, components, and data flow       |
| [ITERATIONS.md](./ITERATIONS.md)                 | 5-phase development plan with timeline         |
| [SPEC_DRIVEN_MODULE.md](./SPEC_DRIVEN_MODULE.md) | Three-tier specification system design         |
| [MULTI_AGENT_FLOWS.md](./MULTI_AGENT_FLOWS.md)   | Visual workflow editor for agent orchestration |

## Quick Start

```bash
# Clone repository
git clone <repo-url>
cd aisCode

# Install dependencies
npm install

# Start development
npm run watch

# Build WebView UI
cd webview && npm run build
```

## Key Features

1. **Spec-Driven Development** - Architecture → Detailed → Execution specs
2. **Multi-Agent System** - Specialized agents (Architect, Coder, Reviewer, Fixer)
3. **Visual Flow Editor** - n8n-style workflow designer
4. **Self-Healing** - Automatic bug detection and repair
5. **Modern UI** - Dark theme, animations, visual feedback

## Current Status

🎯 **Iteration 1**: Foundation + Visual Shell (in planning)

## Links

- [VS Code Extension API](https://code.visualstudio.com/api)
- [React Flow](https://reactflow.dev/) (for flow editor)
- [Anthropic API](https://docs.anthropic.com/)
- [OpenAI API](https://platform.openai.com/docs)
