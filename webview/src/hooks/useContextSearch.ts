import { useState, useEffect, useRef } from 'react';
import { useVSCode } from './useVSCode';
import { ContextItem } from '../types/context';

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

  useEffect(() => {
    return onMessage((message) => {
      if (message.type === 'searchContextResults') {
        const items = (message.items as ContextItem[]) || [];
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
          setState(prev => ({
            ...prev,
            isActive: true,
            query,
            triggerIndex: lastAt
          }));

          // Debounce search - reduced for faster response
          if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
          searchTimeoutRef.current = setTimeout(() => {
            console.log('[useContextSearch] Sending searchContext query:', query);
            postMessage({ type: 'searchContext', query });
          }, 150);
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
