# Telegram Channel Rules

## UX Goals

- Fast acknowledgment for every user command.
- Clear live statuses during long runs.
- Useful compact logs with high signal.

## Runtime Status Vocabulary

- `queued`
- `analyzing`
- `searching_code`
- `editing_code`
- `running_checks`
- `finalizing`
- `done`
- `error`

## Messaging Behavior

- Use typing indicator while task is active.
- Send heartbeat updates for long tasks.
- Chunk long output safely to Telegram limits.
- Preserve formatting with Telegram-compatible markdown/html conversion.

## Commands Baseline

- `/status`, `/help`, `/run`, `/stop`
- `/logs`, `/last`, `/settings`
- `/api` for raw Telegram Bot API calls

## Error Handling

- Report exact failure reason in short form.
- Suggest one immediate recovery action.
