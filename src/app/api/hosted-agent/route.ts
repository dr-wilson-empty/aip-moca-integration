import { NextRequest, NextResponse } from "next/server";
import { getHostedAgent, loadHostedAgentsFromDb } from "@/lib/hosted-agents";
import { orchestrateTask } from "@/lib/protocol/agent-orchestrator";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";
import { autoEnrichWithWebData, getCurrentDateString } from "@/lib/web/realtime-enrichment";
import { executeWithMcpTools } from "@/lib/mcp/tool-executor";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Hosted Agent JSON-RPC Endpoint
 *
 * Acts as the A2A endpoint for no-code agents.
 * When a task comes in, the platform makes the AI call
 * using the platform's API key (tier=platform) or user's key (tier=custom).
 *
 * Supports: task/create, task/status
 * Query: ?agentId=xxx
 */

// In-memory task results for hosted agents (auto-cleaned after 1 hour)
const HOSTED_TASK_TTL_MS = 60 * 60 * 1000;
const g = globalThis as typeof globalThis & {
  __aip_hosted_tasks?: Map<string, { status: string; artifact?: string; error?: string }>;
};
if (!g.__aip_hosted_tasks) g.__aip_hosted_tasks = new Map();
const hostedTasks = g.__aip_hosted_tasks;

function scheduleHostedTaskCleanup(taskId: string): void {
  setTimeout(() => { hostedTasks.delete(taskId); }, HOSTED_TASK_TTL_MS);
}


interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
  id: string | number;
}

function rpcError(id: string | number, code: number, message: string) {
  return NextResponse.json({
    jsonrpc: "2.0",
    error: { code, message },
    id,
  });
}

function rpcResult(id: string | number, result: unknown) {
  return NextResponse.json({
    jsonrpc: "2.0",
    result,
    id,
  });
}

/**
 * GET — returns agent card (.well-known/agent.json equivalent)
 */
export async function GET(request: NextRequest) {
  await loadHostedAgentsFromDb();
  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  const config = getHostedAgent(agentId);
  if (!config) {
    return NextResponse.json({ error: "Hosted agent not found" }, { status: 404 });
  }

  return NextResponse.json({
    did: canonicalAgentDid(config.ownerAddress, agentId),
    name: config.name,
    version: "1.0.0",
    endpoint: `/api/hosted-agent?agentId=${agentId}`,
    type: "Task",
    capabilities: config.capabilities,
    walletAddress: config.ownerAddress,
    hosted: true,
    hasMcp: config.mcpServers && config.mcpServers.length > 0,
  });
}

/**
 * POST — JSON-RPC 2.0 handler for task/create and task/status
 */
