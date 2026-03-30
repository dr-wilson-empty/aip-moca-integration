import {
  verifyIdentity,
  lockPayment,
  confirmPaymentLock,
  sendRequest,
  acceptTask,
  completeTask,
  failTask,
} from "./task-machine";

/**
 * Mock artifact uretici — capability'ye gore sonuc dondurur.
 */
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

const FAIL_REASONS = [
  "Agent returned error: upstream API timeout after 30s",
  "Execution halted: insufficient compute resources on agent node",
  "Agent returned error: input exceeds maximum token limit (8192)",
  "Execution error: external data source returned 503 Service Unavailable",
];

/**
 * Demo ajan akisini simulate eder.
 * Gercek A2A protokol akisi: DID Verify -> Escrow Lock -> Task Sent -> Executing -> Settlement
 * Zamanlamayi gercekci tutar.
 *
 * @returns Promise that resolves when task completes or fails
 */
export function runDemoAgent(
  taskId: string,
  capabilityId: string,
  input: string,
  escrowTxHash: string,
  onSettle: (action: "release" | "refund") => Promise<string | null>
): Promise<void> {
  const willFail = Math.random() < 0.05; // %5 — test kolayligi icin dusuruldu

  return new Promise<void>((resolve) => {
    const steps: Array<{ fn: () => void | Promise<void>; delay: number }> = [
      // Step 1: DID verification
      {
        delay: 300,
        fn: () => verifyIdentity(taskId, 20 + Math.floor(Math.random() * 40)),
      },
      // Step 2: Payment lock confirmation
      {
        delay: 900,
        fn: () => {
          lockPayment(taskId);
        },
      },
      {
        delay: 700,
        fn: () => confirmPaymentLock(taskId, escrowTxHash),
      },
      // Step 3: Send request + accept
      {
        delay: 500,
        fn: () => sendRequest(taskId),
      },
      {
        delay: 700,
        fn: () => acceptTask(taskId),
      },
      // Step 4: Processing
      {
        delay: 1500,
        fn: async () => {
          if (willFail) {
            const reason = FAIL_REASONS[Math.floor(Math.random() * FAIL_REASONS.length)];
            failTask(taskId, reason);
            await onSettle("refund");
            resolve();
          } else {
            const artifact = ARTIFACTS[capabilityId]?.(input)
              ?? `Task completed. Result for capability "${capabilityId}" with input "${input.slice(0, 50)}..."`;
            const settlementTxHash = await onSettle("release");
            completeTask(taskId, artifact, settlementTxHash ?? undefined);
            resolve();
          }
        },
      },
    ];

    let elapsed = 0;
    for (const step of steps) {
      elapsed += step.delay;
      setTimeout(() => step.fn(), elapsed);
    }
  });
}
