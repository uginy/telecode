import { useEffect, useRef } from 'react';
import { ContextItem } from '../../types/context';

interface ContextMenuProps {
  items: ContextItem[];
  selectedIndex: number;
  onSelect: (item: ContextItem) => void;
}

export function ContextMenu({ items, selectedIndex, onSelect }: ContextMenuProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // Scroll selected item into view
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <ul 
      ref={listRef}
      className="context-menu"
      style={{ 
        position: 'absolute', 
        bottom: '100%', 
        left: 0,
        maxHeight: '200px',
        overflowY: 'auto',
        width: '100%',
        backgroundColor: 'var(--vscode-dropdown-background)',
        border: '1px solid var(--vscode-dropdown-border)',
        zIndex: 1000,
        listStyle: 'none',
        padding: '4px 0',
        margin: 0,
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}
    >
      {items.map((item, index) => (
        <li
          key={item.id}
          className={`context-menu-item ${index === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(item)}
          style={{
            padding: '4px 8px',
            cursor: 'pointer',
            backgroundColor: index === selectedIndex ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
            color: index === selectedIndex ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span className={`codicon codicon-${item.icon || 'file'}`}></span>
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span style={{ fontWeight: 500 }}>{item.name}</span>
            {item.description && (
              <span style={{ fontSize: '0.8em', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.description}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
