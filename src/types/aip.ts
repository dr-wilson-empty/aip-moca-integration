export type TaskState =
  | "SUBMITTED"
  | "WORKING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type AgentType = "LLM" | "Task" | "Execution";

export type ProtocolNodeState = "idle" | "active" | "done" | "error";

export interface Capability {
  id: string;
  description: string;
  pricing: {
    amount: string;
    token: "USDC";
    network: "solana";
  };
}

export interface AgentCard {
  did: string;
  name: string;
  version: string;
  endpoint: string;
  type: AgentType;
  capabilities: Capability[];
  walletAddress?: string; // Solana wallet for receiving payments
}

export interface ProtocolNode {
  id: string;
  label: string;
  state: ProtocolNodeState;
  timestamp?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  eventType: string;
  message: string;
}

export interface Task {
  id: string;
  counterpartAgent: string;
  capability: string;
  input: string;
  startedAt: string;
  duration: string;
  state: TaskState;
  usdcSpent: string;
  artifact?: string;
  escrowTxHash?: string;
  settlementTxHash?: string;
  log: LogEntry[];
}