export async function POST(request: NextRequest) {
  await loadHostedAgentsFromDb();
  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "agentId query param required" }, { status: 400 });
  }

  const config = getHostedAgent(agentId);
  if (!config || !config.active) {
    return NextResponse.json({ error: "Hosted agent not found or inactive" }, { status: 404 });
  }

  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return rpcError(body.id ?? 0, -32600, "Invalid JSON-RPC request");
  }

  // ---- task/create ----
  if (body.method === "task/create") {
    const { capability, input, taskId } = body.params as {
      capability?: string;
      input?: string;
      taskId?: string;
    };

    if (!capability || !input) {
      return rpcError(body.id, -32602, "Missing capability or input");
    }

    // Verify capability exists
    const cap = config.capabilities.find((c) => c.id === capability);
    if (!cap) {
      return rpcError(body.id, -32602, `Unknown capability: ${capability}`);
    }

    const tid = taskId || `hosted_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Mark as WORKING immediately
    hostedTasks.set(tid, { status: "WORKING" });

    // Process asynchronously
    processHostedTask(tid, config, input).catch((err) => {
      hostedTasks.set(tid, {
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return rpcResult(body.id, { taskId: tid, status: "WORKING" });
  }

  // ---- task/status ----
  if (body.method === "task/status") {
    const { taskId } = body.params as { taskId?: string };
    if (!taskId) {
      return rpcError(body.id, -32602, "Missing taskId");
    }

    const task = hostedTasks.get(taskId);
    if (!task) {
      return rpcError(body.id, -32602, "Task not found");
    }

    return rpcResult(body.id, {
      taskId,
      status: task.status,
      artifact: task.artifact,
      error: task.error,
    });
  }

  return rpcError(body.id, -32601, `Unknown method: ${body.method}`);
}

/**
 * Process hosted agent task using the configured AI provider.
 */
async function processHostedTask(
  taskId: string,
  config: import("@/lib/hosted-agents").HostedAgentConfig,
  input: string
): Promise<void> {
  try {
    let result: string;

    // Orchestration mode: agent autonomously delegates to other agents
    if (config.canOrchestrate) {
      const agentDid = canonicalAgentDid(config.ownerAddress, config.agentId);
      const orchResult = await orchestrateTask(agentDid, config.name, config.systemPrompt, input, config.ownerAddress, undefined, config.mcpServers);

      const subTaskInfo = orchResult.subTasks
        .filter((s) => s.status === "completed")
        .map((s) => `${s.agentName} (${s.capabilityId}) — ${s.cost.toFixed(2)} USDC`)
        .join("\n");

      result = orchResult.answer +
        `\n\n---\n**${config.name}** orchestrated ${orchResult.stepsCompleted} agent(s), spent ${orchResult.totalSpent.toFixed(2)} USDC from budget` +
        (subTaskInfo ? `\n${subTaskInfo}` : "");
    } else if (config.mcpServers && config.mcpServers.length > 0) {
      // MCP-enabled agent: use tool calling loop
      const mcpResult = await executeWithMcpTools(config, input);
      const toolInfo = mcpResult.toolCalls.length > 0
        ? `\n\n---\n*Used ${mcpResult.toolCalls.length} MCP tool call(s) in ${mcpResult.iterationsUsed} iteration(s): ${mcpResult.toolCalls.map((t) => t.toolName).join(", ")}*`
        : "";
      result = mcpResult.text + toolInfo;
    } else if (config.provider === "anthropic") {
      result = await callAnthropic(config, input);
    } else if (config.provider === "openai") {
      result = await callOpenAI(config, input);
    } else {
      result = await callAnthropic(config, input);
    }

    hostedTasks.set(taskId, { status: "COMPLETED", artifact: result });
    scheduleHostedTaskCleanup(taskId);
  } catch (err) {
    hostedTasks.set(taskId, {
      status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
    });
    scheduleHostedTaskCleanup(taskId);
  }
}

async function callAnthropic(
  config: import("@/lib/hosted-agents").HostedAgentConfig,
  input: string
): Promise<string> {
  const apiKey = config.tier === "custom" && config.customApiKey
    ? config.customApiKey
    : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("No Anthropic API key available");
  }

  // Auto-enrich with web data if query needs current information
  const enrichment = await autoEnrichWithWebData(input);
  const enrichedInput = enrichment.enriched
    ? `${input}\n\n${enrichment.webContext}`
    : input;

  const systemWithDate = `${getCurrentDateString()}\n\n${config.systemPrompt}`;

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: systemWithDate,
    messages: [{ role: "user", content: enrichedInput }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text ?? "No response";
}

async function callOpenAI(
  config: import("@/lib/hosted-agents").HostedAgentConfig,
  input: string
): Promise<string> {
  const apiKey = config.customApiKey;
  if (!apiKey) {
    throw new Error("OpenAI requires your own API key");
  }

  // Auto-enrich with web data if query needs current information
  const enrichment = await autoEnrichWithWebData(input);
  const enrichedInput = enrichment.enriched
    ? `${input}\n\n${enrichment.webContext}`
    : input;

  const systemWithDate = `${getCurrentDateString()}\n\n${config.systemPrompt}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemWithDate },
        { role: "user", content: enrichedInput },
      ],
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "No response";
}
