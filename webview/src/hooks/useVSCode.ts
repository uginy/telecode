import { useCallback, useEffect, useRef } from 'react';
import { getVSCodeApi } from '../lib/vscodeApi';

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
    getVSCodeApi().postMessage(message);
  }, []);

  const onMessage = useCallback((callback: (message: VSCodeMessage) => void) => {
    listenersRef.current.add(callback);
    return () => {
      listenersRef.current.delete(callback);
    };
  }, []);

  const getState = useCallback(() => {
    return getVSCodeApi().getState();
  }, []);

  const setState = useCallback((state: unknown) => {
    getVSCodeApi().setState(state);
  }, []);

  return {
    postMessage,
    onMessage,
    getState,
    setState
  };
}
