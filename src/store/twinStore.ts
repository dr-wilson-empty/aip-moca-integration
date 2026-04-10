import { create } from "zustand";
import { signedFetch } from "@/lib/auth/signed-fetch";

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
  /** Raw ISO timestamp from Supabase — used for cursor pagination */
  createdAt?: string;
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
  /** Chain ID for autonomous execution */
  chainId?: string;
  /** Whether this pipeline is running in autonomous mode */
  autonomous?: boolean;
  /** True if a direct pipeline alternative is available */
  hasPipelineAlt?: boolean;
  /** Alternative orchestrator agent (user can choose) */
  orchestratorAlt?: {
    agentName: string;
    agentEndpoint: string;
    agentDid: string;
    walletAddress: string;
    capabilityId: string;
    capabilityDescription: string;
    estimatedCost: string;
  };
}

interface TwinState {
  messages: TwinMessage[];
  isProcessing: boolean;
  autonomousMode: boolean;
  loaded: boolean;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  totalMessages: number;
  walletAddress: string | null;
  setAutonomousMode: (v: boolean) => void;
  setWallet: (addr: string | null) => void;
  addMessage: (msg: TwinMessage, walletAddress?: string) => void;
  updateMessage: (id: string, update: Partial<TwinMessage>, walletAddress?: string) => void;
  updateStep: (msgId: string, stepIdx: number, update: Partial<PipelineStep>) => void;
  setProcessing: (v: boolean) => void;
  clearMessages: () => void;
  loadFromServer: (walletAddress: string) => Promise<void>;
  loadMore: (walletAddress: string) => Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Supabase persistence helpers                                       */
/* ------------------------------------------------------------------ */

/** Build plan JSONB payload — stores full pipeline state for restoration */
function buildPlanJson(msg: TwinMessage): unknown | undefined {
  if (msg.steps) {
    return {
      steps: msg.steps,
      mode: msg.mode,
      totalCost: msg.totalCost,
      chainId: msg.chainId,
      autonomous: msg.autonomous,
      currentStep: msg.currentStep,
    };
  }
  return msg.plan || undefined;
}

/** Persist message to Supabase (fire-and-forget) */
function persistToServer(action: "insert" | "update", walletAddress: string, msg: TwinMessage) {
  const planJson = buildPlanJson(msg);

  const body = action === "insert"
    ? {
        action: "insert",
        message: {
          id: msg.id,
          wallet_address: walletAddress,
          role: msg.role,
          content: msg.content,
          state: msg.state,
          plan: planJson,
          artifact: msg.artifact,
          escrow_tx_hash: msg.escrowTxHash,
          settlement_tx_hash: msg.settlementTxHash,
          task_id: msg.taskId,
        },
      }
    : {
        action: "update",
        id: msg.id,
        update: {
          content: msg.content,
          state: msg.state,
          plan: planJson,
          artifact: msg.artifact,
          escrow_tx_hash: msg.escrowTxHash,
          settlement_tx_hash: msg.settlementTxHash,
          task_id: msg.taskId,
        },
      };

  signedFetch("/api/twin/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/** Debounced persistence for step updates — avoids excessive DB writes */
const stepTimers = new Map<string, ReturnType<typeof setTimeout>>();
function debouncedStepPersist(walletAddress: string, msg: TwinMessage) {
  const existing = stepTimers.get(msg.id);
  if (existing) clearTimeout(existing);
  stepTimers.set(
    msg.id,
    setTimeout(() => {
      persistToServer("update", walletAddress, msg);
      stepTimers.delete(msg.id);
    }, 500),
  );
}

/* ------------------------------------------------------------------ */
/*  Server → Client message mapper                                     */
/* ------------------------------------------------------------------ */

function parseServerMessage(m: Record<string, unknown>): TwinMessage {
  const plan = m.plan as Record<string, unknown> | null;
  const isRichPlan = plan && Array.isArray(plan.steps);

  return {
    id: m.id as string,
    role: m.role as TwinMessage["role"],
    content: m.content as string,
    timestamp: m.created_at ? new Date(m.created_at as string).toLocaleTimeString() : "",
    createdAt: m.created_at as string | undefined,
    state: m.state as TwinMessage["state"],
    artifact: m.artifact as string | undefined,
    escrowTxHash: m.escrow_tx_hash as string | undefined,
    settlementTxHash: m.settlement_tx_hash as string | undefined,
    taskId: m.task_id as string | undefined,
    // Restore full pipeline data from plan JSONB
    steps: isRichPlan ? (plan.steps as PipelineStep[]) : undefined,
    mode: isRichPlan ? (plan.mode as TwinMessage["mode"]) : undefined,
    totalCost: isRichPlan ? (plan.totalCost as string) : undefined,
    chainId: isRichPlan ? (plan.chainId as string) : undefined,
    autonomous: isRichPlan ? (plan.autonomous as boolean) : undefined,
    currentStep: isRichPlan ? (plan.currentStep as number) : undefined,
    // Backward compat: old messages stored a single PipelineStep in plan
    plan: !isRichPlan && plan ? (plan as unknown as PipelineStep) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

export const useTwinStore = create<TwinState>()((set, get) => ({
  messages: [],
  isProcessing: false,
  autonomousMode: false,
  loaded: false,
  loading: false,
  loadingMore: false,
  hasMore: false,
  totalMessages: 0,
  walletAddress: null,

  setAutonomousMode: (v) => set({ autonomousMode: v }),

  setWallet: (addr) => {
    const prev = get().walletAddress;
    if (prev && addr && prev !== addr) {
      // Wallet switched — clear cache, force reload
      set({ walletAddress: addr, loaded: false, messages: [], hasMore: false, totalMessages: 0 });
    } else {
      set({ walletAddress: addr });
    }
  },

  addMessage: (msg, walletOverride) => {
    set((s) => ({ messages: [...s.messages, msg] }));
    const wallet = walletOverride || get().walletAddress || undefined;
    if (wallet) persistToServer("insert", wallet, msg);
  },

  updateMessage: (id, update, walletOverride) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...update } : m)),
    }));
    const wallet = walletOverride || get().walletAddress || undefined;
    const fullMsg = get().messages.find((m) => m.id === id);
    if (wallet && fullMsg) persistToServer("update", wallet, fullMsg);
  },

