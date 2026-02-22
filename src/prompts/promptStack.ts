import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROMPT_FILES = [
  'rules.md',
  'pro.md',
  'workflow.md',
  'tools.md',
  'context.md',
  'channel-telegram.md',
  'output.md',
  'anti-patterns.md',
  'soul.md',
  'memory.md',
] as const;

type PromptLayerName = (typeof PROMPT_FILES)[number];

export interface PromptStackBuildResult {
  prompt: string;
  signature: string;
  source: 'stack' | 'fallback';
  layerCount: number;
  missing: PromptLayerName[];
}

export interface PromptToolDescriptor {
  name: string;
  description?: string;
}

type LoadedLayer = {
  name: PromptLayerName;
  content: string;
};

function trimToolDescription(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return '';
  }

  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function formatToolInventory(tools: PromptToolDescriptor[]): string {
  if (tools.length === 0) {
    return 'No tools are available.';
  }

  const summaries = tools.slice(0, 40).map((tool) => {
    const description = trimToolDescription((tool as { description?: unknown }).description);
    return description ? `${tool.name} (${description})` : tool.name;
  });

  if (tools.length > summaries.length) {
    summaries.push(`...and ${tools.length - summaries.length} more`);
  }

  return summaries.join('; ');
}

function loadPromptLayers(cwd: string): { layers: LoadedLayer[]; missing: PromptLayerName[] } {
  const dir = path.join(cwd, 'prompts');
  const layers: LoadedLayer[] = [];
  const missing: PromptLayerName[] = [];

  for (const name of PROMPT_FILES) {
    const filePath = path.join(dir, name);
    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (content.length > 0) {
        layers.push({ name, content });
      } else {
        missing.push(name);
      }
    } catch {
      missing.push(name);
    }
  }

  return { layers, missing };
}

function buildFallbackPrompt(maxSteps: number, tools: PromptToolDescriptor[], cwd?: string, responseStyle?: string, language?: string, allowOutOfWorkspace?: boolean): string {
  const workspaceHint = typeof cwd === 'string' && cwd.trim().length > 0 ? cwd.trim() : '(unknown)';
  const toolInventory = formatToolInventory(tools);
  const outOfWorkspaceInstruction = allowOutOfWorkspace 
    ? 'You ARE allowed to access files and run commands outside the workspace root.' 
    : 'You are restricted to the workspace root. Enable "aisCode.allowOutOfWorkspace" to access files outside.';

  const styleInstruction = responseStyle === 'detailed' 
    ? 'Provide detailed, comprehensive answers with full explanations.' 
    : responseStyle === 'normal' 
      ? 'Provide normal, balanced answers.'
      : 'Provide extremely concise answers, only most critical info, no fluff.';

  return [
    'You are AIS Code, an autonomous coding agent inside VS Code.',
    'Prefer workspace tools over speculation. Keep changes minimal and high quality.',
    'When editing files, avoid unnecessary rewrites and preserve existing style.',
    `Workspace root: ${workspaceHint}.`,
    `Available tools: ${toolInventory}.`,
    'Use available tools first; do not claim actions you did not execute.',
    `Do not exceed ${maxSteps} tool-assisted reasoning steps for a single task.`,
    `Response style: ${styleInstruction}`,
    `Language: ${language === 'auto' ? "Detect the language of the user's query and ALWAYS respond in that SAME language." : `ALWAYS respond to the USER in ${language === 'en' ? 'English' : 'Russian'}.`}`,
    outOfWorkspaceInstruction
  ].join(' ');
}

export function getPromptStackSignature(cwd: string): string {
  const hash = crypto.createHash('sha1');
  const dir = path.join(cwd, 'prompts');

  for (const name of PROMPT_FILES) {
    const filePath = path.join(dir, name);
    hash.update(name);
    try {
      const stat = fs.statSync(filePath);
      hash.update(String(stat.size));
      hash.update(String(stat.mtimeMs));
      hash.update(fs.readFileSync(filePath));
    } catch {
      hash.update('missing');
    }
  }

  return hash.digest('hex').slice(0, 16);
}

export function buildComposedSystemPrompt(options: {
  cwd?: string;
  maxSteps: number;
  tools: PromptToolDescriptor[];
  responseStyle?: 'concise' | 'normal' | 'detailed';
  language?: 'ru' | 'en' | 'auto';
  allowOutOfWorkspace?: boolean;
}): PromptStackBuildResult {
  const cwd = typeof options.cwd === 'string' && options.cwd.trim().length > 0 ? options.cwd : process.cwd();
  const { layers, missing } = loadPromptLayers(cwd);
  const signature = getPromptStackSignature(cwd);
  const workspaceHint = cwd;
  const toolInventory = formatToolInventory(options.tools);

  const styleInstruction = options.responseStyle === 'detailed' 
    ? '- Provide detailed, comprehensive answers with full explanations.' 
    : options.responseStyle === 'normal' 
      ? '- Provide normal, balanced answers.'
      : '- Provide extremely concise answers, only most critical info, no fluff.';

  const runtimeLayer = [
    '# Runtime Context',
    `- Workspace root: ${workspaceHint}`,
    `- Max steps: ${options.maxSteps}`,
    `- Response style: ${options.responseStyle || 'concise'}`,
    styleInstruction,
    `- Language: ${options.language === 'auto' ? "Detect the language of the user's query and ALWAYS respond in that SAME language." : `ALWAYS respond to the USER in ${options.language === 'en' ? 'English' : 'Russian'}.`}`,
    `- Tools available: ${toolInventory}`,
    `- Out of Workspace allowed: ${options.allowOutOfWorkspace === true ? 'YES' : 'NO'}`,
    '- Always prefer actual tool execution over speculation.',
  ].join('\n');

  if (layers.length === 0) {
    return {
      prompt: buildFallbackPrompt(options.maxSteps, options.tools, cwd, options.responseStyle, options.language, options.allowOutOfWorkspace),
      signature,
      source: 'fallback',
      layerCount: 0,
      missing,
    };
  }

  const stackPrompt = layers
    .map((layer) => `\n\n# Layer: ${layer.name}\n${layer.content}`)
    .join('')
    .trim();

  const prompt = `${stackPrompt}\n\n${runtimeLayer}`.trim();

  return {
    prompt,
    signature,
    source: 'stack',
    layerCount: layers.length,
    missing,
  };
}
