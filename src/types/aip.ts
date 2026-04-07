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

/* ------------------------------------------------------------------ */
/*  Task Chain (Phase 5 — Agent Chaining)                              */
/* ------------------------------------------------------------------ */

export type ChainStatus = "pending" | "executing" | "completed" | "failed";

export interface ChainStep {
  agentDid: string;
  agentName: string;
  agentEndpoint: string;
  walletAddress: string;
  capabilityId: string;
  capabilityDescription: string;
  estimatedCost: string;
  label: string;
  /** If true, uses previous step's output as input */
  inputFromPrev: boolean;
  /** Static input (used if inputFromPrev is false) */
  input: string;
  /** Runtime state */
  status: ChainStatus;
  taskId?: string;
  artifact?: string;
  escrowTxHash?: string;
  settlementTxHash?: string;
  error?: string;
}

export interface TaskChain {
  id: string;
  callerAddress: string;
  callerDid: string;
  steps: ChainStep[];
  totalCost: string;
  totalSpent: string;
  status: ChainStatus;
  /** On-chain tx hash for the initial budget deposit */
  depositTxHash: string;
  currentStep: number;
  createdAt: string;
  completedAt?: string;
  finalArtifact?: string;
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
  /** DID of the entity that delegated this task (undefined = human-initiated) */
  delegatedBy?: string;
  /** True if created by agent-to-agent delegation or autonomous chain */
  isAgentTask?: boolean;
  /** Chain ID — groups tasks from the same autonomous pipeline */
  chainId?: string;
}
