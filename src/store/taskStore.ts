import { create } from "zustand";
import type { ProtocolNode, LogEntry, TaskState } from "@/types/aip";

interface ActiveTaskState {
  isRunning: boolean;
  taskState: TaskState | null;
  nodes: ProtocolNode[];
  log: LogEntry[];
  artifact: string | null;
  escrowTxHash: string | null;
  settlementTxHash: string | null;
  startTask: () => void;
  updateNodes: (nodes: ProtocolNode[]) => void;
  addLogEntry: (entry: LogEntry) => void;
  completeTask: (artifact: string, escrowTx: string, settlementTx: string) => void;
  failTask: (escrowTx: string) => void;
  resetTask: () => void;
}

const INITIAL_NODES: ProtocolNode[] = [
  { id: "did_verify", label: "DID Verify", state: "idle" },
  { id: "escrow_lock", label: "Escrow Lock", state: "idle" },
  { id: "task_sent", label: "Task Sent", state: "idle" },
  { id: "executing", label: "Executing", state: "idle" },
  { id: "settlement", label: "Settlement", state: "idle" },
];

export const useTaskStore = create<ActiveTaskState>()((set) => ({
  isRunning: false,
  taskState: null,
  nodes: INITIAL_NODES,
  log: [],
  artifact: null,
  escrowTxHash: null,
  settlementTxHash: null,
  startTask: () =>
    set({
      isRunning: true,
      taskState: "SUBMITTED",
      nodes: INITIAL_NODES,
      log: [],
      artifact: null,
      escrowTxHash: null,
      settlementTxHash: null,
    }),
  updateNodes: (nodes) => set({ nodes }),
  addLogEntry: (entry) =>
    set((s) => ({ log: [...s.log, entry] })),
  completeTask: (artifact, escrowTxHash, settlementTxHash) =>
    set({ isRunning: false, taskState: "COMPLETED", artifact, escrowTxHash, settlementTxHash }),
  failTask: (escrowTxHash) =>
    set({ isRunning: false, taskState: "FAILED", escrowTxHash }),
  resetTask: () =>
    set({
      isRunning: false,
      taskState: null,
      nodes: INITIAL_NODES,
      log: [],
      artifact: null,
      escrowTxHash: null,
      settlementTxHash: null,
    }),
}));
