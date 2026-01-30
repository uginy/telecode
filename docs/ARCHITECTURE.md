# AIS Code - Architecture Document

## System Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              VS Code Extension                              │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Extension Host Layer                          │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│  │  │  File       │  │  Terminal   │  │  Workspace  │  │   Debug    │  │   │
│  │  │  Manager    │  │  Manager    │  │  Indexer    │  │   Bridge   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Core Engine Layer                            │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│  │  │   Agent     │  │    Spec     │  │   Flow      │  │   Self-    │  │   │
│  │  │   Manager   │  │   Engine    │  │   Engine    │  │   Healer   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       AI Provider Layer                              │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│  │  │  Anthropic  │  │   OpenAI    │  │   Gemini    │  │   Local    │  │   │
│  │  │   Claude    │  │   GPT-x     │  │   Pro/Ultra │  │   Ollama   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              WebView UI Layer                               │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │   Chat Panel     │  │   Flow Editor    │  │   Spec Viewer/Editor    │  │
│  │   (Main View)    │  │   (Visual DAG)   │  │   (Markdown + Links)    │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘  │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  Agent Activity  │  │   Diff Viewer    │  │   Settings Panel        │  │
│  │   Monitor        │  │   (Inline)       │  │   (Provider Config)     │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘  │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Extension Host Layer

#### File Manager

- Read/write files with diff tracking
- Watch for external changes
- Manage checkpoints and snapshots
- Handle binary files (images, etc.)

#### Terminal Manager

- Execute shell commands
- Capture output streams (stdout/stderr)
- Handle long-running processes
- Support for background tasks

#### Workspace Indexer

- AST parsing for code understanding
- Semantic search capabilities
- Symbol extraction and cross-referencing
- Project structure analysis

#### Debug Bridge

- Connect to VS Code debugger
- Capture runtime exceptions
- Provide stack traces to agents
- Enable interactive debugging

---

### 2. Core Engine Layer

#### Agent Manager

Orchestrates multiple specialized agents:

```typescript
interface Agent {
  id: string;
  name: string;
  type: AgentType;
  capabilities: string[];
  systemPrompt: string;
  invoke(context: Context): Promise<Result>;
}

enum AgentType {
  ARCHITECT = "architect",
  CODER = "coder",
  REVIEWER = "reviewer",
  FIXER = "fixer",
  TESTER = "tester",
  CUSTOM = "custom",
}
```

#### Spec Engine

Manages the three-tier specification system:

```
.ais/
├── specs/
│   ├── architecture/
│   │   └── system-overview.md
│   ├── detailed/
│   │   ├── api-contracts.md
│   │   └── data-models.md
│   └── execution/
│       ├── plan.md
│       └── tasks/
│           ├── task-001.md
│           └── task-002.md
└── flows/
    └── default-workflow.json
```

#### Flow Engine

Visual workflow execution:

```typescript
interface FlowNode {
  id: string;
  type: "agent" | "condition" | "action";
  data: NodeData;
  inputs: Connection[];
  outputs: Connection[];
}

interface Flow {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: Edge[];
  variables: Record<string, any>;
}
```

#### Self-Healer

Continuous quality monitoring:

```typescript
interface HealthCheck {
  type: "lint" | "compile" | "test" | "runtime";
  status: "ok" | "warning" | "error";
  issues: Issue[];
}

interface Issue {
  file: string;
  line: number;
  message: string;
  severity: Severity;
  suggestedFix?: string;
}
```

---

### 3. AI Provider Layer

Abstract interface for multiple AI backends:

```typescript
interface AIProvider {
  name: string;
  models: Model[];

  complete(params: CompletionParams): AsyncGenerator<Token>;
  embed(text: string): Promise<number[]>;
  analyzeImage(image: Buffer): Promise<ImageAnalysis>;
}

interface Model {
  id: string;
  name: string;
  contextWindow: number;
  capabilities: ModelCapability[];
  pricing: PricingInfo;
}
```

