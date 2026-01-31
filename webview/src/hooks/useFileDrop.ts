import { useState, useCallback } from 'react';

interface ElectronFile extends File {
    path?: string;
}

interface VsCodeWebviewWindow extends Window {
    vscode?: {
        postMessage: (message: unknown) => void;
    };
}

export const useFileDrop = () => {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const items = e.dataTransfer.items;
        const parsedPaths: string[] = [];

        const uriList = e.dataTransfer.getData('text/uri-list');
        if (uriList) {
            const uris = uriList.split('\n').filter(u => u.trim().startsWith('file://'));
            for (const uri of uris) {
                parsedPaths.push(uri.trim());
            }
        } else {
             for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file') {
                   const file = items[i].getAsFile() as ElectronFile | null;
                   if (file?.path) {
                       parsedPaths.push(file.path);
                   }
                }
             }
        }

        const vscodeWindow = window as unknown as VsCodeWebviewWindow;
        if (parsedPaths.length > 0 && vscodeWindow.vscode) {
            vscodeWindow.vscode.postMessage({ type: 'resolveContextItems', paths: parsedPaths });
        }
    }, []);

    return {
        isDragging,
        handleDragOver,
        handleDragEnter: handleDragOver,
        handleDragLeave,
        handleDrop
    };
};
