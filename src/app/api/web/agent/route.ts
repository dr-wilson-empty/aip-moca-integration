import { NextRequest, NextResponse } from "next/server";
import { webSearch, formatSearchResults } from "@/lib/web/search";

/**
 * POST /api/web/agent
 * JSON-RPC 2.0 endpoint for the platform-hosted Web Search Agent.
 *
 * This is an INTELLIGENT search agent:
 * 1. Searches the web via Tavily API
 * 2. Analyzes results with Claude Haiku
 * 3. Returns a structured, actionable answer — not raw links
 */

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: Record<string, unknown>;
  id: string | number;
}

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

    tasks.set(taskId, { status: "WORKING" });

    const response = NextResponse.json({
      jsonrpc: "2.0",
      result: { taskId, status: "WORKING" },
      id,
    });

    // Search + analyze in background
    (async () => {
      try {
        // Step 1: Search the web
        const searchResult = await webSearch(input, 8);
        const rawResults = formatSearchResults(searchResult);

        // Step 2: Analyze with Claude Haiku — produce structured answer
        const analyzed = await analyzeSearchResults(input, rawResults);
        tasks.set(taskId, { status: "COMPLETED", artifact: analyzed });
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

/** GET — agent card */
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

/* ------------------------------------------------------------------ */
/*  AI Analysis Layer                                                  */
/* ------------------------------------------------------------------ */

/**
 * Analyze raw search results with Claude Haiku.
 * Produces a structured, actionable answer instead of raw links.
 */
async function analyzeSearchResults(userQuery: string, rawResults: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return rawResults; // fallback to raw if no key

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system:
        "You are a web research analyst. The user asked a question and I searched the web for them. " +
        "Analyze the search results and produce a CLEAR, STRUCTURED answer.\n\n" +
        "RULES:\n" +
        "- Extract specific data from results: prices, ratings, seller names, direct URLs\n" +
        "- If the user asks for cheapest/best: rank the options and give a clear verdict\n" +
        "- Include DIRECT seller links (not comparison sites) when possible\n" +
        "- Format prices clearly with currency\n" +
        "- If comparing products/sellers, use a table format\n" +
        "- End with a clear recommendation based on what the user asked\n" +
        "- Answer in the same language as the user's query\n" +
        "- Do NOT just list links — analyze, compare, and recommend\n" +
        "- If data is incomplete, say what you found and what needs more research",
      messages: [{
        role: "user",
        content: `User query: "${userQuery}"\n\nSearch results:\n${rawResults}`,
      }],
    });

    const block = response.content[0];
    if (block.type === "text") return block.text;
    return rawResults;
  } catch {
    return rawResults; // fallback to raw results if analysis fails
  }
}
