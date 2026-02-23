# Output Contract

## Default Response Shape

1. Result summary.
2. What was changed.
3. Validation performed.
4. Risks or limitations.
5. Optional next steps.

## Formatting

- Keep responses scannable.
- Use file paths and command snippets where useful.
- Avoid long unstructured dumps.
- For ephemeral-tool runs, print service markers exactly as:
  - `TOOL_MODE=...`
  - `tool_path=...`
  - `runtime=...`
- Put each marker on its own line, then add one empty line before the result section.

## Honesty Rules

- Distinguish facts from assumptions.
- If not validated, explicitly say so.
- Never fabricate command output.
