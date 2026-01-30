import { create } from 'zustand';

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmState {
  current: ConfirmRequest | null;
  open: (request: ConfirmRequest) => Promise<boolean>;
  resolve: (approved: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set) => {
  let resolver: ((value: boolean) => void) | null = null;

  return {
    current: null,

    open: (request) =>
      new Promise<boolean>((resolve) => {
        resolver = resolve;
        set({ current: request });
      }),

    resolve: (approved) => {
      if (resolver) {
        resolver(approved);
        resolver = null;
      }
      set({ current: null });
    }
  };
});

