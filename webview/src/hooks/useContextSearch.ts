import { useState, useEffect, useRef } from 'react';
import { useVSCode } from './useVSCode';
import { ContextItem } from '../types/context';
import type { ExtensionMessage, WebviewMessage } from '../types/bridge';

interface ContextSearchState {
  isActive: boolean;
  query: string;
  results: ContextItem[];
  selectedIndex: number;
  triggerIndex: number; // Where '@' was typed
}

export function useContextSearch() {
  const { postMessage, onMessage } = useVSCode();
  const [state, setState] = useState<ContextSearchState>({
    isActive: false,
    query: '',
    results: [],
    selectedIndex: 0,
    triggerIndex: -1
  });

  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const lastQueryRef = useRef<string>('');
  const lastTriggerRef = useRef<number>(-1);

  useEffect(() => {
    return onMessage((message: ExtensionMessage) => {
      if (message.type === 'searchContextResults') {
        const items = message.items || [];
        setState(prev => ({
          ...prev,
          results: items,
          selectedIndex: 0
        }));
      }
    });
  }, [onMessage]);

  const handleInput = (value: string, caretIndex: number) => {
    // Check if we are typing after a '@'
    const textBeforeCaret = value.slice(0, caretIndex);
    const lastAt = textBeforeCaret.lastIndexOf('@');

    if (lastAt !== -1) {
      // Check if '@' is start of line or preceded by whitespace/punctuation
      const prevChar = textBeforeCaret[lastAt - 1];
      const isValidTrigger = lastAt === 0 || /\s/.test(prevChar) || /[\(\[\{<>"'`;,]/.test(prevChar);
      
      if (isValidTrigger) {
        const query = textBeforeCaret.slice(lastAt + 1);
        // Only trigger if no spaces/newlines in query
        if (!query.includes(' ') && !query.includes('\n')) {
          if (!(state.isActive && state.query === query && state.triggerIndex === lastAt)) {
            setState(prev => ({
              ...prev,
              isActive: true,
              query,
              triggerIndex: lastAt
            }));
          }

          // Debounce search - reduced for faster response
          if (query !== lastQueryRef.current || lastAt !== lastTriggerRef.current) {
            lastQueryRef.current = query;
            lastTriggerRef.current = lastAt;
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
            searchTimeoutRef.current = setTimeout(() => {
              console.log('[useContextSearch] Sending searchContext query:', query);
              const payload: WebviewMessage = { type: 'searchContext', query };
              postMessage(payload);
            }, 150);
          }
          return;
        }
      }
    }

    // Reset if no valid trigger
    if (state.isActive) {
      setState(prev => ({ ...prev, isActive: false, results: [] }));
    }
  };

  const clearSearch = () => {
    setState({
      isActive: false,
      query: '',
      results: [],
      selectedIndex: 0,
      triggerIndex: -1
    });
  };

  return {
    ...state,
    setSelectedIndex: (idx: number) => setState(prev => ({ ...prev, selectedIndex: idx })),
    handleInput,
    clearSearch
  };
}
