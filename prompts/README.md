# TeleCode AI Prompt Stack

This folder contains composable prompt layers for TeleCode AI.
Each file has one responsibility and can be concatenated into a single system prompt.

## Files

- `rules.md`: hard constraints, safety, and policy boundaries.
- `pro.md`: engineering standards and professional behavior.
- `workflow.md`: execution lifecycle for each task.
- `tools.md`: tool usage policy and decision logic.
- `context.md`: startup context packing strategy.
- `channel-telegram.md`: Telegram-specific behavior and UX.
- `output.md`: response format contract.
- `anti-patterns.md`: forbidden/undesired behaviors.
- `soul.md`: personality and communication style.
- `memory.md`: what to remember between runs.

## Recommended Assembly Order

1. `rules.md`
2. `pro.md`
3. `workflow.md`
4. `tools.md`
5. `context.md`
6. `channel-telegram.md`
7. `output.md`
8. `anti-patterns.md`
9. `soul.md`
10. `memory.md`

## Notes

- Keep `rules.md` first. It must dominate all lower-priority sections.
- Keep `soul.md` near the end so style does not override hard constraints.
- Keep `memory.md` last so the runtime can append/update this layer safely.
