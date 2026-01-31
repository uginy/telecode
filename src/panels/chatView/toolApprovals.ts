import type { SessionManager } from '../../core/session/SessionManager';

export interface ToolApprovalViewState {
  sessionAllowAllTools: boolean;
  allowedTools: string[];
}

export class ToolApprovalController {
  private sessionAllowAllTools = false;
  private sessionAllowedTools = new Set<string>();

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly postState: (state: ToolApprovalViewState) => void
  ) {}

  isApproved(toolName: string, autoApprove: boolean): boolean {
    if (autoApprove) return true;
    if (this.sessionAllowAllTools) return true;
    return this.sessionAllowedTools.has(toolName);
  }

  formatApproval(toolName: string, args: Record<string, unknown>) {
    const pathArg = typeof args.path === 'string' ? args.path : '';
    const commandArg = typeof args.command === 'string' ? args.command : '';
    const queryArg = typeof args.query === 'string' ? args.query : '';

    switch (toolName) {
      case 'read_file':
        return {
          title: 'Read file contents',
          description: pathArg ? `Read ${pathArg}` : 'Read a file from workspace'
        };
      case 'list_files':
        return {
          title: 'List directory contents',
          description: pathArg ? `List ${pathArg}` : 'List workspace directory'
        };
      case 'search_files':
        return {
          title: 'Search project files',
          description: queryArg ? `Search for "${queryArg}"` : 'Search project files'
        };
      case 'run_command':
        return {
          title: 'Run terminal command',
          description: commandArg ? `Run: ${commandArg}` : 'Run a command'
        };
      case 'get_problems':
        return {
          title: 'Read diagnostics',
          description: pathArg ? `Get problems for ${pathArg}` : 'Get workspace diagnostics'
        };
      default:
        return {
          title: `Run tool: ${toolName}`,
          description: ''
        };
    }
  }

  setSessionAllowAllTools(value: boolean) {
    this.sessionAllowAllTools = value;
    const activeId = this.sessionManager.activeSessionId;
    if (activeId) {
      void this.sessionManager.setToolApprovalAllowAll(activeId, value);
    }
    this.postState({
      sessionAllowAllTools: value,
      allowedTools: Array.from(this.sessionAllowedTools)
    });
  }

  setToolApprovalForTool(toolName: string, allow: boolean) {
    const activeId = this.sessionManager.activeSessionId;
    if (!activeId || !toolName) return;

    if (allow) {
      this.sessionAllowedTools.add(toolName);
    } else {
      this.sessionAllowedTools.delete(toolName);
    }

    void this.sessionManager.setToolApprovalForTool(activeId, toolName, allow);
    this.postState({
      sessionAllowAllTools: this.sessionAllowAllTools,
      allowedTools: Array.from(this.sessionAllowedTools)
    });
  }

  syncSessionToolApprovals() {
    const activeId = this.sessionManager.activeSessionId;
    if (!activeId) {
      this.sessionAllowedTools.clear();
      this.setSessionAllowAllTools(false);
      return;
    }

    const state = this.sessionManager.getToolApprovalState(activeId);
    this.sessionAllowedTools = new Set(state.tools);
    this.setSessionAllowAllTools(state.allowAll);
  }

  clear() {
    this.sessionAllowedTools.clear();
    this.setSessionAllowAllTools(false);
  }
}
