# 🔍 AIS Code — Project Analysis

> Generated: 2026-02-22  
> Scope: Architecture, vision, strengths, weaknesses, competitive positioning

---

## 🎯 The Core Vision (What This Product Actually Is)

> A human writes a task in Telegram in their own language — messy, casual, informal.  
> The extension passes it to a powerful model that receives a full toolchain  
> and the live context of a real IDE.  
> The model works autonomously. The human gets a result.  
> The visual UI is just a log and a settings panel — not the product.

**Messenger = Interface. IDE = Context. Model = Brain. Extension = The wire between them.**

---

## 🧠 Why an Extension, Not a Standalone Bot?

This is the single most important architectural decision in the project.

```
Standalone Telegram Bot              AIS Code Extension
─────────────────────────────        ─────────────────────────────────────
❌ Has no idea what project          ✅ Sees the open workspace right now
❌ Needs SSH / explicit folder path  ✅ bash runs in the correct cwd
❌ No access to VS Code APIs         ✅ glob, grep, open files, diagnostics
❌ Doesn't know language/framework   ✅ Knows the project structure live
❌ Requires external infra           ✅ Starts together with the IDE
```

A bot without IDE context is blind. The extension gives the model eyes.

---

## 💪 Strengths

### 1. Unique Concept — Primary Differentiator

**Agent control via messengers (Telegram / WhatsApp)** — no competitor does this.
The ability to fire off a coding task from your phone, not be at the computer,
and come back to a completed result is a genuinely defensible niche.

### 2. Right Philosophical Bet on Model Power

The product does not try to hand-hold the model through approval flows and diffs.
It trusts that a capable model (Claude Sonnet, Gemini 2.0, o3) with good tools
**will simply produce the correct result**. As models get more powerful, this bet
pays off more and more. AIS Code ages well.

### 3. Dual Runtime (nanoclaw + pi)

- `nanoclaw` (via `@anthropic-ai/claude-agent-sdk`) — native Claude agent flow
- `pi` (via `@mariozechner/pi-agent-core`) — universal, multi-provider flow

Auto-selection by provider / model is a clean, user-transparent decision.

### 4. Wide Provider Support (7 providers)

OpenAI · Anthropic · Google Gemini · OpenRouter · MiniMax · Moonshot · **Ollama (local)**

OpenRouter with free-tier models lowers the barrier to zero.

### 5. Modular Prompt Stack

`soul.md`, `pro.md`, `workflow.md`, `rules.md`, `tools.md`, `memory.md` — a layered
system where prompts are first-class citizens. The extension watches `prompts/*.md`
with a `FileSystemWatcher` and hot-restarts the agent on any change.
This is unusually thoughtful for an MVP.

### 6. Solid Technical Foundation

- TypeScript strict mode throughout
- esbuild — near-instant builds and watch mode
- Watchdog — aborts after 180 s of no runtime events
- LLM fetch logger — intercepts `globalThis.fetch` for transparent debug output
- Dev auto-reload — Extension Host restarts automatically on bundle change
- Minimal 4-dependency footprint: `pi-agent-core`, `pi-ai`, `grammy`, `markdown-it`

---

## ⚠️ Weaknesses

### 🔴 Critical

**No memory / state persistence.**  
The agent forgets everything between VS Code sessions and between tasks
within the same session. For "write this feature, then test it, then refactor it"
workflows the user has to re-explain context every time.
A simple per-workspace `memory.md` that the model writes to and reads from
on startup would fix 80% of this problem.

**WhatsApp is not functional.**  
Settings and types exist, but the channel is absent from the codebase.
`whatsapp-web.js` / Baileys are historically fragile and risk getting banned.
This is technical debt that should either be shipped properly or cut from the roadmap.

### 🟡 Significant

**`extension.ts` is a God File (760 lines).**  
Lifecycle management, Telegram refresh, settings sync, dev auto-reload, progress
tracking — all in one file. Contradicts the project's own `AGENTS.md` ("Avoid God Files").
Difficult to test and extend.

**`bash` tool has `autoApprove: true` by default.**  
The model can run `rm -rf` without user confirmation. Given the autonomous-first
philosophy this may be intentional, but there should at least be a way to gate
on a configurable list of dangerous patterns.

**No VS Code diagnostics tool.**  
The model cannot see TypeScript errors, ESLint warnings, or linter output
without running a bash command. A `get_diagnostics` tool backed by
`vscode.languages.getDiagnostics()` would let the model see errors in real time,
before and after edits, without spawning a compiler.

**No AST-level editing.**  
`edit_file` is text find-and-replace. Powerful models handle this reasonably well,
but symbol-aware rename and structural refactoring remain out of reach.

