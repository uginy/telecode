# AIS Code - Iteration Plan

## Overview

The project is divided into 5 major iterations, each building upon the previous one. Each iteration delivers a usable, testable product increment.

---

## Iteration 1: Foundation + Visual Shell 🎯 **CURRENT**

**Goal**: Get a working VS Code extension with beautiful UI that can chat with AI and show real-time responses.

**Duration**: 1-2 weeks

**Deliverables**:

- [ ] VS Code extension scaffolding (TypeScript + esbuild)
- [ ] WebView panel with React UI
- [ ] Modern chat interface (dark theme, animations)
- [ ] AI provider integration (start with OpenAI/Anthropic)
- [ ] Message streaming with visual feedback
- [ ] Basic settings panel (API key configuration)

### Tasks Breakdown

#### 1.1 Extension Setup

```
Priority: HIGH
Effort: 1 day

- Initialize VS Code extension project
- Configure TypeScript + esbuild bundler
- Set up development workflow (watch mode, debugging)
- Create basic activation command
```

#### 1.2 WebView Infrastructure

```
Priority: HIGH
Effort: 1 day

- Create React app for WebView
- Set up message passing (extension ↔ webview)
- Implement hot reload for development
- Configure Vite for WebView bundling
```

#### 1.3 Chat UI Implementation

```
Priority: HIGH
Effort: 2-3 days

Design Requirements:
- Dark mode by default (VS Code theme integration)
- Glassmorphism effects for message bubbles
- Smooth animations (fade in, slide up)
- Code syntax highlighting (Shiki)
- Markdown rendering
- Resizable input area
- Message status indicators (sending, sent, error)
```

#### 1.4 AI Provider Integration

```
Priority: HIGH
Effort: 1-2 days

- Abstract provider interface
- Implement Anthropic Claude adapter
- Implement OpenAI adapter
- Streaming response handling
- Token counting + cost display
- Error handling with retry logic
```

#### 1.5 Settings & Configuration

```
Priority: MEDIUM
Effort: 1 day

- API key secure storage
- Model selection dropdown
- Temperature/max tokens controls
- Theme preferences
```

### Visual Mockup (Iteration 1)

````
┌─────────────────────────────────────────────────────────┐
│  AIS Code                                    ─ □ ×     │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │     Welcome to AIS Code! 👋                     │   │
│  │                                                 │   │
│  │     I'm your AI coding assistant.              │   │
│  │     How can I help you today?                  │   │
│  │                                                 │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │ Create a React component for a todo list │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  │                                          [User]│   │
│  │                                                 │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │ I'll create a React todo list component │   │   │
│  │  │ with the following features:            │   │   │
│  │  │                                         │   │   │
│  │  │ • Add/remove tasks                      │   │   │
│  │  │ • Mark as complete                      │   │   │
│  │  │ • Filter by status                      │   │   │
│  │  │                                         │   │   │
│  │  │ ```tsx                                  │   │   │
│  │  │ const TodoList = () => {                │   │   │
│  │  │   const [tasks, setTasks] = ...         │   │   │
│  │  │ ```                                     │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  │  [AI] · Claude 3.5 Sonnet · 234 tokens         │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Type a message...                          📎 │   │
│  │                                            ▶️  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ⚙️ Settings   📊 Usage: $0.02   🔌 Claude 3.5 Sonnet  │
└─────────────────────────────────────────────────────────┘
````

---

## Iteration 2: File Operations + Actions

**Goal**: Enable file reading, writing, and basic tool execution.

**Duration**: 2 weeks

**Deliverables**:

- [ ] File read/write with approval workflow
- [ ] Visual diff viewer (inline and side-by-side)
- [ ] Terminal command execution
- [ ] Workspace indexing (file tree, search)
- [ ] Context management (@file, @folder mentions)
- [ ] Checkpoint/snapshot system

---

## Iteration 3: Spec-Driven Development

**Goal**: Implement the three-tier specification system (Architecture → Detailed → Execution).

**Duration**: 2-3 weeks

**Deliverables**:

- [ ] Spec creation wizard
- [ ] Architecture spec generator
- [ ] Detailed spec with linked entities
- [ ] Execution plan with task breakdown
- [ ] Spec viewer with navigation
- [ ] Progress tracking per task

---

## Iteration 4: Multi-Agent System

**Goal**: Create specialized agents and enable collaboration.

**Duration**: 3 weeks

**Deliverables**:

- [ ] Agent abstraction layer
- [ ] Architect Agent
- [ ] Coder Agent
- [ ] Reviewer Agent
- [ ] Fixer Agent (self-healing)
- [ ] Agent coordination protocol

---

## Iteration 5: Visual Flow Editor

**Goal**: Build the n8n-style workflow designer.

**Duration**: 3-4 weeks

**Deliverables**:

- [ ] React Flow integration
- [ ] Node types (Agent, Condition, Action)
- [ ] Flow editor UI (drag-drop, connections)
- [ ] Flow execution engine
- [ ] Flow templates library
- [ ] Export/import flows

---

## Future Iterations

### Iteration 6: Advanced Features

- Browser automation (Playwright)
- Git integration (commits, branches, PRs)
- Code review assistance
- Test generation

### Iteration 7: Team Features

- Shared flows
- Custom agent definitions
- Usage analytics
- Team settings

### Iteration 8: Enterprise

- SSO integration
- Audit logging
- Compliance controls
- On-premise deployment

---

## Risk Mitigation

| Risk                    | Mitigation                                 |
| ----------------------- | ------------------------------------------ |
| VS Code API limitations | Research extensively before implementation |
| Performance issues      | Profile early, optimize incrementally      |
| AI model costs          | Implement token budgets, caching           |
| Scope creep             | Strict iteration boundaries                |

---

## Success Criteria per Iteration

### Iteration 1 ✅

- Extension installs without errors
- Chat UI is visually polished
- Messages stream in real-time
- API key configuration works

### Iteration 2

- Can create/edit files through chat
- Diff viewer shows changes clearly
- Terminal commands execute safely
- Checkpoints can be restored

### Iteration 3

- Specs are generated from user requirements
- All specs are linked together
- Tasks can be executed in order
- Progress is visually tracked

### Iteration 4

- Multiple agents can collaborate
- Each agent type works correctly
- Self-healing catches common errors
- Agent decisions are explainable

### Iteration 5

- Flows can be designed visually
- Nodes execute in correct order
- Conditions work properly
- Flows can be saved/loaded
