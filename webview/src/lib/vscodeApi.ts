declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

// Single cached VS Code webview API instance shared across the webview app.
let vscodeApi: ReturnType<typeof acquireVsCodeApi> | null = null;

export function getVSCodeApi() {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

