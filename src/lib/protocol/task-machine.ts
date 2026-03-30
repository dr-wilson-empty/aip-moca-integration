import type { TaskState, LogEntry } from "@/types/aip";

/* ------------------------------------------------------------------ */
/*  Task Record                                                        */
/* ------------------------------------------------------------------ */

export interface TaskRecord {
  id: string;
  callerDid: string;
  callerAddress: string;
  agentDid: string;
  agentName: string;
  agentAddress: string;
  capability: string;
  input: string;
  amount: string;
  state: TaskState;
  escrowTxHash: string;
  settlementTxHash?: string;
  artifact?: string;
  failReason?: string;
  log: LogEntry[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  In-memory store (globalThis ile HMR-safe)                          */
/* ------------------------------------------------------------------ */

const g = globalThis as typeof globalThis & {
  __aip_tasks?: Map<string, TaskRecord>;
  __aip_task_listeners?: Map<string, TaskEventListener[]>;
};
if (!g.__aip_tasks) g.__aip_tasks = new Map();
if (!g.__aip_task_listeners) g.__aip_task_listeners = new Map();

const tasks = g.__aip_tasks;

/* ------------------------------------------------------------------ */
/*  Event listener                                                     */
/* ------------------------------------------------------------------ */

type TaskEventListener = (taskId: string, entry: LogEntry, task: TaskRecord) => void;
const listeners = g.__aip_task_listeners;

export function onTaskEvent(taskId: string, listener: TaskEventListener): () => void {
  const existing = listeners.get(taskId) ?? [];
  existing.push(listener);
  listeners.set(taskId, existing);
  return () => {
    const arr = listeners.get(taskId);
    if (arr) {
      const idx = arr.indexOf(listener);
      if (idx >= 0) arr.splice(idx, 1);
    }
  };
}

function emit(taskId: string, entry: LogEntry, task: TaskRecord): void {
  const arr = listeners.get(taskId);
  if (arr) {
    for (const fn of arr) {
      try { fn(taskId, entry, task); } catch { /* ignore */ }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Log helper                                                         */
/* ------------------------------------------------------------------ */

let _logId = 0;

function addLog(task: TaskRecord, eventType: string, message: string): LogEntry {
  const entry: LogEntry = {
    id: `log_${++_logId}`,
    timestamp: new Date().toTimeString().slice(0, 8),
    eventType,
    message,
  };
  task.log.push(entry);
  task.updatedAt = new Date().toISOString();
  emit(task.id, entry, task);
  return entry;
}

/* ------------------------------------------------------------------ */
/*  State transitions                                                  */
/* ------------------------------------------------------------------ */

export function createTask(params: {
  id: string;
  callerDid: string;
  callerAddress: string;
  agentDid: string;
  agentName: string;
  agentAddress: string;
  capability: string;
  input: string;
  amount: string;
  escrowTxHash: string;
}): TaskRecord {
  const now = new Date().toISOString();
  const task: TaskRecord = {
    ...params,
    state: "SUBMITTED",
    log: [],
    createdAt: now,
    updatedAt: now,
  };
  tasks.set(task.id, task);
  addLog(task, "IDENTITY", `Verifying agent ${params.agentName} identity...`);
  return task;
}

export function verifyIdentity(taskId: string, durationMs: number): TaskRecord {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  addLog(task, "IDENTITY", `Identity verified in ${durationMs}ms`);
  return task;
}

export function lockPayment(taskId: string): TaskRecord {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  addLog(task, "PAYMENT", `Locking ${task.amount} USDC in escrow...`);
  return task;
}

export function confirmPaymentLock(taskId: string, txHash: string): TaskRecord {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  task.escrowTxHash = txHash;
  addLog(task, "PAYMENT", `Payment locked — tx: ${txHash.slice(0, 16)}...`);
  return task;
}

export function sendRequest(taskId: string): TaskRecord {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  addLog(task, "REQUEST", `Sending request to ${task.agentName}...`);
  return task;
}

export function acceptTask(taskId: string): TaskRecord {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.state !== "SUBMITTED") throw new Error(`Cannot accept task in state: ${task.state}`);
  task.state = "WORKING";
  addLog(task, "REQUEST", `${task.agentName} accepted — working on it`);
  addLog(task, "PROCESSING", "Agent is working on your request...");
  return task;
}

export function completeTask(taskId: string, artifact: string, settlementTxHash?: string): TaskRecord {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.state !== "WORKING") throw new Error(`Cannot complete task in state: ${task.state}`);
  task.state = "COMPLETED";
  task.artifact = artifact;
  if (settlementTxHash) task.settlementTxHash = settlementTxHash;
  addLog(task, "PROCESSING", "Task completed — result ready");
  addLog(task, "SETTLEMENT", "Verifying result and releasing payment...");
  addLog(task, "COMPLETE", `${task.amount} USDC released to ${task.agentName}`);
  return task;
}

export function failTask(taskId: string, reason: string): TaskRecord {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.state !== "WORKING" && task.state !== "SUBMITTED") {
    throw new Error(`Cannot fail task in state: ${task.state}`);
  }
  task.state = "FAILED";
  task.failReason = reason;
  addLog(task, "ERROR", reason);
  addLog(task, "REFUND", `${task.amount} USDC refunded to your wallet`);
  return task;
}

export function cancelTask(taskId: string): TaskRecord {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.state !== "SUBMITTED") throw new Error(`Cannot cancel task in state: ${task.state}`);
  task.state = "CANCELLED";
  addLog(task, "CANCELLED", "Task cancelled");
  return task;
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export function getTask(taskId: string): TaskRecord | null {
  return tasks.get(taskId) ?? null;
}

export function listTasks(): TaskRecord[] {
  return Array.from(tasks.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
