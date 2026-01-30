import { create } from 'zustand';
import type { ApprovalRequest } from '../types/bridge';

export interface ApprovalDecision {
  request: ApprovalRequest;
  decision: 'approve' | 'deny';
  decidedAt: number;
}

interface ApprovalState {
  queue: ApprovalRequest[];
  current: ApprovalRequest | null;
  history: ApprovalDecision[];
  enqueue: (request: ApprovalRequest) => void;
  resolveRequest: (requestId: string, decision: 'approve' | 'deny') => ApprovalRequest | null;
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  queue: [],
  current: null,
  history: [],

  enqueue: (request) => {
    const { current, queue } = get();
    if (!current) {
      set({ current: request });
      return;
    }
    set({ queue: [...queue, request] });
  },

  resolveRequest: (requestId, decision) => {
    const { current, queue, history } = get();

    let resolved: ApprovalRequest | null = null;
    let next = current;
    let remainingQueue = queue;

    if (current && current.requestId === requestId) {
      resolved = current;
      next = queue[0] ?? null;
      remainingQueue = queue.slice(1);
    } else {
      const idx = queue.findIndex((req) => req.requestId === requestId);
      if (idx >= 0) {
        resolved = queue[idx];
        remainingQueue = [...queue.slice(0, idx), ...queue.slice(idx + 1)];
      }
    }

    if (!resolved) return null;

    const entry: ApprovalDecision = {
      request: resolved,
      decision,
      decidedAt: Date.now()
    };

    set({
      current: next,
      queue: remainingQueue,
      history: [entry, ...history].slice(0, 50)
    });

    return resolved;
  }
}));
