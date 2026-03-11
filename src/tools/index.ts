import type { AgentTool } from '@mariozechner/pi-agent-core';
import { getWorkspaceRoot } from './core/utils';
import { createDiagnosticsTools } from './definitions/diagnostics';
import { createFileTools } from './definitions/file';
import { createSearchTools } from './definitions/search';
import { createTerminalTools } from './definitions/terminal';
import { createWebTools } from './definitions/web';
import { createWorkspaceManagementTools } from './definitions/workspace';

export function createWorkspaceTools(): AgentTool[] {
  let workingDirectory = getWorkspaceRoot();

  const getContext = () => ({ workingDirectory });
  const setWorkingDirectory = (path: string) => {
    workingDirectory = path;
  };

  return [
    ...createFileTools(getContext),
    ...createSearchTools(getContext),
    ...createTerminalTools(getContext),
    ...createWebTools(),
    ...createDiagnosticsTools(getContext),
    ...createWorkspaceManagementTools(getContext, setWorkingDirectory),
  ];
}

const TOOL_NAME_ALIASES: Record<string, string[]> = {
  read_file: ['read', 'read_file'],
  write_file: ['write', 'write_file'],
  edit_file: ['edit', 'edit_file'],
  glob: ['glob'],
  grep: ['grep'],
  bash: ['bash'],
  fetch_url: ['fetch', 'fetch_url', 'webfetch', 'web_fetch'],
  diagnostics: ['diagnostics', 'diag', 'lint'],
  list_directory: ['list', 'list_directory'],
  set_working_directory: ['set_cwd', 'set_working_directory'],
  open_workspace: ['open_workspace', 'workspace'],
  get_context: ['get_context', 'context'],
};

const ALWAYS_ALLOWED_TOOLS = new Set(['set_working_directory', 'list_directory', 'open_workspace', 'get_context']);

export function filterToolsByAllowed(tools: AgentTool[], allowedTools: string[]): AgentTool[] {
  const normalizedAllowed = new Set(allowedTools.map((name) => name.trim().toLowerCase()));

  if (normalizedAllowed.size === 0) {
    return tools;
  }

  const filtered = tools.filter((tool) => {
    if (ALWAYS_ALLOWED_TOOLS.has(tool.name)) {
      return true;
    }
    const aliases = TOOL_NAME_ALIASES[tool.name] || [tool.name.toLowerCase()];
    return aliases.some((alias) => normalizedAllowed.has(alias));
  });

  return filtered.length > 0 ? filtered : tools;
}

export { getWorkspaceRoot } from './core/utils';
