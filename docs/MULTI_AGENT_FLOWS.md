# AIS Code - Multi-Agent Flow System

## Overview

The Multi-Agent Flow System is a visual workflow editor that allows users to design, configure, and execute custom agent pipelines. Inspired by n8n, it provides a node-based interface for connecting agents and actions.

---

## Core Concepts

### Nodes

Nodes are the building blocks of a flow. Each node represents either an agent or an action.

```typescript
interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

enum NodeType {
  TRIGGER = "trigger", // User input, file change, webhook
  AGENT = "agent", // AI agent (Coder, Reviewer, etc.)
  ACTION = "action", // Tool execution (file, terminal)
  CONDITION = "condition", // If/else branching
  MERGE = "merge", // Combine multiple paths
  OUTPUT = "output", // Final result
}
```

### Edges

Edges connect nodes and define data flow.

```typescript
interface FlowEdge {
  id: string;
  source: string; // Source node ID
  target: string; // Target node ID
  sourceHandle?: string; // For condition nodes (true/false)
  data?: {
    label?: string;
    condition?: string; // For conditional edges
  };
}
```

### Variables

Flows can define variables that are passed between nodes.

```typescript
interface FlowVariable {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  value: any;
  scope: "global" | "task";
}
```

---

## Node Types

### 1. Trigger Nodes

Start the flow execution.

```
┌─────────────────────────┐
│  🚀 User Input          │
│  ─────────────────────  │
│  Message: [input field] │
│  Attachments: [files]   │
│                    [out]├────▶
└─────────────────────────┘

┌─────────────────────────┐
│  📁 File Change         │
│  ─────────────────────  │
│  Pattern: *.ts          │
│  Events: create, modify │
│                    [out]├────▶
└─────────────────────────┘

┌─────────────────────────┐
│  ⏰ Schedule            │
│  ─────────────────────  │
│  Cron: 0 9 * * *        │
│                    [out]├────▶
└─────────────────────────┘
```

### 2. Agent Nodes

AI agents that process and generate content.

```
         ┌─────────────────────────┐
────▶[in]│  🏗️ Architect Agent    │
         │  ─────────────────────  │
         │  Model: Claude 3.5      │
         │  System: [custom]       │
         │                    [out]├────▶
         └─────────────────────────┘

         ┌─────────────────────────┐
────▶[in]│  💻 Coder Agent         │
         │  ─────────────────────  │
         │  Model: GPT-4           │
         │  Language: TypeScript   │
         │                    [out]├────▶
         └─────────────────────────┘

         ┌─────────────────────────┐
────▶[in]│  🔍 Reviewer Agent      │
         │  ─────────────────────  │
         │  Checklist: [config]    │
         │  Severity: medium       │
         │                    [out]├────▶
         └─────────────────────────┘
```

### 3. Action Nodes

Execute specific operations.

```
         ┌─────────────────────────┐
────▶[in]│  📄 Read File          │
         │  ─────────────────────  │
         │  Path: {{filepath}}     │
         │                    [out]├────▶ (file content)
         └─────────────────────────┘

         ┌─────────────────────────┐
────▶[in]│  ✏️ Write File         │
         │  ─────────────────────  │
         │  Path: {{filepath}}     │
         │  Content: {{content}}   │
         │                    [out]├────▶
         └─────────────────────────┘

         ┌─────────────────────────┐
────▶[in]│  🖥️ Terminal           │
         │  ─────────────────────  │
         │  Command: npm test      │
         │  Timeout: 60s           │
         │                    [out]├────▶ (stdout/stderr)
         └─────────────────────────┘
```

### 4. Condition Nodes

Branch based on conditions.

```
                       ┌─[true]──▶
         ┌─────────────────────────┐
────▶[in]│  ❓ Condition           │
         │  ─────────────────────  │
         │  If: {{result.hasErrors}}│
         │                         │
         └─────────────────────────┘
                       └─[false]─▶
```

### 5. Merge Nodes

Combine multiple flow paths.

```
────▶[in1]┐
          │  ┌─────────────────────────┐
────▶[in2]├──│  🔀 Merge               │[out]├────▶
          │  │  ─────────────────────  │
────▶[in3]┘  │  Mode: wait_all / any   │
             └─────────────────────────┘
```

---

## Example Flows

### Flow 1: Basic Code Review

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  📁          │     │  🔍          │     │  ❓          │     │  📝          │
│  File Change │────▶│  Reviewer    │────▶│  Has Issues? │─Yes▶│  Comment     │
│              │     │  Agent       │     │              │     │  on PR       │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 No
                                                 ▼
                                          ┌──────────────┐
                                          │  ✅          │
                                          │  Approve PR  │
                                          └──────────────┘
```

### Flow 2: Spec-Driven Development

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  🚀          │     │  🏗️          │     │  📄          │
│  User Input  │────▶│  Architect   │────▶│  Save Specs  │
│              │     │  Agent       │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                ▼
                                          ┌──────────────┐
                                          │  🔄          │
                           ┌─────────────│  For Each    │
                           │              │  Task        │
                           ▼              └──────────────┘
                    ┌──────────────┐            │
                    │  💻          │            │
                    │  Coder Agent │◀───────────┘
                    │              │
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐     ┌──────────────┐
                    │  🔍          │     │  🔧          │
                    │  Reviewer    │─Fix▶│  Fixer Agent │
                    │              │     │              │
                    └──────────────┘     └──────────────┘
                           │
                          OK
                           ▼
                    ┌──────────────┐
                    │  ✅          │
                    │  Complete    │
                    └──────────────┘
```

