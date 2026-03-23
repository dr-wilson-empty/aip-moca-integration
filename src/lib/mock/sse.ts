import type { ProtocolNode, LogEntry } from "@/types/aip";

interface MockSSEParams {
  agentName: string;
  agentDid: string;
  capabilityId: string;
  usdcAmount: string;
  taskInput: string;
}

type NodeUpdateFn = (nodes: ProtocolNode[]) => void;
type LogEntryFn = (entry: LogEntry) => void;
type CompleteFn = (artifact: string, escrowTx: string, settlementTx: string) => void;
type FailFn = (escrowTx: string) => void;

const ARTIFACTS: Record<string, (input: string) => string> = {
  "text.summarize": (input) =>
    `Summary of "${input.slice(0, 40)}...": AIP is a foundational open protocol enabling autonomous AI agents to discover, negotiate, and settle payments on Solana without human intervention.`,
  "text.classify": (input) =>
    `Classification result for "${input.slice(0, 30)}...": Category: GOVERNANCE / Confidence: 0.97`,
  "data.retrieve": (input) =>
    `Retrieved 847 records matching "${input.slice(0, 30)}...". Top result: Solana validator count: 1,893 — Average stake: 142,500 SOL — Epoch: 612`,
  "code.audit": (input) =>
    `Audit complete for "${input.slice(0, 30)}...": 3 critical findings, 7 warnings. Gas optimization potential: 12%. No re-entrancy vulnerabilities detected.`,
  "defi.analyze": (input) =>
    `DeFi analysis for "${input.slice(0, 30)}...": TVL: $2.4B, 24h volume: $180M, APY range: 4.2%-18.7%, Risk score: MODERATE (6.2/10).`,
};

function defaultArtifact(capId: string, input: string): string {
  const fn = ARTIFACTS[capId];
  return fn ? fn(input) : `Task completed. Result for capability "${capId}" with input "${input.slice(0, 50)}..."`;
}

