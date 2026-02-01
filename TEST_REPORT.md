# AIS Code — Test Report (2026-02-01)

## What was run
- Golden flows (non‑real): 29/29
- Real LLM flows: 4/4
- Edge regressions: 6/6
- AAA mega‑refactor: 1/1 (tag @aaa)
- Total: 40/40 scenarios

## How results are verified (criteria)
The current runner is **not a full UI automation**. It validates a realistic proxy of user behavior through the extension API and tool pipeline.

### 1) Structural validation (all flows)
- For each scenario, the runner checks that the feature file has at least one **When** and **Then** step. 
- This ensures the scenario is actionable and has an expected outcome.

### 2) Real LLM validation (tag: @real)
For real LLM scenarios, the runner actually sends a message to the extension and verifies outcomes:
- **Tool usage**: which tools were called (e.g. `read_file`, `replace_in_file`, `write_file`).
- **File system results**: the resulting file content after the tool ran.
- **Answer content**: the assistant reply includes expected keywords or phrases.

Concrete checks used right now:
- `real-create-doc`: file `REAL_TEST_DOC.md` exists with exact content.
- `real-fix-add`: `src/math.ts` contains `return a + b` after tool calls.
- `real-refactor-rename`: `src/strings.ts` no longer contains `badName` and includes `goodName`.
- `real-summary-readme`: response contains at least one of `fixture / AIS Code / test / tests`.

### 3) Golden / Edge flows (non‑real)
These are **spec‑level flows**, used for regression coverage:
- They verify the scenario structure and intent, but **do not run full UI or LLM** by default.
- They are intended to be the authoritative “contract” for future automation.

## Gaps vs manual user behavior
What we do NOT fully simulate yet:
- Actual UI events (clicking buttons, scrolling behavior, tool timeline rendering).
- Confirmation dialogs and auto‑approval in the real UI layer.
- Human‑like pacing or multi‑turn conversation state in the Webview.

## Next step to make it closer to manual testing
If you want true “user‑level” coverage, we should add a UI automation layer:
- Launch Extension Host + drive Webview UI
- Simulate user input and verify rendered tool timeline, statuses, and confirmations
- Compare against golden snapshots (DOM or screenshot)

That will move us from “spec & tool‑level validation” to “end‑to‑end UI validation.”

## E2E status
✅ Added Webview E2E harness: `scripts/e2e-webview.mjs` (see `docs/testing/E2E.md`).  
✅ Executed Webview E2E run against the real fixture workspace.

### E2E command
- `node scripts/e2e-webview.mjs --workspace=tests/fixtures/real-project --timeout=180000`

### E2E result
- PASS (see console log: `E2E PASS: webview chat scenario completed.`)

## Commands used
- Golden: `node scripts/flows-smoke.mjs --tags=@golden --exclude=@real`
- Edge: `node scripts/flows-smoke.mjs --tags=@edge`
- Real LLM: `node scripts/flows-smoke.mjs --tags=@real --real-llm --workspace=tests/fixtures/real-project`

## Logs
- `.vscode-test/logs/flows-smoke.log`
- `.vscode-test/logs/llm-openrouter.log` (real HTTP requests with timestamps, model, duration)

## Latest full real run (2026-02-01)
- Command: `node scripts/flows-smoke.mjs --real-llm`
- Result: 39/39 scenarios completed, real LLM scenarios executed (4/4)
- Log entry: see the last run block in `.vscode-test/logs/flows-smoke.log`

## Latest run update (2026-02-01)
- Full flows run: PASS (40/40, includes @aaa)
- Webview E2E: PASS (see console log `E2E PASS: webview chat scenario completed.`)
- Notes: VS Code reported file watcher warnings on `/Volumes/Ext1tb/...` (network share), not affecting test outcomes

## AAA mega‑refactor (2026-02-01)
- Command: `node scripts/flows-smoke.mjs --real-llm --tags=@aaa --delay=5000 --batch=1 --batch-delay=15000`
- Result: PASS (1/1)
- Artifacts: `tests/results/aaa/unknown-model/2026-02-01T21-59-31-827Z/`
- E2E render check: `node scripts/e2e-aaa-landing.mjs` → PASS
