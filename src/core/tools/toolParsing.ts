import type { ToolCall } from '../types';

export function parseToolCalls(content: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  const blockToolRegex = /<(write_file|replace_in_file|read_file|list_files|run_command|search_files|codebase_search|get_problems)(?:\s+path\s*=\s*"([^"]+)")?\s*>([\s\S]*?)<\/\1>/g;
  const selfClosingRegex = /<(read_file|list_files|get_problems)\s+path\s*=\s*"([^"]+)"\s*\/>/g;

  const getPathArg = (call: ToolCall) => {
    try {
      const parsed = JSON.parse(call.arguments) as { path?: string | null };
      return parsed.path ?? undefined;
    } catch {
      return undefined;
    }
  };

  let match: RegExpExecArray | null;
  while ((match = blockToolRegex.exec(content)) !== null) {
    const tagName = match[1];
    const pathAttr = match[2];
    const innerContent = match[3] ?? '';

    const args: Record<string, unknown> = {};
    const trimmed = innerContent.trim();

    if (pathAttr) {
      args.path = pathAttr;
    } else if (trimmed && (tagName === 'read_file' || tagName === 'list_files' || tagName === 'get_problems')) {
      args.path = trimmed;
    } else if (tagName === 'list_files') {
      args.path = '.';
    }

    switch (tagName) {
      case 'write_file':
      case 'replace_in_file':
        args.content = innerContent;
        break;
      case 'run_command':
        args.command = innerContent;
        break;
      case 'search_files':
        args.query = innerContent;
        break;
      case 'codebase_search': {
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed) as { query?: string; path?: string | null };
            if (parsed.query) {
              args.query = parsed.query;
            }
            if ('path' in parsed) {
              args.path = parsed.path ?? null;
            }
          } catch {
            args.query = innerContent;
          }
        } else {
          args.query = innerContent;
        }
        break;
      }
      default:
        break;
    }

    toolCalls.push({
      id: crypto.randomUUID(),
      name: tagName,
      arguments: JSON.stringify(args),
      timestamp: Date.now()
    });
  }

  let sMatch: RegExpExecArray | null;
  while ((sMatch = selfClosingRegex.exec(content)) !== null) {
    const tagName = sMatch[1];
    const pathAttr = sMatch[2];
    const args: Record<string, unknown> = {};
    if (pathAttr) {
      args.path = pathAttr;
    } else if (tagName === 'list_files') {
      args.path = '.';
    }

    if (toolCalls.some((call) => call.name === tagName && getPathArg(call) === (args.path ?? undefined))) {
      continue;
    }

    toolCalls.push({
      id: crypto.randomUUID(),
      name: tagName,
      arguments: JSON.stringify(args),
      timestamp: Date.now()
    });
  }

  if (content.includes('<get_problems />') || content.includes('<get_problems/>')) {
    if (!toolCalls.some((tc) => tc.name === 'get_problems')) {
      toolCalls.push({
        id: crypto.randomUUID(),
        name: 'get_problems',
        arguments: JSON.stringify({}),
        timestamp: Date.now()
      });
    }
  }

  if (content.includes('<list_files />') || content.includes('<list_files/>')) {
    if (!toolCalls.some((tc) => tc.name === 'list_files' && getPathArg(tc) === '.')) {
      toolCalls.push({
        id: crypto.randomUUID(),
        name: 'list_files',
        arguments: JSON.stringify({ path: '.' }),
        timestamp: Date.now()
      });
    }
  }

  return toolCalls;
}
