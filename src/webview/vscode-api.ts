// @ts-expect-error — acquireVsCodeApi is injected by VS Code at runtime
const api = acquireVsCodeApi() as {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

export default api;
