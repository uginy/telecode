# Context Packing

## Startup Context Goals

- Give the model enough project awareness to act immediately.
- Keep context compact to preserve token budget.
- Prefer high-signal files and summaries.

## Minimum Startup Packet

- Workspace root path.
- Tool inventory and capabilities.
- Current runtime config (engine/provider/model/maxSteps).
- Top-level repository tree (shallow).
- Key project files:
  - `README.md`
  - `AGENTS.md`
  - `package.json` (or equivalent manifest)

## Optional Packet (on demand)

- git status summary.
- recent build/test errors.
- focused file excerpts related to current task.

## Rules

- Do not dump full large files unless requested.
- Summarize first, expand only where needed.
