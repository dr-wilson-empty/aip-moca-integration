/**
 * A2A-uyumlu JSON-RPC 2.0 mesaj tipleri.
 * Google A2A spesifikasyonuyla uyumlu format.
 */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
  id: string;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  id: string;
}

/* ------------------------------------------------------------------ */
/*  Task Method Params                                                 */
/* ------------------------------------------------------------------ */

export interface TaskCreateParams {
  taskId: string;
  capability: string;
  input: string;
  callerDid: string;
  callerAddress: string;
  paymentRef: string; // escrow tx hash
  amount: string;
}

export interface TaskAcceptResult {
  taskId: string;
  status: "WORKING";
  acceptedAt: string;
}

export interface TaskCompleteResult {
  taskId: string;
  status: "COMPLETED";
  artifact: string;
  completedAt: string;
}

export interface TaskFailResult {
  taskId: string;
  status: "FAILED";
  reason: string;
  failedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Builder helpers                                                    */
/* ------------------------------------------------------------------ */

let _rpcId = 0;

export function createJsonRpcRequest(
  method: string,
  params: Record<string, unknown>
): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    method,
    params,
    id: `rpc_${++_rpcId}_${Date.now()}`,
  };
}

export function createJsonRpcResponse(
  id: string,
  result: unknown
): JsonRpcResponse {
  return { jsonrpc: "2.0", result, id };
}

export function createJsonRpcError(
  id: string,
  code: number,
  message: string
): JsonRpcResponse {
  return { jsonrpc: "2.0", error: { code, message }, id };
}