---

### 4. WebView UI Layer

React-based UI components:

#### Chat Panel

- Message history with rich formatting
- Code blocks with syntax highlighting
- File attachments and image previews
- Quick actions and suggestions

#### Flow Editor (React Flow based)

- Drag-and-drop node placement
- Visual connection drawing
- Real-time execution status
- Zoom/pan navigation
- Mini-map for large flows

#### Spec Viewer/Editor

- Markdown rendering with custom extensions
- Bidirectional linking between specs
- Progress tracking visualization
- Inline editing capabilities

---

## Data Flow

```
User Input
    │
    ▼
┌─────────────┐
│  Chat UI    │
└─────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│             Message Router                   │
│  • Intent classification                     │
│  • Route to appropriate agent/flow           │
└─────────────────────────────────────────────┘
    │
    ├──────────────────┬──────────────────┐
    ▼                  ▼                  ▼
┌─────────┐      ┌─────────┐      ┌─────────────┐
│ Simple  │      │  Spec   │      │    Flow     │
│ Query   │      │ Driven  │      │  Execution  │
└─────────┘      └─────────┘      └─────────────┘
    │                  │                  │
    ▼                  ▼                  ▼
┌─────────────────────────────────────────────┐
│              Action Executor                 │
│  • File operations                          │
│  • Terminal commands                        │
│  • Browser automation                       │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│              Self-Healer                     │
│  • Validate changes                         │
│  • Fix errors automatically                 │
│  • Report to user                           │
└─────────────────────────────────────────────┘
    │
    ▼
Response to User
```

---

## Directory Structure

```
ais-code/
├── src/
│   ├── extension.ts              # Entry point
│   ├── core/
│   │   ├── agents/               # Agent implementations
│   │   │   ├── base.ts
│   │   │   ├── architect.ts
│   │   │   ├── coder.ts
│   │   │   ├── reviewer.ts
│   │   │   ├── fixer.ts
│   │   │   └── tester.ts
│   │   ├── spec-engine/          # Spec-driven module
│   │   │   ├── parser.ts
│   │   │   ├── linker.ts
│   │   │   └── executor.ts
│   │   ├── flow-engine/          # Flow execution
│   │   │   ├── executor.ts
│   │   │   ├── nodes.ts
│   │   │   └── conditions.ts
│   │   └── self-healer/          # Auto-fix system
│   │       ├── watcher.ts
│   │       ├── analyzer.ts
│   │       └── fixer.ts
│   ├── providers/                # AI provider adapters
│   │   ├── anthropic.ts
│   │   ├── openai.ts
│   │   ├── gemini.ts
│   │   └── ollama.ts
│   ├── services/                 # VS Code integrations
│   │   ├── file-service.ts
│   │   ├── terminal-service.ts
│   │   ├── workspace-service.ts
│   │   └── checkpoint-service.ts
│   └── utils/
│       ├── markdown.ts
│       ├── diff.ts
│       └── tree-sitter.ts
├── webview/                      # React UI
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Chat/
│   │   │   ├── FlowEditor/
│   │   │   ├── SpecViewer/
│   │   │   └── common/
│   │   ├── hooks/
│   │   ├── stores/
│   │   └── utils/
│   └── package.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## Security Considerations

1. **User Approval** - All file changes and commands require explicit approval
2. **Sandboxing** - Terminal commands run in isolated environment
3. **API Key Storage** - Secure storage via VS Code secrets API
4. **No Network Exposure** - Extension runs locally, no external servers

---

## Performance Targets

| Metric               | Target           |
| -------------------- | ---------------- |
| Extension activation | < 500ms          |
| UI responsiveness    | < 16ms (60 FPS)  |
| File operations      | < 100ms          |
| AI response start    | < 2s (streaming) |
| Memory usage         | < 200MB          |
