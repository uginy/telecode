import { useCallback, useEffect, useRef } from 'react';
import { getVSCodeApi } from '../lib/vscodeApi';

type VSCodeMessage = { type: string } & Record<string, unknown>;

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

  const postMessage = useCallback(<T extends VSCodeMessage>(message: T) => {
    getVSCodeApi().postMessage(message);
  }, []);

  const onMessage = useCallback(<T extends VSCodeMessage>(callback: (message: T) => void) => {
    listenersRef.current.add(callback as (message: VSCodeMessage) => void);
    return () => {
      listenersRef.current.delete(callback as (message: VSCodeMessage) => void);
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
