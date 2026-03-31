/**
 * A2A Dispatcher — replaces demo-agent.ts for real agent communication.
 *
 * Sends tasks to real agent services via HTTP JSON-RPC 2.0,
 * polls for results, and drives the task state machine.
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Dispatch a task to a real agent service.
 * Drives the protocol state machine and SSE events.
 */
export async function dispatchToAgent(
  taskId: string,
  agentEndpoint: string,
  agentName: string,
  capability: string,
  input: string,
  escrowTxHash: string,
  onSettle: (action: "release" | "refund") => Promise<string | null>
): Promise<void> {
  try {
    // Step 1: Identity verification (simulated — real DID verify in future)
    await sleep(200);
    verifyIdentity(taskId, 20 + Math.floor(Math.random() * 40));

    // Step 2: Payment lock confirmation (already on-chain)
    await sleep(300);
    lockPayment(taskId);
    await sleep(200);
    confirmPaymentLock(taskId, escrowTxHash);

    // Step 3: Send request to agent
    await sleep(200);
    sendRequest(taskId);

    logger.info("a2a", "dispatching", { taskId, agentEndpoint, capability });

    // Step 4: Execute task via real HTTP JSON-RPC
    let accepted = false;
    const result = await executeTask(
      agentEndpoint,
      capability,
      input,
      taskId,
      500,   // poll every 500ms
      60     // max 30 seconds
    );

    // Accept task on first successful response
    if (!accepted) {
      accepted = true;
      acceptTask(taskId);
    }

    // Step 5: Settlement based on result
    if (result.status === "COMPLETED" && result.artifact) {
      logger.info("a2a", "completed", { taskId, agentName });
      const settlementTxHash = await onSettle("release");
      completeTask(taskId, result.artifact, settlementTxHash ?? undefined);
    } else {
      const reason = result.error || "Agent returned FAILED status";
      logger.error("a2a", "failed", { taskId, agentName, reason });
      await onSettle("refund");
      failTask(taskId, reason);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("a2a", "dispatch_error", { taskId, error: message });

    try {
      // Try to accept first if not yet accepted, so failTask works
      try { acceptTask(taskId); } catch { /* already accepted or wrong state */ }
      await onSettle("refund");
      failTask(taskId, `Agent communication failed: ${message}`);
    } catch {
      // Task may already be in a terminal state
    }
  }
}
