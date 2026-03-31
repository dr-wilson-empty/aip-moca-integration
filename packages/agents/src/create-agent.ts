/**
 * Generic agent server factory.
 * Creates an Express HTTP server with:
 *   GET  /.well-known/agent.json  → Agent Card
 *   POST /a2a                     → JSON-RPC 2.0 (task/create, task/status)
 */
import express from "express";
import { askHaiku } from "./haiku.js";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentCard {
  did: string;
  name: string;
  version: string;
  endpoint: string;
  type: string;
  walletAddress: string;
  capabilities: Array<{
    id: string;
    description: string;
    pricing: { amount: string; token: string; network: string };
  }>;
}

export interface CapabilityPrompt {
  id: string;
  systemPrompt: string;
}

export interface AgentConfig {
  port: number;
  card: AgentCard;
  prompts: CapabilityPrompt[];
}

interface AgentTask {
  id: string;
  status: "WORKING" | "COMPLETED" | "FAILED";
  artifact?: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  JSON-RPC helpers                                                   */
/* ------------------------------------------------------------------ */

function jsonRpcOk(id: string | number, result: unknown) {
  return { jsonrpc: "2.0", result, id };
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", error: { code, message }, id };
}

/* ------------------------------------------------------------------ */
/*  Agent factory                                                      */
/* ------------------------------------------------------------------ */

export function createAgent(config: AgentConfig) {
  const app = express();
  app.use(express.json());

  const tasks = new Map<string, AgentTask>();
  const promptMap = new Map(config.prompts.map((p) => [p.id, p.systemPrompt]));

  // ---- Agent Card endpoint ----
  app.get("/.well-known/agent.json", (_req, res) => {
    res.json(config.card);
  });

  // ---- JSON-RPC 2.0 endpoint ----
  app.post("/a2a", async (req, res) => {
    const { jsonrpc, method, params, id } = req.body ?? {};

    if (jsonrpc !== "2.0" || !method || id === undefined) {
      return res.json(jsonRpcError(id ?? null, -32600, "Invalid JSON-RPC request"));
    }

    // ---- task/create ----
    if (method === "task/create") {
      const { capability, input, taskId } = params ?? {};
      if (!capability || !input) {
        return res.json(jsonRpcError(id, -32602, "Missing capability or input"));
      }

      const systemPrompt = promptMap.get(capability);
      if (!systemPrompt) {
        return res.json(jsonRpcError(id, -32602, `Unsupported capability: ${capability}`));
      }

      const agentTaskId = taskId || `atask_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      tasks.set(agentTaskId, { id: agentTaskId, status: "WORKING" });

      // Return immediately with WORKING status
      res.json(jsonRpcOk(id, { taskId: agentTaskId, status: "WORKING" }));

      // Process in background with Claude Haiku
      try {
        const artifact = await askHaiku(systemPrompt, input);
        tasks.set(agentTaskId, { id: agentTaskId, status: "COMPLETED", artifact });
        console.log(`  [${config.card.name}] Task ${agentTaskId} completed`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        tasks.set(agentTaskId, { id: agentTaskId, status: "FAILED", error: message });
        console.error(`  [${config.card.name}] Task ${agentTaskId} failed:`, message);
      }

      return;
    }

    // ---- task/status ----
    if (method === "task/status") {
      const { taskId } = params ?? {};
      if (!taskId) {
        return res.json(jsonRpcError(id, -32602, "Missing taskId"));
      }

      const task = tasks.get(taskId);
      if (!task) {
        return res.json(jsonRpcError(id, -32001, `Task not found: ${taskId}`));
      }

      return res.json(jsonRpcOk(id, {
        taskId: task.id,
        status: task.status,
        ...(task.artifact ? { artifact: task.artifact } : {}),
        ...(task.error ? { error: task.error } : {}),
      }));
    }

    return res.json(jsonRpcError(id, -32601, `Unknown method: ${method}`));
  });

  // ---- Start ----
  function start() {
    app.listen(config.port, () => {
      console.log(`[${config.card.name}] listening on http://localhost:${config.port}`);
      console.log(`  Agent Card: http://localhost:${config.port}/.well-known/agent.json`);
      console.log(`  A2A:        http://localhost:${config.port}/a2a`);
      console.log(`  Capabilities: ${config.prompts.map((p) => p.id).join(", ")}`);
    });
  }

  return { app, start };
}
