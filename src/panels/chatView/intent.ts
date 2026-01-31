import type { Message } from '../../core/types';
import type { ProviderAdapter } from '../../core/providers/ProviderAdapter';
import type { CompletionOverrides } from '../../providers/base';
import type { ContextStrategy } from './contextBuilder';

export interface IntentResult {
  intent: string;
  confidence: number;
  requireCodeContext: boolean;
  strategy?: ContextStrategy;
}

const SYSTEM_PROMPT = `You are a routing micro-model for a VS Code coding assistant.
Return ONLY a single JSON object, no extra text.
Schema:
{
  "intent": "project_overview" | "code_edit" | "debug" | "explain" | "test" | "search" | "general",
  "confidence": 0 to 1,
  "requireCodeContext": boolean,
  "strategy": {
    "useOpenTabs": boolean,
    "useTerminals": boolean,
    "useSearch": boolean,
    "useSemantic": boolean
  }
}
Rules:
- If user asks what the project is about, prefer project_overview, requireCodeContext=false, and useOpenTabs/useSearch/useSemantic=false.
- If user asks to edit/fix/change code, use code_edit and requireCodeContext=true.
- If user asks to explain code, use explain and requireCodeContext=true.
- If user mentions errors/logs/terminal output, use debug and useTerminals=true.
- If user asks to find something in codebase, use search and useSearch/useSemantic=true.
- Language can be any; infer intent from meaning.
Respond with JSON only.`;

function extractJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeStrategy(input: unknown): ContextStrategy | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Record<string, unknown>;
  const strategy: ContextStrategy = {};

  if (typeof raw.useOpenTabs === 'boolean') strategy.useOpenTabs = raw.useOpenTabs;
  if (typeof raw.useTerminals === 'boolean') strategy.useTerminals = raw.useTerminals;
  if (typeof raw.useSearch === 'boolean') strategy.useSearch = raw.useSearch;
  if (typeof raw.useSemantic === 'boolean') strategy.useSemantic = raw.useSemantic;

  return Object.keys(strategy).length > 0 ? strategy : undefined;
}

export async function inferIntent(
  provider: ProviderAdapter,
  text: string,
  overrides?: CompletionOverrides
): Promise<IntentResult> {
  const messages: Message[] = [
    {
      id: 'intent-system',
      role: 'system',
      content: SYSTEM_PROMPT,
      timestamp: Date.now()
    },
    {
      id: 'intent-user',
      role: 'user',
      content: text,
      timestamp: Date.now()
    }
  ];

  try {
    const raw = await provider.complete(messages, { stream: false, overrides });
    const output = typeof raw === 'string' ? raw : '';
    const parsed = extractJson(output);

    if (!parsed) {
      return {
        intent: 'general',
        confidence: 0,
        requireCodeContext: false
      };
    }

    const intent = typeof parsed.intent === 'string' ? parsed.intent : 'general';
    const confidence = typeof parsed.confidence === 'number'
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0;
    const requireCodeContext = Boolean(parsed.requireCodeContext);
    const strategy = normalizeStrategy(parsed.strategy);

    return { intent, confidence, requireCodeContext, strategy };
  } catch {
    return {
      intent: 'general',
      confidence: 0,
      requireCodeContext: false
    };
  }
}
