# AIS Code - Project Progress

A specialized AI coding assistant for VS Code.

## 📋 Iteration Status

### ✅ Iteration 1: Foundation (Completed)

- [x] Basic VS Code extension scaffolding.
- [x] Webview UI with React & Tailwind (Chat interface).
- [x] Integration with `openai-compatible` providers.
- [x] Basic syntax highlighting for code blocks.

### ✅ Iteration 2: Providers & Reliability (Completed)

- [x] **OpenRouter Support**: Dynamic model fetching and filtering (Free/Paid).
- [x] **Native Networking**: Switched to `https` module to bypass Google Cloud Code proxy interferences.
- [x] **Enhanced Settings**: In-webview settings panel with real-time configuration updates.

### ✅ Iteration 3: Context & Diff View (Completed)

- [x] **`@` Mention System**: Architecture for file and problem search.
- [x] **Diff Provider**: Virtual document provider for side-by-side reviews.
- [x] **Diff UI**: "Review" button in code blocks.
- [x] **Bug Fixes**: Resolve issue where `@` menu doesn't appear for some users.
- [x] **Bug Fixes**: Improve Markdown parsing for LLM responses (ensure code blocks are always detected).

### 🚀 Upcoming Features

- [x] **Direct Apply**: One-click "Apply" button to merge changes from Diff View.
- [ ] **Terminal Context**: Ability to `@terminal` to include last output in context.
- [ ] **History Persistence**: Save conversations to local storage.
- [ ] **Indexing**: Better file search using workspace indexing (for large projects).

## 🛠 Current Debug Logs

- **Output Channel**: Check `View -> Output -> AIS Code` for backend logs.
- **Webview Logs**: Open `Help -> Toggle Developer Tools` to see frontend message tracing.
