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
  plan?: PipelineStep;
  mode?: "single" | "pipeline";
  steps?: PipelineStep[];
  totalCost?: string;
  currentStep?: number;
  taskId?: string;
  artifact?: string;
  escrowTxHash?: string;
  settlementTxHash?: string;
  state?: "planning" | "confirming" | "executing" | "completed" | "failed";
}

interface TwinState {
  messages: TwinMessage[];
  isProcessing: boolean;
  loaded: boolean;
  walletAddress: string | null;
  setWallet: (addr: string | null) => void;
  addMessage: (msg: TwinMessage, walletAddress?: string) => void;
  updateMessage: (id: string, update: Partial<TwinMessage>, walletAddress?: string) => void;
  updateStep: (msgId: string, stepIdx: number, update: Partial<PipelineStep>) => void;
  setProcessing: (v: boolean) => void;
  clearMessages: () => void;
  loadFromServer: (walletAddress: string) => Promise<void>;
}

/** Persist message to server (fire-and-forget) */
function persistMsg(action: "insert" | "update", walletAddress: string | undefined, msg: TwinMessage | null, id?: string, update?: Partial<TwinMessage>) {
  if (!walletAddress) return;
  const body = action === "insert"
    ? { action: "insert", message: { id: msg!.id, wallet_address: walletAddress, role: msg!.role, content: msg!.content, state: msg!.state, plan: msg!.plan, artifact: msg!.artifact, escrow_tx_hash: msg!.escrowTxHash, settlement_tx_hash: msg!.settlementTxHash, task_id: msg!.taskId } }
    : { action: "update", id, update: { content: update?.content, state: update?.state, artifact: update?.artifact, escrow_tx_hash: update?.escrowTxHash, settlement_tx_hash: update?.settlementTxHash, task_id: update?.taskId } };
  fetch("/api/twin/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}

export const useTwinStore = create<TwinState>()((set, get) => ({
  messages: [],
  isProcessing: false,
  loaded: false,
  walletAddress: null,
  setWallet: (addr) => set({ walletAddress: addr }),
  addMessage: (msg, walletOverride) => {
    set((s) => ({ messages: [...s.messages, msg] }));
    const wallet = walletOverride || get().walletAddress || undefined;
    persistMsg("insert", wallet, msg);
  },
  updateMessage: (id, update, walletOverride) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...update } : m)),
    }));
    const wallet = walletOverride || get().walletAddress || undefined;
    persistMsg("update", wallet, null, id, update);
  },
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
  loadFromServer: async (walletAddress: string) => {
    if (get().loaded) return;
    try {
      const res = await fetch(`/api/twin/messages?wallet=${walletAddress}`);
      if (!res.ok) return;
      const data = await res.json();
      const serverMsgs = (data.messages ?? []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        role: m.role as TwinMessage["role"],
        content: m.content as string,
        timestamp: m.created_at ? new Date(m.created_at as string).toLocaleTimeString() : "",
        state: m.state as TwinMessage["state"],
        artifact: m.artifact as string | undefined,
        escrowTxHash: m.escrow_tx_hash as string | undefined,
        settlementTxHash: m.settlement_tx_hash as string | undefined,
        taskId: m.task_id as string | undefined,
      }));
      const local = get().messages;
      const serverIds = new Set(serverMsgs.map((m: TwinMessage) => m.id));
      const merged = [
        ...serverMsgs,
        ...local.filter((m) => !serverIds.has(m.id)),
      ];
      set({ messages: merged, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
