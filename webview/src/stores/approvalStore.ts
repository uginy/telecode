import { create } from 'zustand';
import type { ApprovalRequest } from '../types/bridge';

interface ApprovalState {
  queue: ApprovalRequest[];
  current: ApprovalRequest | null;
  enqueue: (request: ApprovalRequest) => void;
  resolveCurrent: () => ApprovalRequest | null;
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  queue: [],
  current: null,

  enqueue: (request) => {
    const { current, queue } = get();
    if (!current) {
      set({ current: request });
      return;
    }
    set({ queue: [...queue, request] });
  },

  resolveCurrent: () => {
    const { current, queue } = get();
    if (!current) return null;

    const next = queue[0] ?? null;
    const remaining = next ? queue.slice(1) : [];
    set({ current: next, queue: remaining });
    return current;
  }
}));
