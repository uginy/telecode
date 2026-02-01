# LLM setup for real test runs

For real regression runs, we use the **current provider and model already saved in the project settings**.
API keys must remain local (do not commit them).

Recommended default model (OpenRouter):

```
z-ai/glm-4.5-air:free
```

Alternatives for comparison:

```
arcee-ai/trinity-large-preview:free
tngtech/deepseek-r1t2-chimera:free
```

## Test profile (real LLM)

For automated runs, you can use a dedicated test profile without touching your local VS Code settings.

Set environment variables before running smoke flows:

```bash
export AIS_CODE_TEST_PROVIDER=openrouter
export AIS_CODE_TEST_OPENROUTER_API_KEY="sk-or-..."
export AIS_CODE_TEST_OPENROUTER_MODEL="arcee-ai/trinity-large-preview:free"
```

The smoke runner writes a temporary settings file to `.vscode-test/user-data/User/settings.json`.

## Checklist
- Provider selected in Settings (or via test profile).
- Model ID set in Settings (or via test profile).
- API key stored locally.
