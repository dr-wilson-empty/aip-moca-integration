/**
 * Web Search — Tavily Search API integration.
 *
 * Tavily is purpose-built for AI agents: returns clean, structured
 * search results with content ready for LLM consumption.
 *
 * Features:
 * - Advanced search depth for deeper results
 * - Raw content extraction for full page data
 * - Multi-query support for comprehensive research
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
  rawContent?: string;
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
 * @param maxResults — number of results (default 8, max 10)
 * @param searchDepth — "basic" (1 credit) or "advanced" (2 credits)
 * @param includeRawContent — include full page content (more data for analysis)
 */
export async function webSearch(
  query: string,
  maxResults = 8,
  searchDepth: "basic" | "advanced" = "advanced",
  includeRawContent = true
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
        include_raw_content: includeRawContent,
      }),
      signal: AbortSignal.timeout(20000), // 20s timeout for advanced searches
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
      rawContent: r.raw_content as string | undefined,
      score: r.score as number || 0,
    }));

    logger.info("web_search", "completed", {
      query,
      resultCount: results.length,
      responseTime,
      depth: searchDepth,
      rawContent: includeRawContent,
    });

    return { query, results, responseTime };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("web_search", "failed", { query, error: msg });
    return { query, results: [], responseTime: Date.now() - t0, error: msg };
  }
}

/**
 * Multi-query search — runs multiple searches and merges results.
 * Deduplicates by URL. Used for comprehensive research.
 */
export async function multiSearch(
  queries: string[],
  maxResultsPerQuery = 5
): Promise<{ allResults: SearchResult[]; totalTime: number }> {
  const t0 = Date.now();
  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  // Run all queries in parallel
  const responses = await Promise.all(
    queries.map((q) => webSearch(q, maxResultsPerQuery, "advanced", true))
  );

  for (const response of responses) {
    for (const result of response.results) {
      if (!seenUrls.has(result.url)) {
        seenUrls.add(result.url);
        allResults.push(result);
      }
    }
  }

  // Sort by relevance score
  allResults.sort((a, b) => b.score - a.score);

  return { allResults, totalTime: Date.now() - t0 };
}

/**
 * Format search results as text for agent consumption.
 * Includes raw content when available for richer analysis.
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

    // Include raw content excerpt for richer data (prices, details)
    if (r.rawContent) {
      const excerpt = r.rawContent.slice(0, 2000);
      lines.push(`   --- Page Content ---`);
      lines.push(`   ${excerpt}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format multi-search results.
 */
export function formatMultiSearchResults(
  queries: string[],
  allResults: SearchResult[]
): string {
  const lines = [`Web research results (${queries.length} searches, ${allResults.length} unique results)\n`];

  for (let i = 0; i < allResults.length; i++) {
    const r = allResults[i];
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   URL: ${r.url}`);
    lines.push(`   ${r.content}`);

    if (r.rawContent) {
      const excerpt = r.rawContent.slice(0, 2000);
      lines.push(`   --- Page Content ---`);
      lines.push(`   ${excerpt}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}
