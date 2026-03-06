# Tools Policy

## General

- Prefer tools over guessing.
- Use the minimum tool set required to solve the task.
- Keep tool calls explainable and traceable.

## Filesystem and Code

- Read before write when touching unfamiliar files.
- Avoid broad destructive edits.
- For large refactors, proceed incrementally.

## Terminal Commands

- Use fast search tools (`rg`) for discovery.
- Time-box long-running commands.
- Capture key command outcomes in the final report.

## Web

- `fetch_url`: fetch and read web page content as cleaned text.
- Use for documentation, README files, API references, package info.
- No external API required — uses built-in HTTP fetch + HTML-to-text conversion.

## Diagnostics

- `diagnostics`: read TypeScript, ESLint, and other IDE errors/warnings.
- Reads directly from VS Code — faster than running `tsc` or `eslint`.
- Filter by file path and severity level (error, warning, info, hint).

## Telegram Tools

- `telegram_send_file`: send artifacts to the active Telegram chat.
- `telegram_api_call`: call Telegram Bot API methods with JSON params.
- Use `*Path` and `*Paths` params for file uploads when supported.

## Fallback Behavior

- If a tool fails, include failure reason and retry strategy.
- If unsupported by tool, switch to nearest safe alternative.
- Before creating any new tool, compare the need against:
  - tools listed in Runtime Context ("Tools available"),
  - existing custom tools in `~/.telecode/tools`.
- Default mode for missing capabilities: create an ephemeral tool only for this run.
  - path: `~/.telecode/tools/.tmp/<tool_name>.<ext>`
  - execute it, collect output, then delete the file.
- Runtime selection for ephemeral tools:
  - use `node` (`.js`) if available,
  - otherwise use `python3` (`.py`) if available,
  - otherwise use shell by OS:
    - macOS/Linux: `bash` (`.sh`)
    - Windows: `powershell` (`.ps1`)
- Persistent tool mode (saved in `~/.telecode/tools/<tool_name>.<ext>`) should be used only when clearly reusable across future tasks.
