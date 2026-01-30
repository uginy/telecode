import { useCallback, useEffect, useRef } from 'react';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

// Cache the VS Code API instance
let vscodeApi: ReturnType<typeof acquireVsCodeApi> | null = null;

function getVSCodeAPI() {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

interface VSCodeMessage {
  type: string;
  [key: string]: unknown;
}

export function useVSCode() {
  const listenersRef = useRef<Set<(message: VSCodeMessage) => void>>(new Set());

  useEffect(() => {
    const handleMessage = (event: MessageEvent<VSCodeMessage>) => {
      listenersRef.current.forEach((listener) => {
        listener(event.data);
      });
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const postMessage = useCallback((message: VSCodeMessage) => {
    getVSCodeAPI().postMessage(message);
  }, []);

  const onMessage = useCallback((callback: (message: VSCodeMessage) => void) => {
    listenersRef.current.add(callback);
    return () => {
      listenersRef.current.delete(callback);
    };
  }, []);

  const getState = useCallback(() => {
    return getVSCodeAPI().getState();
  }, []);

  const setState = useCallback((state: unknown) => {
    getVSCodeAPI().setState(state);
  }, []);

  return {
    postMessage,
    onMessage,
    getState,
    setState
  };
}