### 🟠 Minor

- Zero tests — regressions are invisible until they break
- Model enum in `package.json` is already stale (hardcoded, not dynamic)

---

## 🥊 Competitive Comparison

| Criterion                    | **AIS Code**  |    **Cline**     | **Cursor** | **Roo Code** | **Continue.dev** |
| ---------------------------- | :-----------: | :--------------: | :--------: | :----------: | :--------------: |
| Autonomous agent loop        |      ✅       |        ✅        |     ✅     |      ✅      |    ⚠️ partial    |
| **Messenger remote control** | ✅ **UNIQUE** |        ❌        |     ❌     |      ❌      |        ❌        |
| Local models (Ollama)        |      ✅       |        ✅        |     ❌     |      ✅      |        ✅        |
| Provider count               |       7       |       10+        |     3      |     10+      |       10+        |
| Memory between sessions      |      ❌       | ⚠️ context files |     ✅     |      ⚠️      |        ❌        |
| Diff / Preview UI            |      ❌       |        ✅        |     ✅     |      ✅      |        ⚠️        |
| Approval flow per action     | ❌ by design  |        ✅        |     ✅     |      ✅      |        ✅        |
| Maturity / GitHub stars      |      MVP      |     40k+ ⭐      | Commercial |   15k+ ⭐    |     10k+ ⭐      |
| Price                        |     Free      |       Free       |   $20/mo   |     Free     |       Free       |

**Key insight:** Cline/Cursor optimise for _human oversight_ — the dev watches every step
and approves each change. AIS Code optimises for _human absence_ — the dev fires a task
and comes back to a result. These are different products for different trust levels.
As models improve, the "human absence" model becomes more viable every month.

---

## 📊 Scores

| Dimension               | Score        |
| ----------------------- | ------------ |
| Concept uniqueness      | **9 / 10**   |
| Architectural clarity   | **8 / 10**   |
| Code quality            | **7 / 10**   |
| Feature completeness    | **5 / 10**   |
| UX / polish             | **4 / 10**   |
| Competitive positioning | **7 / 10**   |
| **Overall**             | **6.7 / 10** |

**Verdict:** A smart, architecturally sound MVP with a clear and defensible vision.
The concept is right. Execution needs depth, not breadth.

---

## 🚀 Strategic Priorities

Trying to out-feature Cline (40k+ stars) is a losing strategy.
The right move is to make the unique value proposition irreplaceable.

### Priority 1 — Make Telegram a real two-way channel

Right now it receives tasks. It should also:

- Stream progress updates back (e.g., every N seconds: "Running tests… 3 files changed")
- Send a structured completion report (files changed, errors found, what was done)
- Accept `/stop`, `/status`, `/retry` commands mid-task
- Route clarifying questions back to the user when the task is ambiguous

### Priority 2 — Agent Memory (minimum viable, no infra)

- A `memory.md` file per workspace, written by the agent at task end
- Read automatically at task start: "Here is what I know about this project…"
- No external DB, no embedding, no vector search — just a markdown file
- Cost: ~2 hours of dev work. Impact: transforms multi-session workflows

### Priority 3 — Add `get_diagnostics` tool

```typescript
{
  name: 'get_diagnostics',
  label: 'Diagnostics',
  description: 'Get VS Code language errors and warnings for one or all files.',
  parameters: Type.Object({
    path: Type.Optional(Type.String({ description: 'File path, or omit for all workspace diagnostics' }))
  }),
  execute: async (_id, params) => {
    const typed = params as { path?: string };
    const uri = typed.path ? vscode.Uri.file(typed.path) : undefined;
    const all = uri
      ? vscode.languages.getDiagnostics(uri)
      : vscode.languages.getDiagnostics();
    // format and return
  }
}
```

This gives the model real-time awareness of compiler/linter errors
without needing to spawn a bash process.

### Priority 4 — Refactor `extension.ts`

Extract into focused modules:

```
src/
  agentManager.ts      — runtime lifecycle (start / stop / restart)
  telegramManager.ts   — messenger channel management
  configManager.ts     — settings read / save / sync to views
  devReload.ts         — dev auto-reload watcher
  progressTracker.ts   — status bar, timers, heartbeat
  extension.ts         — thin orchestrator (~100 lines)
```

---

## 💡 Positioning Statement (for README or pitch)

> AIS Code is not a coding assistant. It is an autonomous coding agent  
> that lives inside your IDE and takes orders from your messenger.  
> You give it a task, it uses your entire development environment  
> to complete it — while you do something else.

---

_Analysis by Claude Sonnet · February 2026_
