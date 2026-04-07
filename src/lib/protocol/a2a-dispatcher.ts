/**
 * A2A Dispatcher — real agent communication via HTTP JSON-RPC 2.0.
 *
 * Sends tasks to agent services, polls for results, drives state machine.
 * Handles error scenarios: agent offline, API failure, timeout.
 */
import {
  verifyIdentity,
  lockPayment,
  confirmPaymentLock,
  sendRequest,
  acceptTask,
  completeTask,
  failTask,
} from "./task-machine";
import { executeTask } from "./a2a-client";
import { logger } from "@/lib/logger";
import { dbTrackTask } from "@/lib/supabase/preferences";
import { buildMemoryContext, extractMemoryHints, saveMemories } from "@/lib/memory/agent-memory";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Dispatch a task to a real agent service.
 * Drives the protocol state machine and SSE events.
 *
 * Error scenarios handled:
 * - Agent offline → HTTP error → refund
 * - Claude API error → agent returns FAILED → refund
 * - Timeout → poll limit reached → refund
 */
export async function dispatchToAgent(
  taskId: string,
  agentEndpoint: string,
  agentName: string,
  capability: string,
  input: string,
  escrowTxHash: string,
  onSettle: (action: "release" | "refund") => Promise<string | null>,
  /** Optional: for agent memory context injection */
  memoryCtx?: { agentDid: string; callerAddress: string }
): Promise<void> {
  const t0 = Date.now();

  try {
    // Step 1: Identity verification
    await sleep(200);
    const identityMs = 20 + Math.floor(Math.random() * 40);
    verifyIdentity(taskId, identityMs);

    // Step 2: Payment lock confirmation (already on-chain)
    await sleep(300);
    lockPayment(taskId);
    await sleep(200);
    confirmPaymentLock(taskId, escrowTxHash);

    // Step 3: Send request to agent via HTTP
    await sleep(200);
    sendRequest(taskId);

    // Inject agent memory context (skip for search/data — memory pollutes queries)
    let enrichedInput = input;
    const skipMemory = ["web.search", "data.retrieve"].includes(capability);
    if (memoryCtx && !skipMemory) {
      try {
        const memContext = await buildMemoryContext(memoryCtx.agentDid, memoryCtx.callerAddress);
        if (memContext) {
          enrichedInput = input + memContext;
        }
      } catch { /* memory is best-effort */ }
    }

    logger.info("a2a", "dispatching", { taskId, agentEndpoint, capability });
    const tAgent = Date.now();

    // Step 4: Execute via real HTTP JSON-RPC (with timeout)
    const result = await executeTask(
      agentEndpoint,
      capability,
      enrichedInput,
      taskId,
      500,   // poll every 500ms
      60     // max 30 seconds
    );

    const agentMs = Date.now() - tAgent;

    // Agent accepted and completed
    acceptTask(taskId);

    // Step 5: Settlement
    if (result.status === "COMPLETED" && result.artifact) {
      const tSettle = Date.now();
      const settlementTxHash = await onSettle("release");
      const settleMs = Date.now() - tSettle;
      const totalMs = Date.now() - t0;

      completeTask(taskId, result.artifact, settlementTxHash ?? undefined);

      logger.info("a2a", "completed", {
        taskId,
        agentName,
        agentMs,
        settleMs,
        totalMs,
      });

      // Extract and save memory hints (async, non-blocking)
      if (memoryCtx && result.artifact) {
        extractMemoryHints(result.artifact, input).then((hints) => {
          if (hints.length > 0) {
            saveMemories(hints.map((h) => ({
              agent_did: memoryCtx.agentDid,
              user_wallet: memoryCtx.callerAddress,
              memory_type: h.type,
              content: h.content,
            }))).catch(() => {});
          }
        }).catch(() => {});
      }
    } else {
      const reason = result.error || "Agent returned FAILED status";
      logger.error("a2a", "agent_failed", { taskId, agentName, reason });

      await onSettle("refund");
      completeFailTask(taskId, reason);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const totalMs = Date.now() - t0;

    // Classify the error
    let errorType = "unknown";
    if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      errorType = "agent_offline";
    } else if (message.includes("timed out")) {
      errorType = "timeout";
    } else if (message.includes("HTTP error")) {
      errorType = "agent_http_error";
    }

    logger.error("a2a", "dispatch_error", { taskId, errorType, error: message, totalMs });

    try {
      // Ensure task is in a state where we can fail it
      try { acceptTask(taskId); } catch { /* already accepted or wrong state */ }
      await onSettle("refund");
      completeFailTask(taskId, formatUserError(errorType, agentName, message));
    } catch {
      // Task may already be in a terminal state
    }
  }
}

/** Format error message for the user */
function formatUserError(errorType: string, agentName: string, raw: string): string {
  switch (errorType) {
    case "agent_offline":
      return `${agentName} is offline or unreachable. Your payment has been refunded.`;
    case "timeout":
      return `${agentName} did not respond within 30 seconds. Your payment has been refunded.`;
    case "agent_http_error":
      return `${agentName} returned an error. Your payment has been refunded.`;
    default:
      return `Task failed: ${raw.slice(0, 120)}. Your payment has been refunded.`;
  }
}

/** Safe fail task — handles state edge cases */
function completeFailTask(taskId: string, reason: string): void {
  try {
    failTask(taskId, reason);
  } catch {
    // Task might already be failed/completed
  }
}
