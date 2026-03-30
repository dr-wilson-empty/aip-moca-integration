import { create } from "zustand";
import type { AgentCard } from "@/types/aip";
import { MY_AGENT_CARD } from "@/lib/mock/agentCards";

interface AgentState {
  myCard: AgentCard;
  counterpartCard: AgentCard | null;
  counterpartVerified: boolean;
  setAgentName: (name: string) => void;
  updateMyDid: (did: string) => void;
  setCounterpart: (card: AgentCard) => void;
  clearCounterpart: () => void;
}

export const useAgentStore = create<AgentState>()((set) => ({
  myCard: MY_AGENT_CARD,
  counterpartCard: null,
  counterpartVerified: false,
  setAgentName: (name) =>
    set((s) => ({ myCard: { ...s.myCard, name } })),
  updateMyDid: (did) =>
    set((s) => ({ myCard: { ...s.myCard, did } })),
  setCounterpart: (card) => set({ counterpartCard: card, counterpartVerified: true }),
  clearCounterpart: () => set({ counterpartCard: null, counterpartVerified: false }),
}));
