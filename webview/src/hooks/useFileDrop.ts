import { useState, useCallback, useEffect } from 'react';

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

    useEffect(() => {
        const handleGlobalDragOver = (e: DragEvent) => {
            e.preventDefault();
            console.log('Global: DragOver');
        };
        
        const handleGlobalDrop = (e: DragEvent) => {
             e.preventDefault();
             console.log('Global: Drop');
        };

        window.addEventListener('dragover', handleGlobalDragOver);
        window.addEventListener('drop', handleGlobalDrop);
        
        return () => {
            window.removeEventListener('dragover', handleGlobalDragOver);
            window.removeEventListener('drop', handleGlobalDrop);
        };
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        console.log('DnD: DragOver');
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('DnD: DragLeave', e.currentTarget.contains(e.relatedTarget as Node));
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('DnD: Drop');
        setIsDragging(false);

        const items = e.dataTransfer.items;
        const parsedPaths: string[] = [];
        
        console.log('DnD: Items length:', items.length);
        console.log('DnD: Types:', e.dataTransfer.types);

        const uriList = e.dataTransfer.getData('text/uri-list');
        if (uriList) {
            console.log('DnD: Found uri-list');
            const uris = uriList.split('\n').filter(u => u.trim().startsWith('file://'));
            for (const uri of uris) {
                parsedPaths.push(uri.trim());
            }
        } else {
             console.log('DnD: No uri-list, checking items');
             for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file') {
                   const file = items[i].getAsFile() as ElectronFile | null;
                   console.log('DnD: File item:', file?.name, file?.path);
                   if (file?.path) {
                       parsedPaths.push(file.path);
                   }
                }
             }
        }

        const vscodeWindow = window as unknown as VsCodeWebviewWindow;
        if (parsedPaths.length > 0 && vscodeWindow.vscode) {
            console.log('DnD: Sending paths:', parsedPaths);
            vscodeWindow.vscode.postMessage({ type: 'resolveContextItems', paths: parsedPaths });
        } else {
            console.log('DnD: No paths found or no vscode');
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
