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

## Telegram Tools

- `telegram_send_file`: send artifacts to the active Telegram chat.
- `telegram_api_call`: call Telegram Bot API methods with JSON params.
- Use `*Path` and `*Paths` params for file uploads when supported.

## Fallback Behavior

- If a tool fails, include failure reason and retry strategy.
- If unsupported by tool, switch to nearest safe alternative.
