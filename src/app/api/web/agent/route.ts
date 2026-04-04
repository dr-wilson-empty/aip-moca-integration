import { NextRequest, NextResponse } from "next/server";
import {
  webSearch,
  multiSearch,
  formatSearchResults,
  formatMultiSearchResults,
  type SearchResult,
} from "@/lib/web/search";

/**
 * POST /api/web/agent
 * JSON-RPC 2.0 — Intelligent Web Search Agent.
 *
 * Two-phase search:
 * 1. Primary search (advanced + raw_content) — gets initial results
 * 2. Haiku analyzes results and decides if more searches needed
 * 3. If needed: agent runs targeted follow-up searches automatically
 * 4. Final analysis with all data — structured, accurate answer
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

    // Intelligent search pipeline in background
    (async () => {
      try {
        const artifact = await intelligentSearch(input);
        tasks.set(taskId, { status: "COMPLETED", artifact });
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

export async function GET() {
  return NextResponse.json({
    did: "did:aip:platform:web-search",
    name: "Web Search Agent",
    version: "2.0.0",
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
/*  Intelligent Search Pipeline                                        */
/* ------------------------------------------------------------------ */

async function intelligentSearch(userQuery: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const result = await webSearch(userQuery, 8);
    return formatSearchResults(result);
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  // Phase 1: Primary search (advanced depth + raw content)
  const primaryResult = await webSearch(userQuery, 8, "advanced", true);
  const primaryData = formatSearchResults(primaryResult);

  // Phase 2: Ask Haiku if follow-up searches are needed
  const planResponse = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system:
      "You are a search strategist. Analyze the initial search results and decide if follow-up searches are needed for a complete answer.\n\n" +
      "If the results already contain enough specific data (exact prices, seller names, direct URLs, ratings), respond:\n" +
      '{"needsMore": false}\n\n' +
      "If the results are incomplete (only comparison sites, no direct prices, missing sellers), suggest 1-3 targeted follow-up queries:\n" +
      '{"needsMore": true, "queries": ["specific query 1", "specific query 2"]}\n\n' +
      "Follow-up query tips:\n" +
      "- Target specific sellers: 'product name site:trendyol.com fiyat'\n" +
      "- Target specific data: 'product name review rating'\n" +
      "- Be specific, not generic\n\n" +
      "Respond with ONLY JSON.",
    messages: [{
      role: "user",
      content: `User query: "${userQuery}"\n\nInitial results summary:\n${primaryResult.results.map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n   ${r.content.slice(0, 150)}`).join("\n")}`,
    }],
  });

  let allResults: SearchResult[] = [...primaryResult.results];
  let searchQueries = [userQuery];

  // Phase 3: Run follow-up searches if needed
  const planText = planResponse.content[0];
  if (planText.type === "text") {
    try {
      const jsonMatch = planText.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        if (plan.needsMore && plan.queries?.length > 0) {
          const followUpQueries = (plan.queries as string[]).slice(0, 3);
          searchQueries.push(...followUpQueries);

          const { allResults: moreResults } = await multiSearch(followUpQueries, 5);

          // Merge and deduplicate
          const seenUrls = new Set(allResults.map((r) => r.url));
          for (const r of moreResults) {
            if (!seenUrls.has(r.url)) {
              seenUrls.add(r.url);
              allResults.push(r);
            }
          }
        }
      }
    } catch { /* proceed with primary results */ }
  }

  // Phase 4: Final analysis with all collected data
  const allData = formatMultiSearchResults(searchQueries, allResults);

  const finalResponse = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    system:
      "You are a web research analyst producing the FINAL answer for the user.\n\n" +
      "You have comprehensive search data including full page content from multiple sources.\n\n" +
      "CRITICAL RULES:\n" +
      "- Extract EXACT prices from the page content — do not guess or approximate\n" +
      "- EVERY product, seller, or resource MUST have a clickable markdown link: [Name](url)\n" +
      "- Use the EXACT URLs from the search results\n" +
      "- If comparing prices: create a clear ranked list, cheapest first\n" +
      "- Format: **Satıcı** — Fiyat — [Ürüne Git](url)\n" +
      "- End with a clear verdict: 'En uygun: [Satıcı](url) — Fiyat'\n" +
      "- Answer in the same language as the user's query\n" +
      "- Only report prices you can verify from the page content\n" +
      "- If a price seems outdated or uncertain, note it\n" +
      "- Do NOT invent or hallucinate any URLs or prices",
    messages: [{
      role: "user",
      content: `User query: "${userQuery}"\n\nCollected web data (${searchQueries.length} searches, ${allResults.length} results):\n\n${allData}\n\nREMINDER: Every item MUST include its [clickable link](url). Extract EXACT prices from page content. Rank from cheapest to most expensive.`,
    }],
  });

  const finalBlock = finalResponse.content[0];
  if (finalBlock.type === "text") return finalBlock.text;
  return allData;
}
