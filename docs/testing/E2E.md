# E2E Webview Tests

This is a **real UI** check that drives VS Code + the AIS Code webview and validates that a user can send a message and receive an assistant response.

## Requirements
- Install Playwright: `bun add -d playwright` (or `npm i -D playwright`).
- Provide API settings via test profile env vars.

## Environment variables
```bash
export AIS_CODE_TEST_PROVIDER=openrouter
export AIS_CODE_TEST_OPENROUTER_API_KEY="sk-or-..."
export AIS_CODE_TEST_OPENROUTER_MODEL="arcee-ai/trinity-large-preview:free"
```

## Run
```bash
node scripts/e2e-webview.mjs --workspace=tests/fixtures/real-project
```

## What it validates
- VS Code launches with the extension.
- Chat view opens via command palette.
- Webview renders.
- User can send a message in the UI.
- Assistant message appears.

This is intentionally minimal and can be expanded into multi‑step flows later.
