"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type BuilderStep = 1 | 2 | 3;
export type AITier = "platform" | "custom";
export type AIProvider = "anthropic" | "openai" | "google";

export interface BuilderCapability {
  id: string;
  description: string;
  amount: string;
}

interface AgentBuilderState {
  // Wizard step
  step: BuilderStep;

  // Step 1: Define
  name: string;
  description: string;
  template: string; // template key or "custom"

  // Step 2: Behavior
  systemPrompt: string;
  canOrchestrate: boolean;

  // Step 3: Price & Publish
  tier: AITier;
  provider: AIProvider;
  customApiKey: string;
  capabilities: BuilderCapability[];

  // Status
  publishing: boolean;
  published: boolean;
  txHash: string | null;
  error: string | null;

  // Actions
  setStep: (step: BuilderStep) => void;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setTemplate: (template: string) => void;
  setSystemPrompt: (prompt: string) => void;
  setCanOrchestrate: (v: boolean) => void;
  setTier: (tier: AITier) => void;
  setProvider: (provider: AIProvider) => void;
  setCustomApiKey: (key: string) => void;
  setCapabilities: (caps: BuilderCapability[]) => void;
  addCapability: () => void;
  removeCapability: (idx: number) => void;
  updateCapability: (idx: number, field: keyof BuilderCapability, value: string) => void;
  setPublishing: (v: boolean) => void;
  setPublished: (txHash: string) => void;
  setError: (error: string | null) => void;
  resetBuilder: () => void;
}

const INITIAL_STATE = {
  step: 1 as BuilderStep,
  name: "",
  description: "",
  template: "custom",
  systemPrompt: "",
  canOrchestrate: false,
  tier: "platform" as AITier,
  provider: "anthropic" as AIProvider,
  customApiKey: "",
  capabilities: [{ id: "", description: "", amount: "0.10" }] as BuilderCapability[],
  publishing: false,
  published: false,
  txHash: null as string | null,
  error: null as string | null,
};

export const useAgentBuilderStore = create<AgentBuilderState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      setStep: (step) => set({ step }),
      setName: (name) => set({ name }),
      setDescription: (description) => set({ description }),
      setTemplate: (template) => set({ template }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      setCanOrchestrate: (canOrchestrate) => set({ canOrchestrate }),
      setTier: (tier) => set({ tier }),
      setProvider: (provider) => set({ provider }),
      setCustomApiKey: (customApiKey) => set({ customApiKey }),
      setCapabilities: (capabilities) => set({ capabilities }),

      addCapability: () =>
        set((s) => ({
          capabilities: [...s.capabilities, { id: "", description: "", amount: "0.10" }],
        })),

      removeCapability: (idx) =>
        set((s) => ({
          capabilities: s.capabilities.filter((_, i) => i !== idx),
        })),

      updateCapability: (idx, field, value) =>
        set((s) => {
          const caps = [...s.capabilities];
          caps[idx] = { ...caps[idx], [field]: value };
          return { capabilities: caps };
        }),

      setPublishing: (publishing) => set({ publishing, error: null }),
      setPublished: (txHash) => set({ published: true, publishing: false, txHash }),
      setError: (error) => set({ error, publishing: false }),
      resetBuilder: () => set(INITIAL_STATE),
    }),
    {
      name: "aip-agent-builder",
      partialize: (state) => ({
        step: state.step,
        name: state.name,
        description: state.description,
        template: state.template,
        systemPrompt: state.systemPrompt,
        canOrchestrate: state.canOrchestrate,
        tier: state.tier,
        provider: state.provider,
        capabilities: state.capabilities,
      }),
    }
  )
);
