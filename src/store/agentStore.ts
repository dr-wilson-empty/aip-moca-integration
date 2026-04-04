import { create } from "zustand";
import type { AgentCard, MyAgentEntry } from "@/types/aip";
import { MY_AGENT_CARD } from "@/lib/mock/agentCards";

interface AgentState {
  myCard: AgentCard;
  counterpartCard: AgentCard | null;
  counterpartVerified: boolean;
  /** All agents owned by the connected wallet (on-chain + hosted) */
  myAgents: MyAgentEntry[];
  myAgentsLoading: boolean;
  setAgentName: (name: string) => void;
  updateMyDid: (did: string) => void;
  setCounterpart: (card: AgentCard) => void;
  clearCounterpart: () => void;
  /** Sync agents from chain + hosted for the given wallet */
  syncFromChain: (ownerWallet: string) => Promise<void>;
}

export const useAgentStore = create<AgentState>()((set) => ({
  myCard: MY_AGENT_CARD,
  counterpartCard: null,
  counterpartVerified: false,
  myAgents: [],
  myAgentsLoading: false,
  setAgentName: (name) =>
    set((s) => ({ myCard: { ...s.myCard, name } })),
  updateMyDid: (did) =>
    set((s) => ({ myCard: { ...s.myCard, did } })),
  setCounterpart: (card) => set({ counterpartCard: card, counterpartVerified: true }),
  clearCounterpart: () => set({ counterpartCard: null, counterpartVerified: false }),
  syncFromChain: async (ownerWallet: string) => {
    set({ myAgentsLoading: true });
    try {
      const res = await fetch(`/api/agent-card/my-agents?owner=${ownerWallet}`);
      const data = await res.json();
      set({ myAgents: data.agents ?? [], myAgentsLoading: false });
    } catch {
      set({ myAgentsLoading: false });
    }
  },
}));
