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

/** Registration source for My Agents dashboard */
export type RegistrationSource = "ui" | "external" | "hosted";

/** Extended agent entry returned by My Agents API */
export interface MyAgentEntry {
  did: string;
  name: string;
  version: string;
  endpoint: string;
  type: AgentType;
  capabilities: Capability[];
  walletAddress: string;
  agentId: string;
  registrationSource: RegistrationSource;
  /** On-chain PDA address (null for hosted-only agents not yet on-chain) */
  onChainPDA: string | null;
  /** Owner wallet address */
  owner: string;
  registeredAt?: number;
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

export type ArtifactType = "text" | "json" | "image" | "link" | "transaction" | "file";

export interface Artifact {
  type: ArtifactType;
  content?: string;     // text, markdown
  data?: unknown;       // json
  url?: string;         // image, link, file
  alt?: string;         // image alt text
  txHash?: string;      // transaction
  label?: string;       // link/file label
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
  parsedArtifact?: Artifact;
  escrowTxHash?: string;
  settlementTxHash?: string;
  log: LogEntry[];
}
