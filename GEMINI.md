# TeleCode AI — Agent Guidelines

TeleCode AI is an autonomous coding agent embedded inside VS Code. It is built on a pure agentic architecture powered by `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai`, seamlessly integrated with the VS Code extension API.

## 🎯 Architecture

Unlike typical chat-based extensions (like Cline, Roo, Kilo), TeleCode AI is built around a persistent autonomous agent loop.

```text
User Request → VS Code Command → CodingAgent (pi-agent-core) → LLM Provider → Tool Execution → Loop Back
```

### Key Components

- **\`src/extension.ts\`**: Thin VS Code composition root. It wires the webview, commands, runtime/channel controllers, settings sync, and lifecycle hooks.
- **\`src/extension/*Controller.ts\`**: Focused controllers for commands, runtime lifecycle, channels, settings sync, fetch logging, and UI status orchestration.
- **\`src/agent/codingAgent.ts\`**: Wrapper around `@mariozechner/pi-agent-core` that resolves provider/model setup and drives prompt execution.
- **\`src/tools/index.ts\`** and **\`src/tools/definitions/*\`**: The canonical source for agent tools and their VS Code / workspace integrations.

## ⚠️ Core Philosophy: Agent Over Chat

We are building an **Agent that codes**, not just an assistant that gives advice.
When adding features, adhere to the autonomous agent philosophy:

1. **Provide Tools, Not UI**: Instead of building complex UIs to show data, give the agent a tool to read that data. The agent should be able to navigate the workspace autonomously.
2. **Terminal First**: The agent operates primarily by executing bash commands and using native VS Code workspace APIs to accomplish tasks.
3. **Remote Control**: The architecture supports triggering the agent from external messengers (Telegram, WhatsApp) so the user doesn't even need to be at their computer to kick off a task.

## 🛠 Adding a New Tool

To add a new capability to the agent:

1. Open \`src/tools/index.ts\` or the relevant file under \`src/tools/definitions/\`.
2. Add a new \`AgentTool\` definition there and keep the implementation close to the domain it belongs to.
3. Use \`vscode.\*\` APIs for deep IDE integration, or standard Node APIs for external system access.
4. Ensure the tool returns clear results for the agent to parse.

Example of a tool definition using \`@sinclair/typebox\`:
\`\`\`typescript
{
name: 'new_tool',
description: 'What the tool does',
parameters: Type.Object({ arg1: Type.String() }),
label: 'My Tool',
execute: async (toolCallId, params) => {
// Implement tool logic
return { content: [{ type: 'text', text: 'Result' }], details: {} };
}
}
\`\`\`

## 🏗 Current Remote Scope

- **Messenger-first Control**: Telegram and WhatsApp are first-class control surfaces for running coding tasks remotely.
- **Remote Task Operations**: Queue, history, task lookup, rerun/resume, commit/revert, artifacts, and lightweight git/checks flows are already part of the product surface.
- **Periodic Automation**: Remote schedules can enqueue recurring tasks through the same shared task queue.
- **Workspace Project Memory**: Each workspace can keep its own short persistent notes that are injected into the prompt and managed from messengers.
- **Persistence**: Last task review, queue state, schedules, and workspace project memory survive extension restarts inside the workspace.

## 🧭 Next Priorities

- **Messenger UX Polish**: Keep messenger replies short by default and move details behind explicit commands.
- **Targeted Remote Tools**: Add small built-in remote utilities only when they materially reduce LLM overhead for common checks.
- **Coverage Growth**: Add tests mainly around low-coverage runtime/channel integration paths instead of broad UI-heavy suites.

## 📚 Best Practices

- **TypeScript strict mode** - No \`any\` without justification.
- **Architecture & Decomposition** - Avoid "God Files". Ensure classes follow Single Responsibility Principles.
- **Error Handling**: Keep tool logic robust. Always return user/agent-friendly error messages instead of throwing unhandled exceptions. If a tool fails, the agent must know _why_ so it can correct its approach.
- **Code Language**: Write clean, modern TypeScript logic.
- **Pre-decision Research**: Before making architectural decisions or choosing dependencies, always conduct a brief research on relevance and modern approaches. Look for cool, popular, ready-made solutions and strictly avoid installing outdated packages.
