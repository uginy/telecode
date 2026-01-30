export type ContextType = 'file' | 'folder' | 'terminal' | 'problems' | 'git' | 'selection';

export interface ContextItem {
  id: string;
  name: string;
  description?: string;
  type: ContextType;
  path: string; // Absolute path or identifier
  content?: string; // Loaded content (optional)
  icon?: string; // VS Code icon name (e.g., 'file-code', 'terminal')
}

export interface SearchContextRequest {
  query: string;
  type?: ContextType[];
}

export interface SearchContextResponse {
  items: ContextItem[];
}
