/**
 * A2A JSON-RPC 2.0 HTTP client.
 * Sends requests to agent services and polls for results.
 */

/* Per-endpoint concurrent task limiter */
const MAX_CONCURRENT_PER_AGENT = 5;
const activeTasks = new Map<string, number>();

function acquireSlot(endpoint: string): boolean {
  const current = activeTasks.get(endpoint) ?? 0;
  if (current >= MAX_CONCURRENT_PER_AGENT) return false;
  activeTasks.set(endpoint, current + 1);
  return true;
}

function releaseSlot(endpoint: string): void {
  const current = activeTasks.get(endpoint) ?? 0;
  if (current <= 1) activeTasks.delete(endpoint);
  else activeTasks.set(endpoint, current - 1);
}

let _rpcId = 0;

function nextRpcId(): string {
  return `rpc_${++_rpcId}_${Date.now()}`;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  result?: T;
  error?: { code: number; message: string };
  id: string | number;
}

export interface TaskCreateResult {
  taskId: string;
  status: "WORKING";
}

export interface TaskStatusResult {
  taskId: string;
  status: "WORKING" | "COMPLETED" | "FAILED";
  artifact?: string;
  error?: string;
}

/**
 * Send task/create to an agent endpoint with retry (max 3 attempts, exponential backoff).
 * Retries only on 429 and 5xx errors. 4xx errors (except 429) fail immediately.
 */
export async function sendTaskCreate(
  endpoint: string,
  params: { capability: string; input: string; taskId?: string }
): Promise<TaskCreateResult> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const rpcId = nextRpcId();

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "task/create",
          params,
          id: rpcId,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      // Network error — retry if attempts remain
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw new Error("Agent is not reachable. Please check the agent is running and try again.");
    }

    if (res.ok) {
      const data = (await res.json()) as JsonRpcResponse<TaskCreateResult>;
      if (data.error) {
        throw new Error(`Agent error: ${data.error.message}`);
      }
      return data.result!;
    }

    // Non-retryable errors
    if (res.status === 404) {
      const isHosted = endpoint.includes("/api/hosted-agent");
      throw new Error(
        isHosted
          ? `Hosted agent not found or inactive. Re-register the agent in My Agents. (${endpoint})`
          : `Agent service offline or not reachable at ${endpoint}`
      );
    }
    if (res.status < 500 && res.status !== 429) {
      throw new Error(`Agent returned an error (${res.status}). Please try again.`);
    }

    // Retryable: 429 or 5xx
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      continue;
    }

    throw new Error(
      res.status === 429
        ? "Agent is busy. Please try again in a moment."
        : "Agent is experiencing issues. Please try again later."
    );
  }

  throw new Error("Agent request failed after retries.");
}

/**
 * Poll task/status from an agent endpoint.
 */
export async function pollTaskStatus(
  endpoint: string,
  taskId: string
): Promise<TaskStatusResult> {
  const rpcId = nextRpcId();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "task/status",
      params: { taskId },
      id: rpcId,
    }),
    signal: AbortSignal.timeout(5000), // 5s timeout for status poll
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Agent lost connection during task execution. The agent may have restarted.");
    }
    throw new Error(
      res.status >= 500
        ? "Agent is experiencing issues during task execution. Please try again."
        : `Agent returned an error during execution (${res.status}).`
    );
  }

  const data = (await res.json()) as JsonRpcResponse<TaskStatusResult>;
  if (data.error) {
    throw new Error(`Agent error: ${data.error.message}`);
  }
  return data.result!;
}

/**
 * Execute a hosted agent directly (no HTTP self-call).
 * Calls processHostedTask in-process, then reads result from hostedTasks map.
 */
async function executeHostedAgentDirect(
  agentId: string,
  capability: string,
  input: string,
  taskId?: string,
): Promise<TaskStatusResult> {
  const { getHostedAgent } = await import("@/lib/hosted-agents");
  const config = getHostedAgent(agentId);
  if (!config) {
    return { taskId: taskId || "", status: "FAILED", error: `Hosted agent not found: ${agentId}` };
  }

  const id = taskId || `ht_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const { processHostedTask, getHostedTaskResult } = await import("@/app/api/hosted-agent/route");
  await processHostedTask(id, config, input);

  const result = getHostedTaskResult(id);
  if (result) return { taskId: id, ...result };
  return { taskId: id, status: "FAILED", error: "No result from hosted agent" };
}

/**
 * Send task/create and poll until completion or failure.
 * For hosted agents: calls directly in-process (avoids HTTP self-call on serverless).
 * For external agents: uses HTTP JSON-RPC.
 */
export async function executeTask(
  endpoint: string,
  capability: string,
  input: string,
  taskId?: string,
  pollIntervalMs = 500,
  maxPollAttempts = 60
): Promise<TaskStatusResult> {
  // Hosted agent shortcut — direct function call instead of HTTP
  const hostedMatch = endpoint.match(/[?&]agentId=([^&]+)/);
  if (hostedMatch && endpoint.includes("/api/hosted-agent")) {
    return executeHostedAgentDirect(hostedMatch[1], capability, input, taskId);
  }

  // Web agent shortcut — direct function call
  if (endpoint.includes("/api/web/agent")) {
    const { executeWebSearch } = await import("@/app/api/web/agent/route");
    const wsResult = await executeWebSearch(input, taskId);
    return { taskId: taskId || `ws_${Date.now()}`, ...wsResult };
  }

  if (!acquireSlot(endpoint)) {
    throw new Error("Agent is at capacity. Too many concurrent requests — please wait and try again.");
  }

  try {
    const createResult = await sendTaskCreate(endpoint, { capability, input, taskId });
    const agentTaskId = createResult.taskId;

    for (let i = 0; i < maxPollAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      const status = await pollTaskStatus(endpoint, agentTaskId);
      if (status.status === "COMPLETED" || status.status === "FAILED") {
        return status;
      }
    }

    throw new Error("Task timed out. The agent took too long to respond. Please try again.");
  } finally {
    releaseSlot(endpoint);
  }
}
