/**
 * Web Search — Tavily Search API integration.
 *
 * Tavily is purpose-built for AI agents: returns clean, structured
 * search results with content snippets ready for LLM consumption.
 *
 * Free tier: 1000 credits/month, no credit card required.
 * We use search_depth="basic" (1 credit) for most queries.
 */
import { logger } from "@/lib/logger";

const TAVILY_API_URL = "https://api.tavily.com/search";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  responseTime: number;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Search API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Search the web using Tavily API.
 *
 * @param query — search query string
 * @param maxResults — number of results (default 5, max 10)
 * @param searchDepth — "basic" (1 credit) or "advanced" (2 credits)
 */
export async function webSearch(
  query: string,
  maxResults = 5,
  searchDepth: "basic" | "advanced" = "basic"
): Promise<SearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { query, results: [], responseTime: 0, error: "TAVILY_API_KEY not set" };
  }

  const t0 = Date.now();

  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: searchDepth,
        max_results: Math.min(maxResults, 10),
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error("web_search", "api_error", { query, status: res.status, error: errText });
      return { query, results: [], responseTime: Date.now() - t0, error: `Tavily API error: ${res.status}` };
    }

    const data = await res.json();
    const responseTime = Date.now() - t0;

    const results: SearchResult[] = (data.results ?? []).map((r: Record<string, unknown>) => ({
      title: r.title as string || "",
      url: r.url as string || "",
      content: r.content as string || "",
      score: r.score as number || 0,
    }));

    logger.info("web_search", "completed", {
      query,
      resultCount: results.length,
      responseTime,
    });

    return { query, results, responseTime };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("web_search", "failed", { query, error: msg });
    return { query, results: [], responseTime: Date.now() - t0, error: msg };
  }
}

/**
 * Format search results as text for agent consumption.
 */
export function formatSearchResults(response: SearchResponse): string {
  if (response.error) {
    return `[Web search failed: ${response.error}]`;
  }

  if (response.results.length === 0) {
    return `[No web results found for: "${response.query}"]`;
  }

  const lines = [`Web search results for: "${response.query}"\n`];

  for (let i = 0; i < response.results.length; i++) {
    const r = response.results[i];
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   URL: ${r.url}`);
    lines.push(`   ${r.content}`);
    lines.push("");
  }

  return lines.join("\n");
}
