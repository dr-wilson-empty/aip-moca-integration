import { create } from "zustand";

export interface PipelineStep {
  agentName: string;
  agentEndpoint: string;
  agentDid: string;
  walletAddress?: string;
  capabilityId: string;
  capabilityDescription: string;
  input: string;
  inputFromPrev: boolean;
  estimatedCost: string;
  label: string;
  // Runtime state
  status?: "pending" | "executing" | "completed" | "failed";
  taskId?: string;
  artifact?: string;
  escrowTxHash?: string;
  settlementTxHash?: string;
}

export interface TwinMessage {
  id: string;
  role: "user" | "twin" | "system";
  content: string;
  timestamp: string;
  // Single task (backward compat)
  plan?: PipelineStep;
  // Pipeline
  mode?: "single" | "pipeline";
  steps?: PipelineStep[];
  totalCost?: string;
  currentStep?: number;
  // Task result
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
  updateStep: (msgId: string, stepIdx: number, update: Partial<PipelineStep>) => void;
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
  updateStep: (msgId, stepIdx, update) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== msgId || !m.steps) return m;
        const steps = [...m.steps];
        steps[stepIdx] = { ...steps[stepIdx], ...update };
        return { ...m, steps };
      }),
    })),
  setProcessing: (v) => set({ isProcessing: v }),
  clearMessages: () => set({ messages: [] }),
}));