### Flow 3: Self-Healing Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  🖥️          │     │  ❓          │     │  🔧          │
│  Run Tests   │────▶│  Tests Pass? │─No─▶│  Fixer Agent │─┐
│              │     │              │     │              │ │
└──────────────┘     └──────────────┘     └──────────────┘ │
                           │                               │
                          Yes                              │
                           ▼                               │
                    ┌──────────────┐                       │
                    │  ✅          │                       │
                    │  Deploy      │                       │
                    └──────────────┘                       │
                                                           │
         ┌──────────────┐                                  │
         │  🖥️          │◀─────────────────────────────────┘
         │  Run Tests   │ (retry loop)
         │              │
         └──────────────┘
```

---

## Flow Editor UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Flow Editor: Code Review Pipeline                          💾 Save  ▶️ Run │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────┐                                                                │
│ │ Triggers │  ┌─────────────────────────────────────────────────────────┐  │
│ │ ────────── │  │                                                         │  │
│ │ 🚀 Input   │  │     ┌───────┐      ┌───────┐      ┌───────┐           │  │
│ │ 📁 File    │  │     │ Input │─────▶│ Coder │─────▶│Review │           │  │
│ │ ⏰ Cron    │  │     └───────┘      └───────┘      └───────┘           │  │
│ ├──────────┤  │                                          │              │  │
│ │ Agents   │  │                                          ▼              │  │
│ │ ────────── │  │                                    ┌───────┐           │  │
│ │ 🏗️ Arch   │  │                                    │Output │           │  │
│ │ 💻 Coder  │  │                                    └───────┘           │  │
│ │ 🔍 Review │  │                                                         │  │
│ │ 🔧 Fixer  │  │                                                         │  │
│ ├──────────┤  │  ┌─────────────────────────┐                            │  │
│ │ Actions  │  │  │ 🔍 Reviewer Agent       │ ← Selected Node            │  │
│ │ ────────── │  │  │ ─────────────────────── │                            │  │
│ │ 📄 Read   │  │  │ Model: Claude 3.5       │                            │  │
│ │ ✏️ Write  │  │  │ Checklist: [Edit]       │                            │  │
│ │ 🖥️ Term   │  │  │ Auto-fix: ✅ Enabled    │                            │  │
│ └──────────┘  │  └─────────────────────────┘                            │  │
│               └─────────────────────────────────────────────────────────┘  │
│                                                             🗺️ Mini-map   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow Execution Engine

```typescript
class FlowExecutor {
  private flow: Flow;
  private context: ExecutionContext;
  private status: Map<string, NodeStatus>;

  async execute(input: any): Promise<ExecutionResult> {
    // 1. Find trigger nodes
    const triggers = this.findNodes("trigger");

    // 2. Execute in topological order
    for await (const node of this.topologicalTraverse(triggers)) {
      // Get inputs from connected nodes
      const inputs = this.gatherInputs(node);

      // Execute node
      const output = await this.executeNode(node, inputs);

      // Store output for downstream nodes
      this.context.set(node.id, output);

      // Update status
      this.status.set(node.id, "completed");

      // Emit progress event
      this.emit("nodeCompleted", { node, output });
    }

    // 3. Gather final outputs
    return this.gatherOutputs();
  }

  private async executeNode(node: FlowNode, inputs: any): Promise<any> {
    switch (node.type) {
      case "agent":
        return this.executeAgent(node, inputs);
      case "action":
        return this.executeAction(node, inputs);
      case "condition":
        return this.evaluateCondition(node, inputs);
      // ... etc
    }
  }
}
```

---

## Persistence

Flows are stored as JSON files:

```json
{
  "id": "flow_abc123",
  "name": "Code Review Pipeline",
  "version": 1,
  "nodes": [
    {
      "id": "trigger_1",
      "type": "trigger",
      "position": { "x": 100, "y": 200 },
      "data": {
        "triggerType": "file_change",
        "pattern": "*.ts"
      }
    },
    {
      "id": "agent_1",
      "type": "agent",
      "position": { "x": 300, "y": 200 },
      "data": {
        "agentType": "reviewer",
        "model": "claude-3-5-sonnet",
        "config": {}
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "trigger_1",
      "target": "agent_1"
    }
  ],
  "variables": []
}
```

---

## Built-in Flow Templates

1. **Simple Chat** - Basic conversation with one agent
2. **Code Review** - Automatic code review on changes
3. **Spec-Driven** - Full spec → code → review pipeline
4. **Test-Driven** - Write tests first, then implementation
5. **Debug Assistant** - Error analysis and fix suggestion

---

## Future Enhancements

- **Sub-flows** - Reusable flow components
- **Parallel execution** - Run branches concurrently
- **Error handling** - Try/catch nodes
- **Loops** - Iterate over collections
- **Webhooks** - External triggers
- **Sharing** - Export/import flow definitions
