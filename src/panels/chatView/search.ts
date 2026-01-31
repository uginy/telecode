import * as vscode from 'vscode';

export async function handleSearchFiles(
  view: vscode.WebviewView | undefined,
  query: string
) {
  if (!view) return;

  const results: { type: 'file' | 'folder' | 'terminal'; label: string; value: string }[] = [];

  const pattern = query ? `**/*${query}*` : '**/*';
  const exclude = '{**/node_modules/**,**/dist/**,**/.git/**,**/out/**,**/build/**}';

  try {
    const files = await vscode.workspace.findFiles(pattern, exclude, 15);
    results.push(
      ...files.map(uri => ({
        type: 'file' as const,
        label: vscode.workspace.asRelativePath(uri),
        value: vscode.workspace.asRelativePath(uri)
      }))
    );

    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        if (!query || folder.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            type: 'folder' as const,
            label: folder.name,
            value: folder.uri.fsPath
          });
        }
      }
    }

    const terminals = vscode.window.terminals;
    for (const term of terminals) {
      if (!query || term.name.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          type: 'terminal' as const,
          label: term.name,
          value: term.name
        });
      }
    }

    view.webview.postMessage({
      type: 'searchResults',
      results
    });
  } catch (e) {
    console.error('Search files error:', e);
    view.webview.postMessage({ type: 'searchResults', results: [] });
  }
}

export async function handleResolveContextItems(
  view: vscode.WebviewView | undefined,
  paths: string[]
) {
  if (!view) return;
  const items: { type: 'file' | 'folder' | 'terminal'; label: string; value: string }[] = [];

  for (const p of paths) {
    try {
      let uri = vscode.Uri.parse(p);

      if (uri.scheme !== 'file' && !p.startsWith('file:')) {
        uri = vscode.Uri.file(p);
      }

      const stat = await vscode.workspace.fs.stat(uri);
      const relativePath = vscode.workspace.asRelativePath(uri);

      if (stat.type === vscode.FileType.Directory) {
        items.push({ type: 'folder', label: relativePath, value: uri.fsPath });
      } else {
        items.push({ type: 'file', label: relativePath, value: relativePath });
      }
    } catch (e) {
      console.warn('Failed to resolve path:', p, e);
    }
  }

  view.webview.postMessage({
    type: 'addContextItems',
    items
  });
}
