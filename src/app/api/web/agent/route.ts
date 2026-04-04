import { NextRequest, NextResponse } from "next/server";
import { webSearch, formatSearchResults } from "@/lib/web/search";

/**
 * POST /api/web/agent
 * JSON-RPC 2.0 endpoint for the platform-hosted Web Search Agent.
 * Compatible with the A2A protocol — receives task/create, returns results.
 *
 * This agent searches the web via Tavily API and returns formatted results.
 */

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: Record<string, unknown>;
  id: string | number;
}

// In-memory task store for this agent
const tasks = new Map<string, { status: string; artifact?: string; error?: string }>();

export async function POST(request: NextRequest) {
  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
  }

  const { method, params, id } = body;

  if (method === "task/create") {
    const input = (params?.input as string) || "";
    const taskId = (params?.taskId as string) || `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Mark as working
    tasks.set(taskId, { status: "WORKING" });

    // Return immediately, process in background
    const response = NextResponse.json({
      jsonrpc: "2.0",
      result: { taskId, status: "WORKING" },
      id,
    });

    // Execute search in background
    (async () => {
      try {
        const searchResult = await webSearch(input, 5);
        const formatted = formatSearchResults(searchResult);
        tasks.set(taskId, { status: "COMPLETED", artifact: formatted });
      } catch (err) {
        tasks.set(taskId, {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return response;
  }

  if (method === "task/status") {
    const taskId = params?.taskId as string;
    if (!taskId) {
      return NextResponse.json({ jsonrpc: "2.0", error: { code: -32602, message: "Missing taskId" }, id });
    }

    const task = tasks.get(taskId);
    if (!task) {
      return NextResponse.json({ jsonrpc: "2.0", error: { code: -32001, message: "Task not found" }, id });
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      result: {
        taskId,
        status: task.status,
        ...(task.artifact ? { artifact: task.artifact } : {}),
        ...(task.error ? { error: task.error } : {}),
      },
      id,
    });
  }

  return NextResponse.json({ jsonrpc: "2.0", error: { code: -32601, message: `Unknown method: ${method}` }, id });
}

/** GET /.well-known/agent.json equivalent — agent card */
export async function GET() {
  return NextResponse.json({
    did: "did:aip:platform:web-search",
    name: "Web Search Agent",
    version: "1.0.0",
    endpoint: "http://localhost:3000/api/web/agent",
    type: "Task",
    capabilities: [{
      id: "web.search",
      description: "Web Search",
      pricing: { amount: "0.02", token: "USDC", network: "solana" },
    }],
  });
}