  updateStep: (msgId, stepIdx, update) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== msgId || !m.steps) return m;
        // Prevent ghost steps: don't write beyond existing steps array
        if (stepIdx >= m.steps.length) return m;
        const steps = [...m.steps];
        steps[stepIdx] = { ...steps[stepIdx], ...update };
        return { ...m, steps };
      }),
    }));
    const wallet = get().walletAddress || undefined;
    const fullMsg = get().messages.find((m) => m.id === msgId);
    if (wallet && fullMsg) debouncedStepPersist(wallet, fullMsg);
  },

  setProcessing: (v) => set({ isProcessing: v }),

  clearMessages: () => {
    // Clear orphaned step persist timers
    stepTimers.forEach((timer) => clearTimeout(timer));
    stepTimers.clear();
    set({ messages: [], hasMore: false, totalMessages: 0 });
  },

  /* ---- Load latest messages from Supabase (stale-while-revalidate) ---- */
  loadFromServer: async (walletAddress: string) => {
    if (get().loading) return;
    set({ loading: true });

    try {
      const res = await signedFetch(`/api/twin/messages?wallet=${encodeURIComponent(walletAddress)}&limit=200`);
      if (!res.ok) {
        set({ loading: false, loaded: true });
        return;
      }

      const data = await res.json();
      const serverMsgs: TwinMessage[] = (data.messages ?? []).map(parseServerMessage);
      const total: number = data.total ?? serverMsgs.length;

      // Server is source of truth — keep local-only messages that haven't been persisted yet
      const local = get().messages;
      const serverIds = new Set(serverMsgs.map((m) => m.id));
      const localOnly = local.filter((m) => !serverIds.has(m.id));

      set({
        messages: [...serverMsgs, ...localOnly],
        loaded: true,
        loading: false,
        hasMore: total > serverMsgs.length,
        totalMessages: total,
      });
    } catch {
      set({ loaded: true, loading: false });
    }
  },

  /* ---- Load older messages (cursor pagination) ---- */
  loadMore: async (walletAddress: string) => {
    if (get().loadingMore || !get().hasMore) return;
    set({ loadingMore: true });

    try {
      const msgs = get().messages;
      if (!msgs.length) {
        set({ loadingMore: false });
        return;
      }

      const earliest = msgs[0];
      const before = earliest.createdAt;
      if (!before) {
        set({ loadingMore: false, hasMore: false });
        return;
      }

      const res = await signedFetch(
        `/api/twin/messages?wallet=${encodeURIComponent(walletAddress)}&limit=50&before=${encodeURIComponent(before)}`,
      );

      if (!res.ok) {
        set({ loadingMore: false });
        return;
      }

      const data = await res.json();
      const olderMsgs: TwinMessage[] = (data.messages ?? []).map(parseServerMessage);

      if (olderMsgs.length === 0) {
        set({ loadingMore: false, hasMore: false });
        return;
      }

      const existing = get().messages;
      const existingIds = new Set(existing.map((m) => m.id));
      const newOlder = olderMsgs.filter((m) => !existingIds.has(m.id));

      set({
        messages: [...newOlder, ...existing],
        loadingMore: false,
        hasMore: olderMsgs.length >= 50,
      });
    } catch {
      set({ loadingMore: false });
    }
  },
}));