function randomTxHash(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789";
  return Array.from({ length: 44 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function now(): string {
  return new Date().toTimeString().slice(0, 8);
}

/**
 * Simulates a SUCCESSFUL task — full protocol flow per docs.md:
 * DID Verify → Escrow Lock → Task Sent → Executing → Settlement
 */
export function runMockSSE(
  params: MockSSEParams,
  onNodeUpdate: NodeUpdateFn,
  onLogEntry: LogEntryFn,
  onComplete: CompleteFn
): () => void {
  const escrowTx = randomTxHash();
  const settlementTx = randomTxHash();

  const nodes: ProtocolNode[] = [
    { id: "did_verify", label: "DID Verify", state: "idle" },
    { id: "escrow_lock", label: "Escrow Lock", state: "idle" },
    { id: "task_sent", label: "Task Sent", state: "idle" },
    { id: "executing", label: "Executing", state: "idle" },
    { id: "settlement", label: "Settlement", state: "idle" },
  ];

  let logId = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const emit = (entry: Omit<LogEntry, "id" | "timestamp">) => {
    onLogEntry({ id: `l${++logId}`, timestamp: now(), ...entry });
  };

  const steps: Array<() => void> = [
    () => {
      nodes[0] = { ...nodes[0], state: "active" };
      onNodeUpdate([...nodes]);
      emit({ eventType: "DID_VERIFY", message: `Verifying ${params.agentName} DID: ${params.agentDid.slice(0, 24)}...` });
    },
    () => {
      nodes[0] = { ...nodes[0], state: "done", timestamp: now() };
      onNodeUpdate([...nodes]);
      emit({ eventType: "DID_VERIFIED", message: `DID cryptographically verified in ${20 + Math.floor(Math.random() * 40)}ms` });
      nodes[1] = { ...nodes[1], state: "active" };
      onNodeUpdate([...nodes]);
      emit({ eventType: "ESCROW_LOCK", message: `Locking ${params.usdcAmount} USDC in escrow on Solana...` });
    },
    () => {
      nodes[1] = { ...nodes[1], state: "done", timestamp: now() };
      onNodeUpdate([...nodes]);
      emit({ eventType: "ESCROW_LOCKED", message: `Escrow confirmed — tx: ${escrowTx.slice(0, 16)}...` });
      nodes[2] = { ...nodes[2], state: "active" };
      onNodeUpdate([...nodes]);
      emit({ eventType: "TASK_SENT", message: `Dispatching TaskRequest [${params.capabilityId}] to ${params.agentName}...` });
    },
    () => {
      nodes[2] = { ...nodes[2], state: "done", timestamp: now() };
      onNodeUpdate([...nodes]);
      emit({ eventType: "TASK_ACCEPTED", message: `${params.agentName} accepted task — status: WORKING` });
      nodes[3] = { ...nodes[3], state: "active" };
      onNodeUpdate([...nodes]);
      emit({ eventType: "EXECUTING", message: `Agent is processing "${params.taskInput.slice(0, 40)}..."` });
    },
    () => {
      nodes[3] = { ...nodes[3], state: "done", timestamp: now() };
      onNodeUpdate([...nodes]);
      emit({ eventType: "TASK_COMPLETED", message: "TaskCompleted received with artifact and attestation" });
      nodes[4] = { ...nodes[4], state: "active" };
      onNodeUpdate([...nodes]);
      emit({ eventType: "SETTLEMENT", message: "Verifying attestation on-chain..." });
    },
    () => {
      nodes[4] = { ...nodes[4], state: "done", timestamp: now() };
      onNodeUpdate([...nodes]);
      emit({ eventType: "PAYMENT_RELEASED", message: `${params.usdcAmount} USDC released to ${params.agentName} wallet — tx: ${settlementTx.slice(0, 16)}...` });
      onComplete(
        defaultArtifact(params.capabilityId, params.taskInput),
        escrowTx,
        settlementTx
      );
    },
  ];

  const DELAYS = [300, 900, 700, 1200, 1500, 800];

  let elapsed = 0;
  steps.forEach((fn, i) => {
    elapsed += DELAYS[i];
    timers.push(setTimeout(fn, elapsed));
  });

  return () => timers.forEach(clearTimeout);
}

/**
 * Simulates a FAILED task — per docs.md:
 * DID Verify → Escrow Lock → Task Sent → Executing (ERROR) → Refund
 * WORKING → FAILED: Funds refunded to Agent A
 */
const FAIL_REASONS = [
  "Agent returned error: upstream API timeout after 30s",
  "Execution halted: insufficient compute resources on agent node",
  "Agent returned error: input exceeds maximum token limit (8192)",
  "Execution error: external data source returned 503 Service Unavailable",
];

export function runMockSSEFailed(
  params: MockSSEParams,
  onNodeUpdate: NodeUpdateFn,
  onLogEntry: LogEntryFn,
  onFail: FailFn
): () => void {
  const escrowTx = randomTxHash();

  const nodes: ProtocolNode[] = [
    { id: "did_verify", label: "DID Verify", state: "idle" },
    { id: "escrow_lock", label: "Escrow Lock", state: "idle" },
    { id: "task_sent", label: "Task Sent", state: "idle" },
    { id: "executing", label: "Executing", state: "idle" },
    { id: "settlement", label: "Settlement", state: "idle" },
  ];

  let logId = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const emit = (entry: Omit<LogEntry, "id" | "timestamp">) => {
    onLogEntry({ id: `l${++logId}`, timestamp: now(), ...entry });
  };

  const failReason = FAIL_REASONS[Math.floor(Math.random() * FAIL_REASONS.length)];

  const steps: Array<() => void> = [
    // Step 1: DID Verify starts
    () => {
      nodes[0] = { ...nodes[0], state: "active" };
      onNodeUpdate([...nodes]);
      emit({ eventType: "DID_VERIFY", message: `Verifying ${params.agentName} DID: ${params.agentDid.slice(0, 24)}...` });
    },
    // Step 2: DID done → Escrow starts
    () => {
      nodes[0] = { ...nodes[0], state: "done", timestamp: now() };
      onNodeUpdate([...nodes]);
      emit({ eventType: "DID_VERIFIED", message: `DID cryptographically verified in ${20 + Math.floor(Math.random() * 40)}ms` });
      nodes[1] = { ...nodes[1], state: "active" };
      onNodeUpdate([...nodes]);
      emit({ eventType: "ESCROW_LOCK", message: `Locking ${params.usdcAmount} USDC in escrow on Solana...` });
    },
    // Step 3: Escrow done → Task sent
    () => {
      nodes[1] = { ...nodes[1], state: "done", timestamp: now() };
      onNodeUpdate([...nodes]);
      emit({ eventType: "ESCROW_LOCKED", message: `Escrow confirmed — tx: ${escrowTx.slice(0, 16)}...` });
      nodes[2] = { ...nodes[2], state: "active" };
      onNodeUpdate([...nodes]);
      emit({ eventType: "TASK_SENT", message: `Dispatching TaskRequest [${params.capabilityId}] to ${params.agentName}...` });
    },
    // Step 4: Task accepted → Executing
    () => {
      nodes[2] = { ...nodes[2], state: "done", timestamp: now() };
      onNodeUpdate([...nodes]);
      emit({ eventType: "TASK_ACCEPTED", message: `${params.agentName} accepted task — status: WORKING` });
      nodes[3] = { ...nodes[3], state: "active" };
      onNodeUpdate([...nodes]);
      emit({ eventType: "EXECUTING", message: `Agent is processing "${params.taskInput.slice(0, 40)}..."` });
    },
    // Step 5: FAILURE — Executing goes error
    () => {
      nodes[3] = { ...nodes[3], state: "error", timestamp: now() };
      onNodeUpdate([...nodes]);
      emit({ eventType: "TASK_FAILED", message: failReason });
    },
    // Step 6: Refund — Settlement node shows refund
    () => {
      nodes[4] = { ...nodes[4], state: "error", timestamp: now() };
      onNodeUpdate([...nodes]);
      emit({ eventType: "ESCROW_REFUND", message: `${params.usdcAmount} USDC refunded to Agent A wallet — escrow released` });
      onFail(escrowTx);
    },
  ];

  const DELAYS = [300, 900, 700, 1200, 2000, 1000];

  let elapsed = 0;
  steps.forEach((fn, i) => {
    elapsed += DELAYS[i];
    timers.push(setTimeout(fn, elapsed));
  });

  return () => timers.forEach(clearTimeout);
}
