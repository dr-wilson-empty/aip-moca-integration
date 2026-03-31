import { create } from "zustand";

export interface TwinMessage {
  id: string;
  role: "user" | "twin" | "system";
  content: string;
  timestamp: string;
  plan?: {
    agentName: string;
    agentEndpoint: string;
    agentDid: string;
    capabilityId: string;
    capabilityDescription: string;
    input: string;
    estimatedCost: string;
    walletAddress?: string;
  };
  taskId?: string;
  artifact?: string;
  escrowTxHash?: string;
  settlementTxHash?: string;
  state?: "planning" | "confirming" | "executing" | "completed" | "failed";
}

interface TwinState {
  messages: TwinMessage[];
  isProcessing: boolean;
  addMessage: (msg: TwinMessage) => void;
  updateMessage: (id: string, update: Partial<TwinMessage>) => void;
  setProcessing: (v: boolean) => void;
  clearMessages: () => void;
}

export const useTwinStore = create<TwinState>()((set) => ({
  messages: [],
  isProcessing: false,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateMessage: (id, update) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...update } : m)),
    })),
  setProcessing: (v) => set({ isProcessing: v }),
  clearMessages: () => set({ messages: [] }),
}));
