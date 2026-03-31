/**
 * A2A JSON-RPC 2.0 HTTP client.
 * Sends requests to agent services and polls for results.
 */

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
 * Send task/create to an agent endpoint.
 */
export async function sendTaskCreate(
  endpoint: string,
  params: { capability: string; input: string; taskId?: string }
): Promise<TaskCreateResult> {
  const rpcId = nextRpcId();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "task/create",
      params,
      id: rpcId,
    }),
    signal: AbortSignal.timeout(10000), // 10s timeout for initial request
  });

  if (!res.ok) {
    throw new Error(`Agent HTTP error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as JsonRpcResponse<TaskCreateResult>;
  if (data.error) {
    throw new Error(`Agent RPC error: ${data.error.message}`);
  }
  return data.result!;
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
    throw new Error(`Agent HTTP error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as JsonRpcResponse<TaskStatusResult>;
  if (data.error) {
    throw new Error(`Agent RPC error: ${data.error.message}`);
  }
  return data.result!;
}

/**
 * Send task/create and poll until completion or failure.
 * Returns the final result.
 */
export async function executeTask(
  endpoint: string,
  capability: string,
  input: string,
  taskId?: string,
  pollIntervalMs = 500,
  maxPollAttempts = 60
): Promise<TaskStatusResult> {
  const createResult = await sendTaskCreate(endpoint, { capability, input, taskId });
  const agentTaskId = createResult.taskId;

  for (let i = 0; i < maxPollAttempts; i++) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const status = await pollTaskStatus(endpoint, agentTaskId);
    if (status.status === "COMPLETED" || status.status === "FAILED") {
      return status;
    }
  }

  throw new Error(`Task ${agentTaskId} timed out after ${maxPollAttempts * pollIntervalMs}ms`);
}
